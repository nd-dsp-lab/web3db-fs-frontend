import { useFileActions } from "./useFileActions";

// The 21 actions App published before the split, listed literally so a key
// silently gained or lost shows up here.
const EXPECTED = [
  "handleShare", "handleUnshare", "handleShareCids", "handleUnshareCids",
  "handleMove", "handleTrash", "handleRestore", "handleDelete",
  "handleBulkTrash", "handleBulkMove", "handleBulkRestore", "handleBulkDelete",
  "handleRestoreFolder", "handleDeleteFolderForever", "handleTrashFolder",
  "handleRenameFolder", "handleMoveFolder", "handleCreateFolder",
  "handleDeleteFolder", "handleUpload", "handleDropUpload",
];

test("exposes exactly the actions it always did, all callable", () => {
  const actions = useFileActions({
    account: "0xA", api: {}, toast: {}, pushToast: () => {}, user: null,
    getProvider: async () => ({}), retrieveFiles: () => {}, files: [],
    emptyFolders: new Set(), setEmptyFolders: () => {}, persistEmptyFolders: (s) => s,
    remapStarredFolders: () => {}, currentPath: "/", uploadMode: "single",
    setView: () => {}, setCurrentPath: () => {}, setSearchQuery: () => {}, confirm: async () => true,
  });
  expect(Object.keys(actions).sort()).toEqual([...EXPECTED].sort());
  for (const k of EXPECTED) expect(typeof actions[k]).toBe("function");
});
