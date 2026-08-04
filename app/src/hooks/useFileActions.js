import { makeTx } from "../lib/tx";
import { useSharingActions } from "./useSharingActions";
import { useMoveActions } from "./useMoveActions";
import { useFolderActions } from "./useFolderActions";
import { useUploadActions } from "./useUploadActions";

// All on-chain file/folder actions, assembled from four groups that share the
// transaction plumbing in lib/tx.js. This composes them and hands App one flat
// object, which is the shape the whole tree already consumes.
//
// The wiring worth knowing: folder actions are built on the move actions'
// batch — relocating or trashing a folder is one moveFiles transaction over
// every owned file beneath it, so `runBatchMove` and the bulk restore/delete
// pass across.
export function useFileActions({
  account, api, toast, pushToast, user, getProvider, retrieveFiles, files, emptyFolders, setEmptyFolders, persistEmptyFolders, remapStarredFolders, currentPath, uploadMode, setView, setCurrentPath, setSearchQuery, confirm,
  addPendingUploads, dropPendingUploads,
}) {
  const tx = makeTx({ account, api, toast, pushToast, getProvider });

  const sharing = useSharingActions({ account, api, toast, user, confirm, retrieveFiles, tx });

  const moves = useMoveActions({
    account, toast, confirm, files, retrieveFiles,
    setEmptyFolders, persistEmptyFolders, remapStarredFolders, tx,
  });

  const folders = useFolderActions({
    account, toast, files, retrieveFiles, currentPath,
    setEmptyFolders, persistEmptyFolders, remapStarredFolders, tx,
    runBatchMove: moves.runBatchMove,
    handleBulkRestore: moves.handleBulkRestore,
    handleBulkDelete: moves.handleBulkDelete,
  });

  const uploads = useUploadActions({
    account, api, toast, pushToast, files, retrieveFiles,
    currentPath, uploadMode, setView, setCurrentPath, setSearchQuery, tx,
    addPendingUploads, dropPendingUploads,
  });

  // runBatchMove is internal wiring for the folder actions, not an action App
  // has any use for, so it stays out of the returned surface.
  const { runBatchMove, ...moveActions } = moves;

  return { ...sharing, ...moveActions, ...folders, ...uploads };
}
