import { ensureSepolia, normalizeTxFields } from "../utils/helpers";
import { isTrashed, fullPathOf } from "../lib/paths";
import { TRASH_PREFIX } from "../lib/constants";

// All on-chain file/folder actions (share, move, rename, trash, restore,
// delete, bulk variants, upload) plus the sign/verify + error plumbing.
// Depends on transaction primitives and data from App.
export function useFileActions({
  account, api, toast, pushToast, user, getProvider, retrieveFiles, files, emptyFolders, setEmptyFolders, persistEmptyFolders, remapStarredFolders, currentPath, uploadMode, setView, setCurrentPath, setSearchQuery, confirm,
}) {
  // --- TRANSACTION SIGNING ---
  // Backend endpoints only *prepare* transactions; the user must sign and
  // broadcast via MetaMask, then the backend verifies the receipt on-chain.
  const signAndVerifyTransaction = async (transaction, tId) => {
    const provider = await getProvider();
    await ensureSepolia(provider);
    if (tId) toast.update(tId, "Waiting for signature…", "loading");
    const txHash = await provider.request({
      method: "eth_sendTransaction",
      params: [normalizeTxFields(transaction)],
    });
    if (tId) toast.update(tId, "Confirming on-chain…", "loading");

    const verifyResponse = await api.post("/verify-upload", { tx_hash: txHash });
    const verifyData = await verifyResponse.json();
    if (!verifyData.success) {
      throw new Error(verifyData.error || "Transaction verification failed");
    }
    return txHash;
  };

  const reportTxError = (action, err, tId) => {
    console.error(`${action} error:`, err);
    const rejected = err?.code === 4001;
    const msg = rejected ? "Transaction rejected" : `${action} failed: ${err?.message || err?.reason || String(err)}`;
    const type = rejected ? "info" : "error";
    if (tId) toast.update(tId, msg, type);
    else pushToast(msg, type);
  };

  // --- FILE ACTIONS (SHARE, UNSHARE, MOVE & DELETE) ---
  // Resolve an email to a wallet address via the backend (Privy lookup,
  // pregenerating a wallet for unknown emails). Raw 0x input passes through.
  const resolveRecipient = async (recipient) => {
    const response = await api.post("/resolve-recipient", { recipient });
    const data = await response.json();
    if (!response.ok || !data.address) {
      throw new Error(data.error || "Could not resolve recipient");
    }
    return data;
  };

  const handleShare = async (cid, recipient, filename) => {
    if (!account) return;
    let tId;
    try {
      let toAddress = recipient.trim();
      const recipientEmail = toAddress.includes("@") ? toAddress.toLowerCase() : null;
      if (!toAddress.startsWith("0x")) {
        const resolved = await resolveRecipient(toAddress);
        const note = resolved.pregenerated
          ? "\n\nThey haven't used Web3FS yet — a wallet was reserved for this email and the file will appear when they first log in."
          : "";
        const short = `${resolved.address.slice(0, 6)}...${resolved.address.slice(-4)}`;
        if (!(await confirm({ title: "Share file", message: `Share with ${toAddress} (${short})?${note}`, confirmLabel: "Share" }))) return;
        toAddress = resolved.address;
      }
      tId = toast.loading("Preparing share…");
      const response = await api.post("/share", { cid, to_address: toAddress, user_address: account });
      const data = await response.json();
      if (!data.transaction) {
        console.error("Share prepare failed:", data);
        toast.update(tId, "Share failed. Check console for details.", "error");
        return;
      }
      await signAndVerifyTransaction(data.transaction, tId);
      toast.update(tId, `Shared with ${recipient.trim()}`, "success");
      // Best-effort email notification once the share is on-chain
      if (recipientEmail) {
        const sharerName = user?.google?.name || user?.email?.address || `${account.slice(0, 6)}...${account.slice(-4)}`;
        api.post("/notify-share", {
          recipient_email: recipientEmail,
          filename: filename || "a file",
          sharer: sharerName,
        }).then(async (r) => {
          const d = await r.json().catch(() => ({}));
          if (r.ok) console.log("Share notification sent to", recipientEmail);
          else console.warn("Share notification failed:", d.error);
        }).catch((e) => console.warn("Share notification failed:", e));
      }
      retrieveFiles();
    } catch (err) {
      reportTxError("Share", err, tId);
    }
  };

  const handleUnshare = async (cid, toAddress) => {
    if (!account) return;
    let tId;
    try {
      tId = toast.loading("Revoking access…");
      const response = await api.post("/unshare", { cid, to_address: toAddress, user_address: account });
      const data = await response.json();
      if (!data.transaction) {
        console.error("Unshare prepare failed:", data);
        toast.update(tId, "Unshare failed. Check console for details.", "error");
        return;
      }
      await signAndVerifyTransaction(data.transaction, tId);
      toast.update(tId, "Access revoked", "success");
      retrieveFiles();
    } catch (err) {
      reportTxError("Unshare", err, tId);
    }
  };
  // Share many cids with one recipient — one grantFiles tx. Used by folder
  // share and multi-select share; notifyName labels the email notification
  // (e.g. 'the folder "docs"' or '3 items').
  const handleShareCids = async (cids, recipient, notifyName) => {
    if (!account) return;
    if (!cids.length) {
      toast.info("Nothing to share");
      return;
    }
    let tId;
    try {
      let toAddress = recipient.trim();
      const recipientEmail = toAddress.includes("@") ? toAddress.toLowerCase() : null;
      if (!toAddress.startsWith("0x")) {
        const resolved = await resolveRecipient(toAddress);
        const note = resolved.pregenerated
          ? "\n\nThey haven't used Web3FS yet — a wallet was reserved for this email and the files will appear when they first log in."
          : "";
        const short = `${resolved.address.slice(0, 6)}...${resolved.address.slice(-4)}`;
        if (!(await confirm({ title: "Share file", message: `Share with ${toAddress} (${short})?${note}`, confirmLabel: "Share" }))) return;
        toAddress = resolved.address;
      }
      tId = toast.loading(`Sharing ${cids.length} file(s)…`);
      const response = await api.post("/share-batch", { cids, to_address: toAddress, user_address: account });
      const data = await response.json();
      if (!data.transaction) {
        console.error("Batch share prepare failed:", data);
        toast.update(tId, "Share failed. Check console for details.", "error");
        return;
      }
      await signAndVerifyTransaction(data.transaction, tId);
      toast.update(tId, `Shared with ${recipient.trim()}`, "success");
      if (recipientEmail) {
        const sharerName = user?.google?.name || user?.email?.address || `${account.slice(0, 6)}...${account.slice(-4)}`;
        api.post("/notify-share", {
          recipient_email: recipientEmail,
          filename: notifyName,
          sharer: sharerName,
        }).catch((e) => console.warn("Share notification failed:", e));
      }
      retrieveFiles();
    } catch (err) {
      reportTxError("Share", err, tId);
    }
  };

  const handleUnshareCids = async (cids, toAddress) => {
    if (!account) return;
    if (!cids.length) return;
    let tId;
    try {
      tId = toast.loading("Revoking access…");
      const response = await api.post("/unshare-batch", { cids, to_address: toAddress, user_address: account });
      const data = await response.json();
      if (!data.transaction) {
        console.error("Folder unshare prepare failed:", data);
        toast.update(tId, "Unshare failed. Check console for details.", "error");
        return;
      }
      await signAndVerifyTransaction(data.transaction, tId);
      toast.update(tId, "Access revoked", "success");
      retrieveFiles();
    } catch (err) {
      reportTxError("Unshare", err, tId);
    }
  };

  // Prepare + sign a single move; shared by rename, drag-move, trash,
  // restore and their bulk variants. Throws on failure — callers own toasts.
  const moveTx = async (cid, newPath, tId) => {
    const response = await api.post("/move", { user_address: account, cid, new_path: newPath });
    const data = await response.json();
    if (!data.transaction) {
      console.error("Move prepare failed:", data);
      throw new Error("Could not prepare the move transaction");
    }
    await signAndVerifyTransaction(data.transaction, tId);
  };

  const handleMove = async (cid, newPath) => {
    if (!account) return;
    const tId = toast.loading("Moving…");
    try {
      await moveTx(cid, newPath, tId);
      toast.update(tId, "Moved", "success");
      retrieveFiles();
    } catch (err) {
      reportTxError("Move", err, tId);
    }
  };

  // Move a file into the hidden trash folder (keeps its original path under
  // /.trash so restore can put it back exactly where it was).
  const handleTrash = async (file) => {
    if (!account) return;
    const tId = toast.loading("Moving to trash…");
    try {
      await moveTx(file.cid, `${TRASH_PREFIX}${fullPathOf(file)}`, tId);
      const trashedFile = { ...file, folder_path: `${TRASH_PREFIX}${file.folder_path === "/" || !file.folder_path ? "" : file.folder_path}` };
      toast.update(tId, `"${file.filename}" moved to trash`, "success", {
        duration: 8000,
        action: { label: "Undo", onClick: () => handleRestore(trashedFile) },
      });
      retrieveFiles();
    } catch (err) {
      reportTxError("Move to trash", err, tId);
    }
  };

  const handleRestore = async (file) => {
    if (!account) return;
    const tId = toast.loading("Restoring…");
    try {
      const original = fullPathOf(file).slice(TRASH_PREFIX.length);
      await moveTx(file.cid, original, tId);
      toast.update(tId, `"${file.filename}" restored`, "success");
      retrieveFiles();
    } catch (err) {
      reportTxError("Restore", err, tId);
    }
  };

  const handleDelete = async (cid) => {
    if (!(await confirm({ title: "Delete forever", message: "Delete this file forever? This cannot be undone.", confirmLabel: "Delete", danger: true }))) return;
    const tId = toast.loading("Deleting…");
    try {
      const response = await api.post("/delete", { user_address: account, cid });
      const data = await response.json();
      if (!data.transaction) {
        console.error("Delete prepare failed:", data);
        toast.update(tId, "Delete failed. Check console for details.", "error");
        return;
      }
      await signAndVerifyTransaction(data.transaction, tId);
      toast.update(tId, "File deleted forever", "success");
      retrieveFiles();
    } catch (err) {
      reportTxError("Delete", err, tId);
    }
  };

  // --- BULK ACTIONS (multi-select) ---
  // One moveFiles(cids, newPaths) contract call — a single signature moves
  // any number of files (bulk trash/restore, folder rename).
  const runBatchMove = async (items, label, pathFor) => {
    const tId = toast.loading(`${label} ${items.length} file(s)…`);
    try {
      const response = await api.post("/move-batch", {
        user_address: account,
        cids: items.map((f) => f.cid),
        new_paths: items.map((f) => pathFor(f)),
      });
      const data = await response.json();
      if (!data.transaction) {
        console.error("Batch move prepare failed:", data);
        toast.update(tId, `${label} failed. Check console for details.`, "error");
        return;
      }
      await signAndVerifyTransaction(data.transaction, tId);
      toast.update(tId, `${label.replace(/ing/, "ed")} ${data.count} file(s)`, "success");
      retrieveFiles();
    } catch (err) {
      reportTxError(label, err, tId);
    }
  };

  // Bulk trash of files plus whole folders (multi-select): folders expand to
  // their owned files, everything moves in one moveFiles tx. Folder star and
  // empty-folder bookkeeping is dropped afterwards, like handleTrashFolder.
  const handleBulkTrash = async (items, folderPaths = []) => {
    const seen = new Set(items.map((f) => f.cid));
    const folderFiles = folderPaths.flatMap((p) =>
      files.filter((f) => f.is_owner && !isTrashed(f) && !seen.has(f.cid) && fullPathOf(f).startsWith(p + "/"))
    );
    folderFiles.forEach((f) => seen.add(f.cid));
    const all = [...items, ...folderFiles];

    const dropFolderEntries = () => {
      if (!folderPaths.length) return;
      setEmptyFolders((prev) => {
        const next = new Set();
        for (const p of prev) {
          if (!folderPaths.some((fp) => p === fp || p.startsWith(fp + "/"))) next.add(p);
        }
        return persistEmptyFolders(next);
      });
      folderPaths.forEach((p) => remapStarredFolders(p));
    };

    if (all.length === 0) {
      // Only empty folders selected — local bookkeeping, nothing on-chain
      dropFolderEntries();
      if (folderPaths.length) toast.success("Folder(s) deleted");
      return;
    }
    await runBatchMove(all, "Moving to trash", (f) => `${TRASH_PREFIX}${fullPathOf(f)}`);
    dropFolderEntries();
  };

  // Multi-select drag: move files plus whole folders to destFolder in one
  // moveFiles tx. Folders that are the destination or one of its ancestors
  // are skipped (moving them would nest a folder inside itself); files
  // already sitting in destFolder stay put.
  const handleBulkMove = async (items, folderPaths, destFolder) => {
    const okFolders = folderPaths.filter((p) => p !== destFolder && !destFolder.startsWith(p + "/"));
    const destBaseOf = (p) => {
      const name = p.slice(p.lastIndexOf("/") + 1);
      return destFolder === "/" ? `/${name}` : `${destFolder}/${name}`;
    };

    const looseFiles = items.filter((f) => f.is_owner && (f.folder_path || "/") !== destFolder);
    const seen = new Set(looseFiles.map((f) => f.cid));
    const moves = looseFiles.map((f) => ({
      file: f,
      to: destFolder === "/" ? `/${f.filename}` : `${destFolder}/${f.filename}`,
    }));
    for (const p of okFolders) {
      const base = destBaseOf(p);
      for (const f of files) {
        if (!f.is_owner || isTrashed(f) || seen.has(f.cid)) continue;
        if (!fullPathOf(f).startsWith(p + "/")) continue;
        seen.add(f.cid);
        moves.push({ file: f, to: base + fullPathOf(f).slice(p.length) });
      }
    }

    const rewriteLocal = () => {
      if (!okFolders.length) return;
      setEmptyFolders((prev) => {
        const next = new Set();
        for (const p0 of prev) {
          const moved = okFolders.find((fp) => p0 === fp || p0.startsWith(fp + "/"));
          if (moved) next.add(destBaseOf(moved) + p0.slice(moved.length));
          else next.add(p0);
        }
        return persistEmptyFolders(next);
      });
      okFolders.forEach((p) => remapStarredFolders(p, destBaseOf(p)));
    };

    if (moves.length === 0) {
      // Only empty folders moved — local bookkeeping, nothing on-chain
      rewriteLocal();
      if (okFolders.length) toast.success("Moved");
      return;
    }
    const pathByCid = new Map(moves.map((m) => [m.file.cid, m.to]));
    await runBatchMove(moves.map((m) => m.file), "Moving", (f) => pathByCid.get(f.cid));
    rewriteLocal();
  };

  // Files in the trash under a logical folder path (path without /.trash)
  const trashedFilesUnder = (folderPath) =>
    files.filter((f) => f.is_owner && isTrashed(f) && fullPathOf(f).startsWith(TRASH_PREFIX + folderPath + "/"));

  // items + whole trash folders expanded to their files — one moveFiles tx
  const handleBulkRestore = (items, folderPaths = []) => {
    const seen = new Set(items.map((f) => f.cid));
    const all = [...items, ...folderPaths.flatMap(trashedFilesUnder).filter((f) => !seen.has(f.cid))];
    if (!all.length) return;
    return runBatchMove(all, "Restoring", (f) => fullPathOf(f).slice(TRASH_PREFIX.length));
  };

  const handleRestoreFolder = (folderPath) => handleBulkRestore([], [folderPath]);
  const handleDeleteFolderForever = (folderPath) => handleBulkDelete([], [folderPath]);

  // Bulk delete-forever is a single cleanFolder(cids) transaction; trash
  // folders expand to their files first
  const handleBulkDelete = async (items, folderPaths = []) => {
    const seen = new Set(items.map((f) => f.cid));
    const all = [...items, ...folderPaths.flatMap(trashedFilesUnder).filter((f) => !seen.has(f.cid))];
    if (!all.length) return;
    if (!(await confirm({ title: "Delete forever", message: `Permanently delete ${all.length} file(s)? This cannot be undone.`, confirmLabel: "Delete", danger: true }))) return;
    const tId = toast.loading(`Deleting ${all.length} file(s)…`);
    try {
      const response = await api.post("/delete-batch", { user_address: account, cids: all.map((f) => f.cid) });
      const data = await response.json();
      if (!data.transaction) {
        console.error("Batch delete prepare failed:", data);
        toast.update(tId, "Delete failed. Check console for details.", "error");
        return;
      }
      await signAndVerifyTransaction(data.transaction, tId);
      toast.update(tId, `Deleted ${all.length} file(s) forever`, "success");
      retrieveFiles();
    } catch (err) {
      reportTxError("Delete", err, tId);
    }
  };

  // --- UPLOAD LOGIC ---
  // XHR instead of fetch: fetch can't report request-body upload progress
  const uploadWithProgress = (url, formData, onProgress) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.setRequestHeader("ngrok-skip-browser-warning", "true");
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
      setCurrentPath(logical.slice(0, logical.lastIndexOf("/")) || "/");
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
        const fullPath = currentPath === "/" ? `/${relative}` : `${currentPath}/${relative}`;
        formData.append("files", file);
        formData.append("paths", fullPath);
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
        const fullPath = currentPath === "/" ? `/${rel}` : `${currentPath}/${rel}`;
        formData.append("files", file);
        formData.append("paths", fullPath);
      }
    }
    await submitUpload(endpoint, formData, items.length, items[0].file.name);
  };

  const handleDeleteFolder = async (folderPath) => {
    if (!account) return;
    const isTrashPurge = folderPath === TRASH_PREFIX;
    const tId = toast.loading(isTrashPurge ? "Emptying trash…" : "Deleting folder…");
    try {
      const response = await api.post("/delete-folder", { folder_path: folderPath, user_address: account });
      const data = await response.json();
      if (data.error) {
        console.error("Delete folder prepare failed:", data);
        toast.update(tId, "Delete folder failed. Check console for details.", "error");
        return;
      }
      // Folders with on-chain files need a signed batch delete; empty
      // folders exist only in local state and have no transaction.
      if (data.transaction) {
        await signAndVerifyTransaction(data.transaction, tId);
      }
      toast.update(tId, isTrashPurge ? "Trash emptied" : "Folder deleted", "success");
      setEmptyFolders(prev => {
        const next = new Set();
        for (const p of prev) {
          if (p !== folderPath && !p.startsWith(folderPath + "/")) next.add(p);
        }
        return persistEmptyFolders(next);
      });
      remapStarredFolders(folderPath);
      retrieveFiles();
    } catch (err) {
      reportTxError("Delete folder", err, tId);
    }
  };

  // --- FOLDER CREATION ---
  const handleCreateFolder = (name) => {
    const newPath = currentPath === "/" ? `/${name}` : `${currentPath}/${name}`;
    setEmptyFolders(prev => persistEmptyFolders(new Set(prev).add(newPath)));
  };

  // --- FOLDER TRASH ---
  // Move every owned file under the folder to /.trash — one batch tx, one
  // signature. Restorable from the Trash view (per file or multi-select).
  const handleTrashFolder = async (folderPath) => {
    const dropEmptyEntries = () => setEmptyFolders(prev => {
      const next = new Set();
      for (const p of prev) {
        if (p !== folderPath && !p.startsWith(folderPath + "/")) next.add(p);
      }
      return persistEmptyFolders(next);
    });

    const affected = files.filter((f) =>
      f.is_owner && !isTrashed(f) && fullPathOf(f).startsWith(folderPath + "/")
    );
    if (affected.length === 0) {
      // Empty folders exist only locally — nothing on-chain to trash
      dropEmptyEntries();
      remapStarredFolders(folderPath);
      toast.success("Folder deleted");
      return;
    }
    await runBatchMove(affected, "Moving to trash", (f) => `${TRASH_PREFIX}${fullPathOf(f)}`);
    dropEmptyEntries();
    remapStarredFolders(folderPath);
  };

  // --- FOLDER RENAME & MOVE ---
  // Paths live on-chain per file, so relocating a folder moves every owned
  // file under it — one moveFiles tx, one signature. Empty folders are
  // local-only: just rewrite their paths in the set.
  const relocateFolder = async (folderPath, newPath, label, doneMsg) => {
    const rewriteEmptyFolders = () => setEmptyFolders(prev => {
      const next = new Set();
      for (const p of prev) {
        if (p === folderPath) next.add(newPath);
        else if (p.startsWith(folderPath + "/")) next.add(newPath + p.slice(folderPath.length));
        else next.add(p);
      }
      return persistEmptyFolders(next);
    });

    const affected = files.filter((f) =>
      f.is_owner && !isTrashed(f) && fullPathOf(f).startsWith(folderPath + "/")
    );
    if (affected.length === 0) {
      rewriteEmptyFolders();
      remapStarredFolders(folderPath, newPath);
      toast.success(doneMsg);
      return;
    }
    await runBatchMove(affected, label, (f) => newPath + fullPathOf(f).slice(folderPath.length));
    rewriteEmptyFolders();
    remapStarredFolders(folderPath, newPath);
  };

  const handleRenameFolder = (folderPath, newName) => {
    const parent = folderPath.slice(0, folderPath.lastIndexOf("/"));
    const newPath = `${parent}/${newName}`;
    if (newPath === folderPath) return;
    return relocateFolder(folderPath, newPath, "Renaming", "Folder renamed");
  };

  const handleMoveFolder = (folderPath, destFolder) => {
    const name = folderPath.slice(folderPath.lastIndexOf("/") + 1);
    const newPath = destFolder === "/" ? `/${name}` : `${destFolder}/${name}`;
    // No-op if already there; refuse moving a folder into itself
    if (newPath === folderPath || destFolder === folderPath || destFolder.startsWith(folderPath + "/")) return;
    return relocateFolder(folderPath, newPath, "Moving", "Folder moved");
  };

  return {
    handleShare, handleUnshare, handleShareCids, handleUnshareCids, handleMove, handleTrash, handleRestore, handleDelete, handleBulkTrash, handleBulkMove, handleBulkRestore, handleBulkDelete, handleRestoreFolder, handleDeleteFolderForever, handleTrashFolder, handleRenameFolder, handleMoveFolder, handleCreateFolder, handleDeleteFolder, handleUpload, handleDropUpload,
  };
}
