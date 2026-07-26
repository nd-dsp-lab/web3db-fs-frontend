import { isTrashed, fullPathOf, joinPath, parentOf, baseNameOf, isUnder, pruneSubtrees, remapSubtrees } from "../lib/paths";
import { TRASH_PREFIX } from "../lib/constants";

// Folders have no on-chain identity — paths live per file. So every folder
// operation is really an operation on the files under it, plus bookkeeping for
// the empty folders that exist only in local state. `runBatchMove`,
// `handleBulkRestore` and `handleBulkDelete` come from the move actions, which
// is where the one-signature batch lives.
export function useFolderActions({
  account, toast, files, retrieveFiles, currentPath,
  setEmptyFolders, persistEmptyFolders, remapStarredFolders,
  tx, runBatchMove, handleBulkRestore, handleBulkDelete,
}) {
  const { prepareAndSign, reportTxError } = tx;

  const handleRestoreFolder = (folderPath) => handleBulkRestore([], [folderPath]);
  const handleDeleteFolderForever = (folderPath) => handleBulkDelete([], [folderPath]);

  const handleDeleteFolder = async (folderPath) => {
    if (!account) return;
    const isTrashPurge = folderPath === TRASH_PREFIX;
    const tId = toast.loading(isTrashPurge ? "Emptying trash…" : "Deleting folder…");
    try {
      // Folders with on-chain files need a signed batch delete; empty
      // folders exist only in local state and have no transaction.
      await prepareAndSign("/delete-folder", { folder_path: folderPath }, tId, { optionalTx: true });
      toast.update(tId, isTrashPurge ? "Trash emptied" : "Folder deleted", "success");
      setEmptyFolders(prev => persistEmptyFolders(pruneSubtrees(prev, [folderPath])));
      remapStarredFolders(folderPath);
      retrieveFiles();
    } catch (err) {
      reportTxError("Delete folder", err, tId);
    }
  };

  // --- FOLDER CREATION ---
  const handleCreateFolder = (name) => {
    setEmptyFolders(prev => persistEmptyFolders(new Set(prev).add(joinPath(currentPath, name))));
  };

  // --- FOLDER TRASH ---
  // Move every owned file under the folder to /.trash — one batch tx, one
  // signature. Restorable from the Trash view (per file or multi-select).
  const handleTrashFolder = async (folderPath) => {
    const dropEmptyEntries = () =>
      setEmptyFolders(prev => persistEmptyFolders(pruneSubtrees(prev, [folderPath])));

    const affected = files.filter((f) => f.is_owner && !isTrashed(f) && isUnder(fullPathOf(f), folderPath));
    if (affected.length === 0) {
      // Empty folders exist only locally — nothing on-chain to trash
      dropEmptyEntries();
      remapStarredFolders(folderPath);
      toast.success("Folder deleted");
      return;
    }
    if (await runBatchMove(affected, "Moving to trash", (f) => `${TRASH_PREFIX}${fullPathOf(f)}`)) {
      dropEmptyEntries();
      remapStarredFolders(folderPath);
    }
  };

  // --- FOLDER RENAME & MOVE ---
  // Paths live on-chain per file, so relocating a folder moves every owned
  // file under it — one moveFiles tx, one signature. Empty folders are
  // local-only: just rewrite their paths in the set.
  const relocateFolder = async (folderPath, newPath, label, doneMsg) => {
    const rewriteEmptyFolders = () =>
      setEmptyFolders(prev => persistEmptyFolders(remapSubtrees(prev, [[folderPath, newPath]])));

    const affected = files.filter((f) => f.is_owner && !isTrashed(f) && isUnder(fullPathOf(f), folderPath));
    if (affected.length === 0) {
      rewriteEmptyFolders();
      remapStarredFolders(folderPath, newPath);
      toast.success(doneMsg);
      return;
    }
    if (await runBatchMove(affected, label, (f) => newPath + fullPathOf(f).slice(folderPath.length))) {
      rewriteEmptyFolders();
      remapStarredFolders(folderPath, newPath);
    }
  };

  const handleRenameFolder = (folderPath, newName) => {
    const newPath = joinPath(parentOf(folderPath), newName);
    if (newPath === folderPath) return;
    return relocateFolder(folderPath, newPath, "Renaming", "Folder renamed");
  };

  const handleMoveFolder = (folderPath, destFolder) => {
    const newPath = joinPath(destFolder, baseNameOf(folderPath));
    // No-op if already there; refuse moving a folder into itself
    if (newPath === folderPath || destFolder === folderPath || isUnder(destFolder, folderPath)) return;
    return relocateFolder(folderPath, newPath, "Moving", "Folder moved");
  };

  return {
    handleCreateFolder, handleTrashFolder, handleDeleteFolder,
    handleRenameFolder, handleMoveFolder,
    handleRestoreFolder, handleDeleteFolderForever,
  };
}
