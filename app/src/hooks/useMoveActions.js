import { isTrashed, fullPathOf, joinPath, baseNameOf, isUnder, pruneSubtrees, remapSubtrees } from "../lib/paths";
import { TRASH_PREFIX } from "../lib/constants";

// Moving a file is the primitive the trash is built on: trashing prefixes the
// path with /.trash, restoring strips it back off. Delete-forever is the only
// action here that isn't a move. Bulk variants ride one moveFiles tx, so a
// multi-select costs the user a single signature.
//
// `runBatchMove` is exported to the folder actions, which relocate a folder by
// moving every owned file under it.
export function useMoveActions({
  account, toast, confirm, files, retrieveFiles,
  setEmptyFolders, persistEmptyFolders, remapStarredFolders, tx,
}) {
  const { prepareAndSign, reportTxError } = tx;

  // A single move; shared by rename, drag-move, trash and restore. Throws on
  // failure — callers own the toasts.
  const moveTx = (cid, newPath, tId) => prepareAndSign("/move", { cid, new_path: newPath }, tId);

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
      await prepareAndSign("/delete", { cid }, tId);
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
      const data = await prepareAndSign("/move-batch", {
        cids: items.map((f) => f.cid),
        new_paths: items.map((f) => pathFor(f)),
      }, tId);
      toast.update(tId, `${label.replace(/ing/, "ed")} ${data.count} file(s)`, "success");
      retrieveFiles();
      return true;
    } catch (err) {
      reportTxError(label, err, tId);
      return false;
    }
  };

  // Bulk trash of files plus whole folders (multi-select): folders expand to
  // their owned files, everything moves in one moveFiles tx. Folder star and
  // empty-folder bookkeeping is dropped afterwards, like handleTrashFolder.
  const handleBulkTrash = async (items, folderPaths = []) => {
    const seen = new Set(items.map((f) => f.cid));
    const folderFiles = folderPaths.flatMap((p) =>
      files.filter((f) => f.is_owner && !isTrashed(f) && !seen.has(f.cid) && isUnder(fullPathOf(f), p))
    );
    folderFiles.forEach((f) => seen.add(f.cid));
    const all = [...items, ...folderFiles];

    const dropFolderEntries = () => {
      if (!folderPaths.length) return;
      setEmptyFolders((prev) => persistEmptyFolders(pruneSubtrees(prev, folderPaths)));
      folderPaths.forEach((p) => remapStarredFolders(p));
    };

    if (all.length === 0) {
      // Only empty folders selected — local bookkeeping, nothing on-chain
      dropFolderEntries();
      if (folderPaths.length) toast.success("Folder(s) deleted");
      return;
    }
    // Local bookkeeping only once the move is actually on-chain — otherwise a
    // rejected signature still deletes the folders' local entries and stars.
    if (await runBatchMove(all, "Moving to trash", (f) => `${TRASH_PREFIX}${fullPathOf(f)}`)) dropFolderEntries();
  };

  // Multi-select drag: move files plus whole folders to destFolder in one
  // moveFiles tx. Folders that are the destination or one of its ancestors
  // are skipped (moving them would nest a folder inside itself); files
  // already sitting in destFolder stay put.
  const handleBulkMove = async (items, folderPaths, destFolder) => {
    const okFolders = folderPaths.filter((p) => p !== destFolder && !isUnder(destFolder, p));
    const destBaseOf = (p) => joinPath(destFolder, baseNameOf(p));

    const looseFiles = items.filter((f) => f.is_owner && (f.folder_path || "/") !== destFolder);
    const seen = new Set(looseFiles.map((f) => f.cid));
    const moves = looseFiles.map((f) => ({ file: f, to: joinPath(destFolder, f.filename) }));
    for (const p of okFolders) {
      const base = destBaseOf(p);
      for (const f of files) {
        if (!f.is_owner || isTrashed(f) || seen.has(f.cid)) continue;
        if (!isUnder(fullPathOf(f), p)) continue;
        seen.add(f.cid);
        moves.push({ file: f, to: base + fullPathOf(f).slice(p.length) });
      }
    }

    const rewriteLocal = () => {
      if (!okFolders.length) return;
      const relocations = okFolders.map((p) => [p, destBaseOf(p)]);
      setEmptyFolders((prev) => persistEmptyFolders(remapSubtrees(prev, relocations)));
      relocations.forEach(([from, to]) => remapStarredFolders(from, to));
    };

    if (moves.length === 0) {
      // Only empty folders moved — local bookkeeping, nothing on-chain
      rewriteLocal();
      if (okFolders.length) toast.success("Moved");
      return;
    }
    const pathByCid = new Map(moves.map((m) => [m.file.cid, m.to]));
    if (await runBatchMove(moves.map((m) => m.file), "Moving", (f) => pathByCid.get(f.cid))) rewriteLocal();
  };

  // Files in the trash under a logical folder path (path without /.trash)
  const trashedFilesUnder = (folderPath) =>
    files.filter((f) => f.is_owner && isTrashed(f) && isUnder(fullPathOf(f), TRASH_PREFIX + folderPath));

  // items + whole trash folders expanded to their files — one moveFiles tx
  const handleBulkRestore = (items, folderPaths = []) => {
    const seen = new Set(items.map((f) => f.cid));
    const all = [...items, ...folderPaths.flatMap(trashedFilesUnder).filter((f) => !seen.has(f.cid))];
    if (!all.length) return;
    return runBatchMove(all, "Restoring", (f) => fullPathOf(f).slice(TRASH_PREFIX.length));
  };

  // Bulk delete-forever is a single cleanFolder(cids) transaction; trash
  // folders expand to their files first
  const handleBulkDelete = async (items, folderPaths = []) => {
    const seen = new Set(items.map((f) => f.cid));
    const all = [...items, ...folderPaths.flatMap(trashedFilesUnder).filter((f) => !seen.has(f.cid))];
    if (!all.length) return;
    if (!(await confirm({ title: "Delete forever", message: `Permanently delete ${all.length} file(s)? This cannot be undone.`, confirmLabel: "Delete", danger: true }))) return;
    const tId = toast.loading(`Deleting ${all.length} file(s)…`);
    try {
      await prepareAndSign("/delete-batch", { cids: all.map((f) => f.cid) }, tId);
      toast.update(tId, `Deleted ${all.length} file(s) forever`, "success");
      retrieveFiles();
    } catch (err) {
      reportTxError("Delete", err, tId);
    }
  };

  return {
    handleMove, handleTrash, handleRestore, handleDelete,
    handleBulkTrash, handleBulkMove, handleBulkRestore, handleBulkDelete,
    runBatchMove,
  };
}
