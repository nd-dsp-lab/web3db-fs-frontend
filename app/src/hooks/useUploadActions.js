import { isTrashed, fullPathOf, joinPath, parentOf } from "../lib/paths";
import { TRASH_PREFIX } from "../lib/constants";

// Upload is the one action that doesn't go through prepareAndSign: the file
// body has to reach IPFS before there is a transaction to sign, so it posts
// through XHR (for progress) and signs whatever the backend prepares in reply.
// The same reply can carry follow-up grant transactions when the destination
// folder is shared.
export function useUploadActions({
  account, api, toast, pushToast, files, retrieveFiles,
  currentPath, uploadMode, setView, setCurrentPath, setSearchQuery, tx,
}) {
  const { signAndVerifyTransaction, reportTxError } = tx;

  // XHR instead of fetch: fetch can't report request-body upload progress
  const uploadWithProgress = (url, formData, onProgress) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch { /* non-JSON error body */ }
        resolve({ ok: xhr.status >= 200 && xhr.status < 300, data });
      };
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.send(formData);
    });

  // Jump to where a file lives: its folder in My Drive, the Shared view for
  // files shared to us, or Trash for trashed ones. Used by conflict toasts.
  const locateFile = (f) => {
    setSearchQuery("");
    if (isTrashed(f)) {
      setView("trash");
      const logical = fullPathOf(f).slice(TRASH_PREFIX.length);
      setCurrentPath(parentOf(logical));
    } else {
      setView(f.is_owner ? "my-drive" : "shared");
      setCurrentPath(f.folder_path || "/");
    }
  };

  // Conflict toast for a duplicate-content upload: actionable when the
  // existing copy is visible to us, explanatory otherwise.
  const reportDuplicate = (tId, uploadName, cid, owner) => {
    const existing = files.find((f) => f.cid === cid);
    const short = (a) => `${a.slice(0, 6)}...${a.slice(-4)}`;
    if (existing) {
      const where = isTrashed(existing) ? "your trash"
        : !existing.is_owner ? "Shared with me"
        : existing.folder_path || "/";
      const renamed = existing.filename !== uploadName ? ` as "${existing.filename}"` : "";
      toast.update(tId, `"${uploadName}" already exists${renamed} in ${where} (identical content)`, "info",
        { duration: 10000, action: { label: "Locate", onClick: () => locateFile(existing) } });
    } else {
      toast.update(tId, `An identical file was already uploaded by ${short(owner)} — content-addressed storage stores it once`, "error", { duration: 10000 });
    }
  };

  // Shared by the New-menu inputs and desktop drag-and-drop
  const submitUpload = async (endpoint, formData, count, firstName, onPrepared) => {
    const label = count > 1 ? `Uploading ${count} files` : `Uploading "${firstName}"`;
    const tId = toast.loading(`${label}… 0%`, { progress: 0 });
    try {
      let lastPct = -1;
      const response = await uploadWithProgress(api.url(endpoint), formData, (pct) => {
        if (pct === lastPct) return; // don't re-render on every byte event
        lastPct = pct;
        if (pct < 100) toast.update(tId, `${label}… ${pct}%`, "loading", { progress: pct });
        else toast.update(tId, "Processing on IPFS…", "loading", { progress: 100 });
      });

      const data = response.data;
      // Both endpoints return one transaction: single uploadFile, or one
      // uploadFiles batch covering the whole folder
      const uploadedCount = data.uploaded_files?.length || 1;
      const skipped = data.skipped_files?.length || 0;

      if (!response.ok || !data.transaction) {
        console.error("Upload prepare failed:", data);
        if (data.reason === "file_already_exists") {
          reportDuplicate(tId, firstName, data.cid, data.owner);
        } else if (skipped > 0) {
          const names = data.skipped_files.map((s) => s.filename);
          const listed = names.slice(0, 3).join(", ") + (names.length > 3 ? ` (+${names.length - 3} more)` : "");
          const single = skipped === 1 && files.find((f) => f.cid === data.skipped_files[0].cid);
          toast.update(tId, `Nothing to upload — already exist: ${listed}`, "info",
            single ? { duration: 10000, action: { label: "Locate", onClick: () => locateFile(single) } } : { duration: 8000 });
        } else {
          toast.update(tId, "Upload failed. Check console for details.", "error");
        }
        return;
      }
      onPrepared?.();
      await signAndVerifyTransaction(data.transaction, tId);

      // Inherited folder sharing: the destination folder is shared, so the
      // backend prepared grant txs (one per recipient) for the new files
      const shareTxs = data.share_transactions || [];
      let autoShareNote = "";
      if (shareTxs.length > 0) {
        try {
          for (let i = 0; i < shareTxs.length; i++) {
            toast.update(tId, `Sharing with folder members (${i + 1}/${shareTxs.length})…`, "loading");
            await signAndVerifyTransaction(shareTxs[i], tId);
          }
          const n = data.auto_shared_with.length;
          autoShareNote = ` — shared with ${n} ${n > 1 ? "people" : "person"}`;
        } catch (err) {
          console.error("Inherited share error:", err);
          pushToast("Uploaded, but sharing with folder members failed", "error");
        }
      }

      const skippedNote = skipped > 0 ? ` (${skipped} skipped — already exist)` : "";
      toast.update(tId, (uploadedCount > 1 ? `Uploaded ${uploadedCount} files` : `Uploaded "${firstName}"`) + autoShareNote + skippedNote, "success", { duration: skipped ? 8000 : undefined });
      retrieveFiles();
    } catch (err) {
      reportTxError("Upload", err, tId);
    }
  };

  const handleUpload = async (e) => {
    const inputFiles = e.target.files;
    if (!inputFiles?.length || !account) return;

    const formData = new FormData();
    formData.append("user_address", account);

    if (uploadMode === "folder") {
      for (const file of inputFiles) {
        const relative = file.webkitRelativePath || file.name;
        formData.append("files", file);
        formData.append("paths", joinPath(currentPath, relative));
      }
    } else {
      formData.append("file", inputFiles[0]);
      formData.append("folder_path", currentPath);
    }

    const endpoint = uploadMode === "folder" ? "/upload-folder" : "/upload";
    await submitUpload(endpoint, formData, inputFiles.length, inputFiles[0].name, () => { e.target.value = null; });
  };

  // Desktop drag-and-drop: items are [{ file, rel }] where rel keeps any
  // dropped-folder structure ("docs/sub/a.txt"). A single loose file goes
  // through /upload; everything else through /upload-folder (one batch tx).
  const handleDropUpload = async (items) => {
    if (!account) { toast.info("Sign in first"); return; }
    if (!items.length) return;

    const formData = new FormData();
    formData.append("user_address", account);

    let endpoint;
    if (items.length === 1 && !items[0].rel.includes("/")) {
      endpoint = "/upload";
      formData.append("file", items[0].file);
      formData.append("folder_path", currentPath);
    } else {
      endpoint = "/upload-folder";
      for (const { file, rel } of items) {
        formData.append("files", file);
        formData.append("paths", joinPath(currentPath, rel));
      }
    }
    await submitUpload(endpoint, formData, items.length, items[0].file.name);
  };

  return { handleUpload, handleDropUpload };
}
