import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DetailsPanel from "./DetailsPanel";

// DetailsPanel renders metadata for a file, a folder, a multi-selection, or an
// empty state, and loads the shared-user list for owned items.

const ACCOUNT = "0x1A28b19f6d2ea1A05F9eFFbcCcbF7E9571877981";
const OTHER = "0x3081Acc05169336e7875ad9f896bF6511397809a";
const THEME = { card: "#fff", subText: "#888", tile: "#eee", text: "#000" };

function mockShared(list) {
  global.fetch = vi.fn().mockResolvedValue({ json: async () => ({ shared_with: list }) });
}

function setup(over = {}) {
  const props = {
    file: null, account: ACCOUNT, authToken: "tok", API_BASE_URL: "http://api",
    onClose: vi.fn(), theme: THEME, toast: { success: vi.fn(), error: vi.fn() },
    isStarred: false, folderStatsOf: () => ({ fileCount: 0, folderCount: 0, size: 0, earliest: null, latest: null, cids: [], owner: null }),
    ...over,
  };
  render(<DetailsPanel {...props} />);
  return props;
}

beforeEach(() => {
  mockShared([]);
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue() } });
  vi.spyOn(console, "error").mockImplementation(() => {}); // benign async act warnings
});
afterEach(() => vi.restoreAllMocks());

test("with no file it prompts to select one", () => {
  setup({ file: null });
  expect(screen.getByText(/Select a file to see its details/i)).toBeInTheDocument();
});

test("a multi-selection shows the summary", () => {
  setup({ file: { type: "multi", items: 3, files: 5, folders: 1, size: 2048 } });
  expect(screen.getByText("3 items selected")).toBeInTheDocument();
  expect(screen.getByText(/5 file\(s\) across 1 folder\(s\)/)).toBeInTheDocument();
});

test("an owned file shows its metadata and 'Only you' when unshared", async () => {
  setup({ file: { cid: "c1", filename: "a.pdf", is_owner: true, size: 1024, folder_path: "/docs" } });
  expect(screen.getByText("PDF")).toBeInTheDocument();               // Type from extension
  expect(screen.getByText("You")).toBeInTheDocument();               // Owner
  expect(screen.getByText("/docs")).toBeInTheDocument();             // Location
  expect(await screen.findByText("Only you")).toBeInTheDocument();   // after list loads empty
});

test("an owned file lists the addresses it is shared with", async () => {
  mockShared([OTHER]);
  setup({ file: { cid: "c1", filename: "a.pdf", is_owner: true, size: 1, folder_path: "/" } });
  expect(await screen.findByText("0x3081...809a")).toBeInTheDocument();
});

test("copying the CID writes to the clipboard and toasts", () => {
  setup({ file: { cid: "QmABCDEF123456", filename: "a.pdf", is_owner: true, size: 1, folder_path: "/" } });
  fireEvent.click(screen.getByTitle("Copy CID"));
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith("QmABCDEF123456");
});

test("a file shared to me credits the owner and skips the fetch", () => {
  setup({ file: { cid: "c1", filename: "a.pdf", is_owner: false, owner: OTHER, size: 1, folder_path: "/" } });
  expect(screen.getByText(new RegExp(`Shared with you by`, "i"))).toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalled();
});

test("a trashed file reports its location as Trash", () => {
  setup({ file: { cid: "c1", filename: "a.pdf", is_owner: true, size: 1, folder_path: "/.trash/docs" } });
  expect(screen.getByText("Trash")).toBeInTheDocument();
});

test("an owned folder shows aggregate stats and loads its shared users", async () => {
  const folderStatsOf = () => ({ fileCount: 3, folderCount: 1, size: 4096, earliest: 1000, latest: 2000, cids: ["c1"], owner: null });
  setup({ file: { type: "folder", name: "Docs", path: "/Docs", shared: false }, folderStatsOf });

  expect(screen.getByText("Folder")).toBeInTheDocument();
  expect(screen.getByText(/3 file\(s\), 1 folder\(s\)/)).toBeInTheDocument();
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/shared-users-batch"), expect.anything()));
});

test("a folder shared to me credits the owner without fetching", () => {
  const folderStatsOf = () => ({ fileCount: 2, folderCount: 0, size: 1, earliest: null, latest: null, cids: [], owner: OTHER });
  setup({ file: { type: "folder", name: "Team", path: "/Team", shared: true }, folderStatsOf });
  expect(screen.getByText(new RegExp("Shared with you by", "i"))).toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalled();
});
