import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import FolderMenu from "./FolderMenu";
import { LayoutContext } from "../contexts/LayoutContext";

// FolderMenu is the folder-tile right-click menu, reading handlers from
// LayoutContext. Owned / shared / trashed folders get different action sets.

const THEME = { card: "#fff", border: "#ccc", hoverRow: "#eee", text: "#000", subText: "#888" };

function renderMenu(folderMenu, over = {}) {
  const ctx = {
    theme: THEME, fileTree: null,
    starredFolders: new Set(), toggleStarFolder: jest.fn(), folderCidsOf: () => ["c1", "c2"],
    folderOrganizeOpen: false, setFolderOrganizeOpen: jest.fn(),
    downloadFolder: jest.fn(), openDetails: jest.fn(), setShareFile: jest.fn(), promptRenameFolder: jest.fn(),
    handleMoveFolder: jest.fn(), handleTrashFolder: jest.fn(), handleRestoreFolder: jest.fn(), handleDeleteFolderForever: jest.fn(),
    confirm: jest.fn().mockResolvedValue(true),
    ...over,
  };
  const setFolderMenu = jest.fn();
  render(
    <LayoutContext.Provider value={ctx}>
      <FolderMenu folderMenu={{ x: 0, y: 0, ...folderMenu }} setFolderMenu={setFolderMenu} />
    </LayoutContext.Provider>
  );
  return { ctx, setFolderMenu };
}

const owned = { name: "Docs", path: "/Docs", shared: false, trash: false };

test("an owned folder shows the full action set", () => {
  renderMenu(owned);
  ["Download", "Folder details", "Share", "Rename", "Organize", "Move to trash"].forEach((label) =>
    expect(screen.getByText(label)).toBeInTheDocument());
});

test("Download and Rename route to their handlers", () => {
  const { ctx } = renderMenu(owned);
  fireEvent.click(screen.getByText("Download"));
  expect(ctx.downloadFolder).toHaveBeenCalledWith("Docs", "/Docs");

  fireEvent.click(screen.getByText("Rename"));
  expect(ctx.promptRenameFolder).toHaveBeenCalledWith("Docs", "/Docs");
});

test("Share opens the share modal with the folder's cids", () => {
  const { ctx } = renderMenu(owned);
  fireEvent.click(screen.getByText("Share"));
  expect(ctx.setShareFile).toHaveBeenCalledWith(expect.objectContaining({
    folder: true, filename: "Docs", path: "/Docs", cids: ["c1", "c2"],
  }));
});

test("Move to trash and Folder details route to their handlers", () => {
  const { ctx } = renderMenu(owned);
  fireEvent.click(screen.getByText("Folder details"));
  expect(ctx.openDetails).toHaveBeenCalledWith(expect.objectContaining({ type: "folder", name: "Docs", path: "/Docs" }));

  fireEvent.click(screen.getByText("Move to trash"));
  expect(ctx.handleTrashFolder).toHaveBeenCalledWith("/Docs");
});

test("a shared folder hides owner-only actions", () => {
  renderMenu({ ...owned, shared: true });
  expect(screen.getByText("Download")).toBeInTheDocument();
  expect(screen.getByText("Folder details")).toBeInTheDocument();
  expect(screen.queryByText("Rename")).not.toBeInTheDocument();
  expect(screen.queryByText("Move to trash")).not.toBeInTheDocument();
  expect(screen.queryByText("Share")).not.toBeInTheDocument();
});

test("a trashed folder offers restore and delete-forever", () => {
  const { ctx } = renderMenu({ ...owned, trash: true });
  fireEvent.click(screen.getByText("Restore"));
  expect(ctx.handleRestoreFolder).toHaveBeenCalledWith("/Docs");

  fireEvent.click(screen.getByText("Delete forever"));
  expect(ctx.handleDeleteFolderForever).toHaveBeenCalledWith("/Docs");
});

test("the Organize submenu moves the folder after confirmation", async () => {
  // a destination folder exists in the tree, off the folder's own subtree
  const fileTree = {
    type: "folder", name: "/", children: [
      { type: "folder", name: "Docs", children: [] },
      { type: "folder", name: "Archive", children: [] },
    ],
  };
  const { ctx } = renderMenu(owned, { folderOrganizeOpen: true, fileTree });

  // "Move to" list is shown; pick /Archive
  fireEvent.click(screen.getByText("/Archive"));

  await waitFor(() => expect(ctx.confirm).toHaveBeenCalled());
  await waitFor(() => expect(ctx.handleMoveFolder).toHaveBeenCalledWith("/Docs", "/Archive"));
});
