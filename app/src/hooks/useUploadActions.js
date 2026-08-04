import { isTrashed, fullPathOf, joinPath, parentOf } from "../lib/paths";
import { TRASH_PREFIX } from "../lib/constants";
import { pendingUploadRow } from "./usePendingUploads";

// Upload is the one action that doesn't go through prepareAndSign: the file
// body has to reach IPFS before there is a transaction to sign, so it posts
// through XHR (for progress) and signs whatever the backend prepares in reply.
// The same reply can carry follow-up grant transactions when the destination
// folder is shared.
//
// It is also the one action that doesn't wait for its transactions to mine. The
// user has to be present for the signature and nothing else, so control comes
// back there: the file shows up straight away as a pending row and the receipts
// are confirmed in the background. Broadcasting is what commits the upload, so
// closing the tab mid-confirmation loses the refresh, not the file.
export function useUploadActions({
  account, api, toast, pushToast, files, retrieveFiles,
  currentPath, uploadMode, setView, setCurrentPath, setSearchQuery, tx,
  addPendingUploads, dropPendingUploads,
}) {
  const { signTransaction, verifyTransaction, reportTxError } = tx;

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

  // The rows to show while the transactions mine, read off the prepare
  // response: one file for /upload, the accepted subset for /upload-folder.
  // `sizes` is the local file sizes, keyed by whichever of full_path or
  // filename the caller could form (the two endpoints echo paths differently).
  const pendingRowsFor = (data, sizes) => {
    const rows = data.uploaded_files
      ? data.uploaded_files.map((u) => ({
          cid: u.cid, filename: u.filename, fullPath: u.full_path, fileFormat: u.file_format,
        }))
      : [{ cid: data.cid, filename: data.filename, fullPath: data.full_path, fileFormat: data.fileformat }];
    return rows.map((r) => pendingUploadRow({
      ...r,
      size: sizes[r.fullPath] ?? sizes[r.filename] ?? 0,
      owner: account,
    }));
  };

  // Sign the upload transaction and any inherited-share grants back to back.
  // No receipt wait between them: the backend prepares the grants with the
  // upload's nonce offset (see prepare_inherited_grant_transactions), so they
  // queue in the wallet and mine in order behind it. Returns the hashes to
  // confirm, plus the note for the toast.
  const signUploadTransactions = async (data, tId) => {
    const hashes = [await signTransaction(data.transaction, tId)];

    const shareTxs = data.share_transactions || [];
    let autoShareNote = "";
    if (shareTxs.length > 0) {
      try {
        for (let i = 0; i < shareTxs.length; i++) {
          toast.update(tId, `Sharing with folder members (${i + 1}/${shareTxs.length})…`, "loading");
          hashes.push(await signTransaction(shareTxs[i], tId));
        }
        const n = data.auto_shared_with.length;
        autoShareNote = ` — shared with ${n} ${n > 1 ? "people" : "person"}`;
      } catch (err) {
        // The upload itself is already broadcast, so this is a partial success:
        // the files land, the grants for the rest of the folder's members don't.
        console.error("Inherited share error:", err);
        pushToast("Uploaded, but sharing with folder members failed", "error");
      }
    }
    return { hashes, autoShareNote };
  };

  // Confirm the receipts after the user has been let go. Sequential because the
  // grants mine behind the upload anyway, and because each wait holds a backend
  // thread. The pending rows are dropped only after the refresh has landed, so
  // the file doesn't blink out of the list between the two.
  const confirmInBackground = async (hashes, rows, firstName) => {
    try {
      for (const hash of hashes) await verifyTransaction(hash);
      await retrieveFiles();
    } catch (err) {
      console.error("Upload confirmation failed:", err);
      pushToast(`"${firstName}" wasn't confirmed on-chain — it was not saved`, "error");
    } finally {
      dropPendingUploads(rows.map((r) => r.cid));
    }
  };

  // Shared by the New-menu inputs and desktop drag-and-drop
  const submitUpload = async (endpoint, formData, count, firstName, sizes, onPrepared) => {
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
      // Inherited folder sharing: the destination folder is shared, so the
      // backend prepared grant txs (one per recipient) for the new files
      const { hashes, autoShareNote } = await signUploadTransactions(data, tId);

      // Signed and broadcast — the user is done. Show the files as pending and
      // let the receipts confirm on their own.
      const rows = pendingRowsFor(data, sizes);
      addPendingUploads(rows);

      const skippedNote = skipped > 0 ? ` (${skipped} skipped — already exist)` : "";
      toast.update(tId, (uploadedCount > 1 ? `Uploaded ${uploadedCount} files` : `Uploaded "${firstName}"`) + autoShareNote + skippedNote + " — confirming on-chain", "success", { duration: skipped ? 8000 : undefined });
      confirmInBackground(hashes, rows, firstName);
    } catch (err) {
      reportTxError("Upload", err, tId);
    }
  };

  const handleUpload = async (e) => {
    const inputFiles = e.target.files;
    if (!inputFiles?.length || !account) return;

    const formData = new FormData();
    formData.append("user_address", account);
    const sizes = {};

    if (uploadMode === "folder") {
      for (const file of inputFiles) {
        const relative = file.webkitRelativePath || file.name;
        const path = joinPath(currentPath, relative);
        formData.append("files", file);
        formData.append("paths", path);
        sizes[path] = file.size;
      }
    } else {
      formData.append("file", inputFiles[0]);
      formData.append("folder_path", currentPath);
      sizes[inputFiles[0].name] = inputFiles[0].size;
    }

    const endpoint = uploadMode === "folder" ? "/upload-folder" : "/upload";
    await submitUpload(endpoint, formData, inputFiles.length, inputFiles[0].name, sizes, () => { e.target.value = null; });
  };

  // Desktop drag-and-drop: items are [{ file, rel }] where rel keeps any
  // dropped-folder structure ("docs/sub/a.txt"). A single loose file goes
  // through /upload; everything else through /upload-folder (one batch tx).
  const handleDropUpload = async (items) => {
    if (!account) { toast.info("Sign in first"); return; }
    if (!items.length) return;

    const formData = new FormData();
    formData.append("user_address", account);
    const sizes = {};

    let endpoint;
    if (items.length === 1 && !items[0].rel.includes("/")) {
      endpoint = "/upload";
      formData.append("file", items[0].file);
      formData.append("folder_path", currentPath);
      sizes[items[0].file.name] = items[0].file.size;
    } else {
      endpoint = "/upload-folder";
      for (const { file, rel } of items) {
        const path = joinPath(currentPath, rel);
        formData.append("files", file);
        formData.append("paths", path);
        sizes[path] = file.size;
      }
    }
    await submitUpload(endpoint, formData, items.length, items[0].file.name, sizes);
  };

  return { handleUpload, handleDropUpload };
}
