import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import SelectionMenu from "./SelectionMenu";
import { LayoutContext } from "../contexts/LayoutContext";

// SelectionMenu is the right-click menu over a multi-selection. It reads
// everything from LayoutContext, so tests provide a stub context and assert
// the bulk handlers fire (and the menu closes) on each action.

const THEME = { card: "#fff", border: "#ccc", hoverRow: "#eee", text: "#000", subText: "#888" };

function renderMenu(over = {}) {
  const ctx = {
    theme: THEME, selectedCount: 2, view: "my-drive",
    selectedFiles: [{ cid: "c1", is_owner: true }, { cid: "c2", is_owner: true }],
    selectedFolders: [],
    starred: new Set(), starredFolders: new Set(),
    folderPathOf: (i) => i.fullPath || `/${i.name}`,
    toggleStarMany: jest.fn(), ownedSelection: true,
    openShareForSelection: jest.fn(), downloadSelection: jest.fn(), clearSelection: jest.fn(),
    handleBulkRestore: jest.fn(), handleBulkDelete: jest.fn(), handleBulkTrash: jest.fn(),
    ...over,
  };
  const setSelMenu = jest.fn();
  render(
    <LayoutContext.Provider value={ctx}>
      <SelectionMenu selMenu={{ x: 0, y: 0 }} setSelMenu={setSelMenu} />
    </LayoutContext.Provider>
  );
  return { ctx, setSelMenu };
}

test("shows the count and the my-drive actions", () => {
  renderMenu();
  expect(screen.getByText("2 selected")).toBeInTheDocument();
  expect(screen.getByText("Add to starred")).toBeInTheDocument();
  expect(screen.getByText("Share")).toBeInTheDocument();
  expect(screen.getByText("Download")).toBeInTheDocument();
  expect(screen.getByText("Move to trash")).toBeInTheDocument();
});

test("Move to trash trashes the owned selection and closes the menu", () => {
  const { ctx, setSelMenu } = renderMenu();
  fireEvent.click(screen.getByText("Move to trash"));

  expect(setSelMenu).toHaveBeenCalledWith(null);
  expect(ctx.handleBulkTrash.mock.calls[0][0].map((f) => f.cid)).toEqual(["c1", "c2"]);
  expect(ctx.clearSelection).toHaveBeenCalled();
});

test("Share and star route to their handlers", () => {
  const { ctx } = renderMenu();
  fireEvent.click(screen.getByText("Share"));
  expect(ctx.openShareForSelection).toHaveBeenCalled();

  fireEvent.click(screen.getByText("Add to starred"));
  expect(ctx.toggleStarMany).toHaveBeenCalledWith(["c1", "c2"], []);
});

test("Download downloads and clears the selection", () => {
  const { ctx } = renderMenu();
  fireEvent.click(screen.getByText("Download"));
  expect(ctx.downloadSelection).toHaveBeenCalled();
  expect(ctx.clearSelection).toHaveBeenCalled();
});

test("a non-owned selection hides Share", () => {
  renderMenu({ ownedSelection: false });
  expect(screen.queryByText("Share")).not.toBeInTheDocument();
});

test("in Trash the menu offers restore and delete-forever instead", () => {
  const { ctx } = renderMenu({ view: "trash" });
  expect(screen.queryByText("Move to trash")).not.toBeInTheDocument();
  expect(screen.queryByText("Share")).not.toBeInTheDocument();

  fireEvent.click(screen.getByText("Restore"));
  expect(ctx.handleBulkRestore).toHaveBeenCalled();

  fireEvent.click(screen.getByText("Delete forever"));
  expect(ctx.handleBulkDelete).toHaveBeenCalled();
});
