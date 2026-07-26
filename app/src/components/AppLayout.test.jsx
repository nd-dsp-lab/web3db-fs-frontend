/* eslint-disable testing-library/no-node-access --
   File/folder tiles are targeted by their data-cid attribute (the same hook the
   app uses for drag/selection); they carry no ARIA role or unique label, so
   querying the node directly is the intended way to click a specific tile. */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import AppLayout from "./AppLayout";
import { makeApi } from "../lib/api";

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
  ]) fns[name] = vi.fn();

  return {
    ...fns,
    account: ADDR,
    authToken: "tok",
    displayItems: [],
    currentPath: "/",
    fileTree: null,
    api: makeApi("http://api"),
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
    confirm: vi.fn().mockResolvedValue(true),
    toast: { loading: vi.fn(() => "t"), update: vi.fn(), success: vi.fn(), info: vi.fn(), error: vi.fn() },
    ...over,
  };
}

const aFile = (over = {}) => ({ type: "file", cid: "c1", filename: "report.txt", name: "report.txt", is_owner: true, permissions: 0xFF, folder_path: "/", size: 10, ...over });
const aFolder = (over = {}) => ({ type: "folder", name: "Docs", ...over });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  global.fetch = vi.fn().mockResolvedValue({
    ok: true, blob: async () => new Blob(["x"]), json: async () => ({ shared_with: [] }),
  });
  global.URL.createObjectURL = vi.fn(() => "blob:x");
  global.URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

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

test("search matches are highlighted in tile names", () => {
  render(<AppLayout {...makeProps({ displayItems: [aFile({ filename: "report.txt", name: "report.txt" })], searchQuery: "rep" })} />);
  expect(document.querySelectorAll("mark").length).toBeGreaterThan(0);
});

test("F2 rename dialog moves the file to the new name on submit", () => {
  const props = makeProps({ displayItems: [aFile()] });
  render(<AppLayout {...props} />);
  fireEvent.click(screen.getAllByRole("checkbox")[0]);
  fireEvent.keyDown(document, { key: "F2" });

  const input = screen.getByDisplayValue("report.txt");
  fireEvent.change(input, { target: { value: "renamed.txt" } });
  fireEvent.keyDown(input, { key: "Enter" });

  expect(props.handleMove).toHaveBeenCalledWith("c1", "/renamed.txt");
});

// A component declared inside AppLayout's render body is a new component
// *type* on every render, so React cannot match it to the previous tree: it
// unmounts the old node and mounts a fresh one. The visible symptom is the
// selection checkbox losing focus the moment anything else re-renders.
describe("tile controls are not remounted on every render", () => {
  // Scoped to the row: list view also renders a select-all checkbox in the
  // header, which is plain JSX in FileList and never had this problem.
  const rowCheckbox = () => document.querySelector('[data-cid="c1"] input[type="checkbox"]');

  test("the checkbox keeps its DOM node and its focus across a re-render", () => {
    render(<AppLayout {...makeProps({ displayItems: [aFile()] })} />);
    const box = rowCheckbox();
    box.focus();

    // Hovering a tile sets hoveredKey, which re-renders the whole subtree.
    fireEvent.mouseEnter(document.querySelector('[data-cid="c1"]'));

    expect(rowCheckbox()).toBe(box);
    expect(document.activeElement).toBe(box);
  });

  test("the same holds in list view", () => {
    render(<AppLayout {...makeProps({ displayItems: [aFile()] })} />);
    fireEvent.click(screen.getByTitle(/list view/i));
    const box = rowCheckbox();
    box.focus();
    fireEvent.mouseEnter(document.querySelector('[data-cid="c1"]'));

    expect(rowCheckbox()).toBe(box);
    expect(document.activeElement).toBe(box);
  });
});

// --- drag-and-drop upload ---

describe("drag-and-drop upload", () => {
  test("dragging files in shows the drop overlay", () => {
    render(<AppLayout {...makeProps({ displayItems: [] })} />);
    const zone = screen.getByText(/This folder is empty/i);
    fireEvent.dragEnter(zone, { dataTransfer: { types: ["Files"] } });

    expect(screen.getByText(/Drop files to upload/i)).toBeInTheDocument();
    fireEvent.dragLeave(zone, { dataTransfer: { types: ["Files"] } });
  });

  test("dropping plain files hands them to the upload handler", () => {
    const props = makeProps({ displayItems: [] });
    render(<AppLayout {...props} />);
    const zone = screen.getByText(/This folder is empty/i);
    const dataTransfer = { types: ["Files"], items: [], files: [new File(["x"], "a.pdf")] };

    fireEvent.drop(zone, { dataTransfer });

    expect(props.handleDropUpload).toHaveBeenCalled();
    expect(props.handleDropUpload.mock.calls[0][0][0].rel).toBe("a.pdf");
  });

  test("dropping outside My Drive is refused with a hint", () => {
    const props = makeProps({ displayItems: [], view: "shared" });
    render(<AppLayout {...props} />);
    const zone = screen.getByText(/Nothing shared with you yet/i);

    fireEvent.drop(zone, { dataTransfer: { types: ["Files"], items: [], files: [new File(["x"], "a.pdf")] } });

    expect(props.toast.info).toHaveBeenCalledWith(expect.stringMatching(/My Drive/i));
    expect(props.handleDropUpload).not.toHaveBeenCalled();
  });
});

// --- downloads (fetch-backed) ---

describe("downloads", () => {
  test("downloading a folder hits the zip endpoint", () => {
    render(<AppLayout {...makeProps({ displayItems: [aFolder()] })} />);
    fireEvent.contextMenu(document.querySelector('[data-cid="folder:/Docs"]'));
    // FolderMenu offers Rename/Download/Share
    expect(screen.getByText("Rename")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Download"));

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/download-folder?path="), expect.anything());
  });
});

// --- multi-select toolbar ---

describe("multi-select toolbar", () => {
  const twoFiles = [
    aFile({ cid: "c1", filename: "a.txt", name: "a.txt" }),
    aFile({ cid: "c2", filename: "b.txt", name: "b.txt" }),
  ];
  // Ctrl-click the tiles directly — deterministic, unlike checkbox indices
  // once the selection toolbar adds its own controls.
  const selectBoth = () => {
    fireEvent.click(document.querySelector('[data-cid="c1"]'), { ctrlKey: true });
    fireEvent.click(document.querySelector('[data-cid="c2"]'), { ctrlKey: true });
  };

  test("bulk trash acts on the whole selection", () => {
    const props = makeProps({ displayItems: twoFiles });
    render(<AppLayout {...props} />);
    selectBoth();
    fireEvent.click(screen.getByTitle("Move to trash"));

    expect(props.handleBulkTrash).toHaveBeenCalled();
    expect(props.handleBulkTrash.mock.calls[0][0].map((f) => f.cid).sort()).toEqual(["c1", "c2"]);
  });

  test("bulk share opens the share modal for the selection", () => {
    render(<AppLayout {...makeProps({ displayItems: twoFiles })} />);
    selectBoth();
    fireEvent.click(screen.getByTitle("Share"));

    expect(screen.getByText(/People with access/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Email or Ethereum address/i)).toBeInTheDocument();
  });

  test("bulk download fetches the selected files", () => {
    render(<AppLayout {...makeProps({ displayItems: twoFiles })} />);
    selectBoth();
    fireEvent.click(screen.getByTitle("Download"));

    expect(global.fetch).toHaveBeenCalled();
  });

  test("details panel shows the multi-selection summary", () => {
    render(<AppLayout {...makeProps({ displayItems: twoFiles })} />);
    selectBoth();
    fireEvent.click(screen.getByTitle("File details"));

    expect(screen.getByText(/2 items selected/i)).toBeInTheDocument();
  });

  test("right-clicking within a selection opens the selection menu", () => {
    render(<AppLayout {...makeProps({ displayItems: twoFiles })} />);
    selectBoth();
    fireEvent.contextMenu(document.querySelector('[data-cid="c1"]'));

    // selection menu offers bulk actions rather than the single-file menu
    expect(screen.getByText("Move to trash")).toBeInTheDocument();
    expect(screen.getByText("Share")).toBeInTheDocument();
  });
});

// --- internal drag-move and the New-menu upload trigger ---

describe("internal drag and upload trigger", () => {
  test("dragging a file onto a folder moves it there", () => {
    const props = makeProps({
      displayItems: [aFile({ cid: "c1", filename: "a.txt", name: "a.txt", folder_path: "/" }), aFolder({ name: "Docs" })],
    });
    render(<AppLayout {...props} />);

    fireEvent.dragStart(document.querySelector('[data-cid="c1"]'));
    fireEvent.drop(document.querySelector('[data-cid="folder:/Docs"]'));

    expect(props.handleMove).toHaveBeenCalledWith("c1", "/Docs/a.txt");
  });

  test("choosing File upload from the New menu arms a single-file upload", () => {
    const props = makeProps();
    render(<AppLayout {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /^New$/ }));
    fireEvent.click(screen.getByText("File upload"));

    expect(props.setUploadMode).toHaveBeenCalledWith("single");
  });

  test("the star shortcut stars the current selection", () => {
    const props = makeProps({ displayItems: [aFile()] });
    render(<AppLayout {...props} />);
    fireEvent.click(document.querySelector('[data-cid="c1"]'), { ctrlKey: true });
    fireEvent.keyDown(document, { key: "s", code: "KeyS", metaKey: true, altKey: true });

    expect(props.toggleStarMany).toHaveBeenCalled();
  });

  test("creating a folder from the New menu", () => {
    const props = makeProps();
    render(<AppLayout {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /^New$/ }));
    fireEvent.click(screen.getByText("New folder"));

    // the modal input is the textbox that isn't the header search
    const modalInput = screen.getAllByRole("textbox").find((i) => i.getAttribute("placeholder") !== "Search in Web3FS");
    fireEvent.change(modalInput, { target: { value: "Reports" } });
    fireEvent.click(screen.getByText("Create"));

    expect(props.handleCreateFolder).toHaveBeenCalledWith("Reports");
  });

  test("F2 renames a selected folder on submit", () => {
    const props = makeProps({ displayItems: [aFolder({ name: "Docs" })] });
    render(<AppLayout {...props} />);
    fireEvent.click(screen.getAllByRole("checkbox")[0]); // select the folder
    fireEvent.keyDown(document, { key: "F2" });

    const input = screen.getByDisplayValue("Docs");
    fireEvent.change(input, { target: { value: "Papers" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(props.handleRenameFolder).toHaveBeenCalledWith("/Docs", "Papers");
  });

  test("Delete in the Trash view deletes forever", () => {
    const props = makeProps({ displayItems: [aFile()], view: "trash" });
    render(<AppLayout {...props} />);
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.keyDown(document, { key: "Delete" });

    expect(props.handleBulkDelete).toHaveBeenCalled();
    expect(props.handleBulkTrash).not.toHaveBeenCalled();
  });
});

// --- list view (FileList) and sorting ---

describe("list view and sorting", () => {
  const twoFiles = [
    aFile({ cid: "c1", filename: "a.txt", name: "a.txt" }),
    aFile({ cid: "c2", filename: "b.txt", name: "b.txt" }),
  ];

  test("switching to list view renders the table with folders and files", () => {
    render(<AppLayout {...makeProps({ displayItems: [aFolder({ name: "Docs", shared_with: ["0xAAA"] }), ...twoFiles] })} />);
    fireEvent.click(screen.getByTitle("list view"));

    expect(screen.getByText("Sharing")).toBeInTheDocument();
    expect(screen.getByText("CID")).toBeInTheDocument();
    expect(screen.getByText("Docs")).toBeInTheDocument(); // folder row
    expect(screen.getByText("a.txt")).toBeInTheDocument();
    expect(screen.getByText("b.txt")).toBeInTheDocument();
  });

  test("the list select-all checkbox selects every row", () => {
    const props = makeProps({ displayItems: twoFiles });
    render(<AppLayout {...props} />);
    fireEvent.click(screen.getByTitle("list view"));

    // the first checkbox is the thead select-all
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByTitle("Move to trash"));

    expect(props.handleBulkTrash.mock.calls[0][0].map((f) => f.cid).sort()).toEqual(["c1", "c2"]);
  });

  test("the sort-direction toggle flips ascending/descending", () => {
    render(<AppLayout {...makeProps({ displayItems: twoFiles })} />);
    expect(screen.getByTitle("Ascending")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Ascending"));
    expect(screen.getByTitle("Descending")).toBeInTheDocument();
  });
});

// The details panel gates the keyboard shortcuts while it is open. It used to
// gate on detailsFile, which nothing ever cleared, so opening the panel once
// killed every shortcut for the rest of the session.
describe("keyboard shortcuts and the details panel", () => {
  const openThenCloseDetails = () => {
    fireEvent.click(screen.getByTitle("File details"));
    fireEvent.click(screen.getByLabelText("Close details"));
  };

  test("shortcuts are suppressed while the panel is open", () => {
    render(<AppLayout {...makeProps({ displayItems: [aFile()] })} />);
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByTitle("File details"));

    fireEvent.keyDown(document, { key: "F2" });
    expect(screen.queryByDisplayValue("report.txt")).not.toBeInTheDocument();
  });

  test("shortcuts work again once the panel is closed", () => {
    render(<AppLayout {...makeProps({ displayItems: [aFile()] })} />);
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    openThenCloseDetails();

    fireEvent.keyDown(document, { key: "F2" });
    expect(screen.getByDisplayValue("report.txt")).toBeInTheDocument();
  });
});

// Starred and search list folders from different parents, so two folders with
// the same name can appear side by side. Keying them by name made React see
// duplicate keys and made hover state collide across the two tiles.
describe("folders that share a name in a flat view", () => {
  const twoDocs = [
    aFolder({ name: "docs", fullPath: "/work/docs" }),
    aFolder({ name: "docs", fullPath: "/personal/docs" }),
  ];

  test("grid: hovering one tile does not highlight the other", () => {
    render(<AppLayout {...makeProps({ displayItems: twoDocs, view: "starred" })} />);
    const tiles = [
      document.querySelector('[data-cid="folder:/work/docs"]'),
      document.querySelector('[data-cid="folder:/personal/docs"]'),
    ];
    expect(tiles[0]).toBeTruthy();
    expect(tiles[1]).toBeTruthy();

    fireEvent.mouseEnter(tiles[0]);
    const hovered = tiles[0].style.backgroundColor;
    const other = tiles[1].style.backgroundColor;
    expect(hovered).not.toBe(other);
  });

  test("both folders render as distinct rows in list view", () => {
    render(<AppLayout {...makeProps({ displayItems: twoDocs, view: "starred" })} />);
    fireEvent.click(screen.getByTitle("list view"));

    expect(document.querySelector('[data-cid="folder:/work/docs"]')).toBeTruthy();
    expect(document.querySelector('[data-cid="folder:/personal/docs"]')).toBeTruthy();
  });

  test("React is not given duplicate keys", () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<AppLayout {...makeProps({ displayItems: twoDocs, view: "starred" })} />);

    const dupeWarning = warn.mock.calls.some((c) => String(c[0]).includes("same key"));
    expect(dupeWarning).toBe(false);
  });
});
