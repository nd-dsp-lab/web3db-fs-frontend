/* eslint-disable testing-library/no-node-access --
   File/folder tiles are targeted by their data-cid attribute (the same hook the
   app uses for drag/selection); they carry no ARIA role or unique label, so
   querying the node directly is the intended way to click a specific tile. */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import AppLayout from "./AppLayout";

// AppLayout is the main shell: it renders Sidebar/Header/Toolbar and the
// file grid through LayoutContext, owns selection/menu/drag state, and the
// keyboard shortcuts. These tests render the real tree with stub props and
// drive it the way a user would (click, right-click, keydown).

const ADDR = "0x1A28b19f6d2ea1A05F9eFFbcCcbF7E9571877981";

const noopStats = () => ({
  sharedWith: [], fileCount: 0, folderCount: 0, size: 0,
  earliest: null, latest: null, owned: true, owner: null, cids: [],
});

function makeProps(over = {}) {
  const fns = {};
  for (const name of [
    "connectWallet", "disconnectWallet", "setCurrentPath", "uploadFile", "setUploadMode",
    "handleCreateFolder", "handleRenameFolder", "handleMoveFolder", "handleTrashFolder",
    "handleDelete", "handleDeleteFolder", "handleMove", "handleTrash", "handleRestore",
    "handleDropUpload", "handleShare", "handleUnshare", "handleShareCids", "handleUnshareCids",
    "handleRestoreFolder", "handleDeleteFolderForever", "setView", "setSearchQuery",
    "setSearchType", "setSearchScope", "toggleTheme", "toggleStar", "toggleStarMany",
    "toggleStarFolder", "handleBulkTrash", "handleBulkRestore", "handleBulkDelete", "handleBulkMove",
  ]) fns[name] = jest.fn();

  return {
    ...fns,
    account: ADDR,
    authToken: "tok",
    displayItems: [],
    currentPath: "/",
    fileTree: null,
    API_BASE_URL: "http://api",
    view: "my-drive",
    searchQuery: "",
    searchType: null,
    searchScope: "all",
    darkMode: false,
    user: { google: { name: "Ada" } },
    starred: new Set(),
    starredFolders: new Set(),
    storageUsed: 100,
    storageQuota: 1000,
    folderCidsOf: () => ["c1"],
    folderStatsOf: noopStats,
    confirm: jest.fn().mockResolvedValue(true),
    toast: { loading: jest.fn(() => "t"), update: jest.fn(), success: jest.fn(), info: jest.fn(), error: jest.fn() },
    ...over,
  };
}

const aFile = (over = {}) => ({ type: "file", cid: "c1", filename: "report.txt", name: "report.txt", is_owner: true, permissions: 0xFF, folder_path: "/", size: 10, ...over });
const aFolder = (over = {}) => ({ type: "folder", name: "Docs", ...over });

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test("shows the empty state when there are no items", () => {
  render(<AppLayout {...makeProps({ displayItems: [] })} />);
  expect(screen.getByText(/This folder is empty/i)).toBeInTheDocument();
});

test("empty-state copy is tailored to the Trash view", () => {
  render(<AppLayout {...makeProps({ displayItems: [], view: "trash" })} />);
  expect(screen.getByText(/Trash is empty/i)).toBeInTheDocument();
});

test("renders file and folder names from displayItems", () => {
  render(<AppLayout {...makeProps({ displayItems: [aFile(), aFolder()] })} />);
  expect(screen.getByText("report.txt")).toBeInTheDocument();
  expect(screen.getByText("Docs")).toBeInTheDocument();
});

test("the New menu reveals the create/upload actions", () => {
  render(<AppLayout {...makeProps()} />);
  fireEvent.click(screen.getByRole("button", { name: /^New$/ }));

  expect(screen.getByText("New folder")).toBeInTheDocument();
  expect(screen.getByText("File upload")).toBeInTheDocument();
  expect(screen.getByText("Folder upload")).toBeInTheDocument();
});

test("clicking a sidebar view switches to it and resets the path", () => {
  const props = makeProps();
  render(<AppLayout {...props} />);
  fireEvent.click(screen.getByText("Trash"));

  expect(props.setView).toHaveBeenCalledWith("trash");
  expect(props.setCurrentPath).toHaveBeenCalledWith("/");
  expect(props.setSearchQuery).toHaveBeenCalledWith("");
});

test("Delete key trashes the current selection", () => {
  const props = makeProps({ displayItems: [aFile()] });
  render(<AppLayout {...props} />);

  // select the file via its checkbox, then press Delete
  fireEvent.click(screen.getAllByRole("checkbox")[0]);
  fireEvent.keyDown(document, { key: "Delete" });

  expect(props.handleBulkTrash).toHaveBeenCalledTimes(1);
  const [files] = props.handleBulkTrash.mock.calls[0];
  expect(files.map((f) => f.cid)).toEqual(["c1"]);
});

test("Delete does nothing when nothing is selected", () => {
  const props = makeProps({ displayItems: [aFile()] });
  render(<AppLayout {...props} />);
  fireEvent.keyDown(document, { key: "Delete" });

  expect(props.handleBulkTrash).not.toHaveBeenCalled();
});

test("right-clicking the empty background opens the New/upload menu", () => {
  render(<AppLayout {...makeProps({ displayItems: [] })} />);
  // the empty-state sits inside the content area that owns the context menu
  fireEvent.contextMenu(screen.getByText(/This folder is empty/i));

  // background menu offers the same create action
  expect(screen.getByText("New folder")).toBeInTheDocument();
});

test("a file grid tile opens the preview on click", () => {
  render(<AppLayout {...makeProps({ displayItems: [aFile({ filename: "a.png", name: "a.png" })] })} />);
  const tile = document.querySelector('[data-cid="c1"]');
  expect(tile).toBeTruthy();
  fireEvent.click(tile);
  // PreviewModal mounts, so the name now appears both on the tile and in the modal
  expect(screen.getAllByText("a.png").length).toBeGreaterThanOrEqual(2);
});

test("right-clicking a file opens its context menu", () => {
  render(<AppLayout {...makeProps({ displayItems: [aFile()] })} />);
  fireEvent.contextMenu(document.querySelector('[data-cid="c1"]'));

  expect(screen.getByText("Download")).toBeInTheDocument();
  expect(screen.getByText("File details")).toBeInTheDocument();
});

test("F2 opens the rename dialog for the selected file", () => {
  render(<AppLayout {...makeProps({ displayItems: [aFile()] })} />);
  fireEvent.click(screen.getAllByRole("checkbox")[0]);
  fireEvent.keyDown(document, { key: "F2" });

  // NameModal is seeded with the current filename
  expect(screen.getByDisplayValue("report.txt")).toBeInTheDocument();
});

test("clicking a folder tile navigates into it", () => {
  const props = makeProps({ displayItems: [aFolder({ name: "Docs" })] });
  render(<AppLayout {...props} />);
  fireEvent.click(document.querySelector('[data-cid="folder:/Docs"]'));

  expect(props.setView).toHaveBeenCalledWith("my-drive");
  expect(props.setCurrentPath).toHaveBeenCalledWith("/Docs");
});
