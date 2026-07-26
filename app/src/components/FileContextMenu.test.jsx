import "@testing-library/jest-dom";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import FileContextMenu, { collectFolders } from "./FileContextMenu";
import { LayoutContext } from "../contexts/LayoutContext";
import { TRASH_PREFIX } from "../lib/constants";
import { DANGER } from "../lib/theme";

// FileContextMenu pulls its collaborators from LayoutContext. The menu shape
// depends on ownership, the DOWNLOAD permission bit, and whether the file is
// in the trash -- the last two read off the file itself.

const LIGHT = { card: "#FFFFFF", text: "#1F1F1F", subText: "#5F6368", border: "#E0E3E7", hoverRow: "#F5F8FC" };
const DARK = { card: "#1E1F20", text: "#E3E3E3", subText: "#9AA0A6", border: "#3C4043", hoverRow: "#2D2E31" };

function setup(over = {}) {
  const { file, ...rest } = over;
  const subject = file || { cid: "c1", filename: "a.pdf", is_owner: true, permissions: 0xFF };
  const ctx = {
    theme: LIGHT, fileTree: null, currentPath: "/",
    confirm: vi.fn().mockResolvedValue(true),
    starred: new Set(),
    downloadFile: vi.fn(), openDetails: vi.fn(), setShareFile: vi.fn(),
    promptRenameFile: vi.fn(), toggleStar: vi.fn(),
    handleDelete: vi.fn(), handleMove: vi.fn(), handleTrash: vi.fn(), handleRestore: vi.fn(),
    ...rest,
  };
  const onClose = vi.fn();
  render(
    <LayoutContext.Provider value={ctx}>
      <FileContextMenu x={0} y={0} file={subject} onClose={onClose} />
    </LayoutContext.Provider>
  );
  return { ...ctx, file: subject, onClose };
}

const trashed = (over = {}) => ({
  cid: "c1", filename: "a.pdf", is_owner: true, permissions: 0xFF,
  folder_path: TRASH_PREFIX, ...over,
});

describe("collectFolders", () => {
  test("flattens folder nodes to label/path pairs, skipping root", () => {
    const tree = {
      type: "folder", name: "/", children: [
        { type: "folder", name: "Docs", children: [{ type: "folder", name: "Sub", children: [] }] },
        { type: "file", name: "x.txt" },
      ],
    };
    expect(collectFolders(tree)).toEqual([
      { label: "/Docs", path: "/Docs" },
      { label: "/Docs/Sub", path: "/Docs/Sub" },
    ]);
  });

  test("tolerates a null tree", () => {
    expect(collectFolders(null)).toEqual([]);
  });
});

describe("an owned file", () => {
  test("shows the full action set", () => {
    setup();
    ["Download", "File details", "Rename", "Share", "Move to trash"].forEach((label) =>
      expect(screen.getByText(label)).toBeInTheDocument());
  });

  test("Download, Rename and Share route to their handlers", () => {
    // Rows act on click, like every other menu. The panel swallows mousedown,
    // so the outside-click close never sees a press on a row of its own menu.
    const menu = setup();
    fireEvent.click(screen.getByText("Download"));
    expect(menu.downloadFile).toHaveBeenCalledWith(menu.file);

    fireEvent.click(screen.getByText("Rename"));
    expect(menu.promptRenameFile).toHaveBeenCalledWith(menu.file);

    fireEvent.click(screen.getByText("Share"));
    expect(menu.setShareFile).toHaveBeenCalledWith(menu.file);
  });

  test("Move to trash trashes the file", () => {
    const menu = setup();
    fireEvent.click(screen.getByText("Move to trash"));
    expect(menu.handleTrash).toHaveBeenCalledWith(menu.file);
  });

  test("Download is hidden without the DOWNLOAD permission bit", () => {
    setup({ file: { cid: "c1", filename: "a.pdf", is_owner: true, permissions: 0x1 } });
    expect(screen.queryByText("Download")).not.toBeInTheDocument();
  });
});

describe("a trashed file", () => {
  test("offers restore and delete-forever", () => {
    const menu = setup({ file: trashed() });
    expect(screen.queryByText("Move to trash")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Restore"));
    expect(menu.handleRestore).toHaveBeenCalledWith(menu.file);

    fireEvent.click(screen.getByText("Delete forever"));
    expect(menu.handleDelete).toHaveBeenCalledWith("c1");
  });
});

describe("a file shared to me", () => {
  test("keeps star top-level and has no owner actions", () => {
    const menu = setup({ file: { cid: "c1", filename: "a.pdf", is_owner: false, permissions: 0x5 } });
    fireEvent.click(screen.getByText("Add to starred"));
    expect(menu.toggleStar).toHaveBeenCalledWith("c1");
    expect(screen.queryByText("Move to trash")).not.toBeInTheDocument();
  });
});

// This menu used to hardcode a light palette, so in dark mode right-clicking
// a folder gave a dark menu and right-clicking a file gave a white one.
/* eslint-disable testing-library/no-node-access --
   The themed surfaces are the menu panel and the row wrappers, which carry no
   role or label of their own; they are reached from the label they contain. */
describe("theming", () => {
  const menuOf = (label) => screen.getByText(label).closest("div[style*='position: fixed']");

  test("the menu paints itself from the theme it is given", () => {
    setup({ theme: DARK });
    const menu = menuOf("Download");

    expect(menu).toHaveStyle({ backgroundColor: DARK.card });
    // Text colour lives on the row, which is what carries the label.
    expect(screen.getByText("Download").closest("div[style*='cursor: pointer']"))
      .toHaveStyle({ color: DARK.text });
  });

  test("light and dark produce different surfaces", () => {
    setup({ theme: LIGHT });
    expect(menuOf("Download")).toHaveStyle({ backgroundColor: LIGHT.card });
    cleanup();

    setup({ theme: DARK });
    expect(menuOf("Download")).toHaveStyle({ backgroundColor: DARK.card });
  });

  test("row hover uses the themed hover colour", () => {
    setup({ theme: DARK });
    const row = screen.getByText("Download").closest("div[style*='cursor: pointer']");

    fireEvent.mouseEnter(row);
    expect(row).toHaveStyle({ background: DARK.hoverRow });
    fireEvent.mouseLeave(row);
    expect(row).not.toHaveStyle({ background: DARK.hoverRow });
  });

  test("the destructive action stays red on both themes", () => {
    setup({ theme: DARK });
    expect(screen.getByText("Move to trash").closest("div[style*='cursor: pointer']"))
      .toHaveStyle({ color: DANGER });
  });
});
/* eslint-enable testing-library/no-node-access */

// inTrash and isStarred used to be passed in already computed. They are now
// derived here, so what they are derived *from* is worth pinning.
describe("derived state", () => {
  test("a file under the trash prefix gets the trash menu without being told", () => {
    setup({ file: trashed() });

    expect(screen.getByText("Restore")).toBeInTheDocument();
    expect(screen.queryByText("Share")).not.toBeInTheDocument();
  });

  test("a file in an ordinary folder does not", () => {
    setup({ file: { cid: "c1", filename: "a.pdf", is_owner: true, permissions: 0xFF, folder_path: "/docs" } });

    expect(screen.queryByText("Restore")).not.toBeInTheDocument();
    expect(screen.getByText("Move to trash")).toBeInTheDocument();
  });

  test("the star label follows the starred set", () => {
    setup({
      file: { cid: "c1", filename: "a.pdf", is_owner: false, permissions: 0x5 },
      starred: new Set(["c1"]),
    });
    expect(screen.getByText("Remove from starred")).toBeInTheDocument();
  });

  test("a file missing from the starred set offers to add it", () => {
    setup({ file: { cid: "c1", filename: "a.pdf", is_owner: false, permissions: 0x5 } });
    expect(screen.getByText("Add to starred")).toBeInTheDocument();
  });
});

describe("moving via the Organize submenu", () => {
  const tree = {
    type: "folder", name: "/", children: [
      { type: "folder", name: "Docs", children: [] },
    ],
  };

  test("moves the file into the chosen folder, after confirming", async () => {
    const menu = setup({ fileTree: tree, currentPath: "/" });
    fireEvent.mouseEnter(screen.getByText("Organize"));
    fireEvent.click(screen.getByText("/Docs"));
    await vi.waitFor(() => expect(menu.handleMove).toHaveBeenCalled());

    expect(menu.confirm).toHaveBeenCalled();
    expect(menu.handleMove).toHaveBeenCalledWith("c1", "/Docs/a.pdf");
  });

  // Moving to the root must not produce "//a.pdf".
  test("moving to the root builds a single-slash path", async () => {
    const menu = setup({ fileTree: tree, currentPath: "/Docs" });
    fireEvent.mouseEnter(screen.getByText("Organize"));
    fireEvent.click(screen.getByText("/", { selector: "div" }));
    await vi.waitFor(() => expect(menu.handleMove).toHaveBeenCalled());

    expect(menu.handleMove).toHaveBeenCalledWith("c1", "/a.pdf");
  });

  test("declining the confirm moves nothing", async () => {
    const menu = setup({
      fileTree: tree, currentPath: "/", confirm: vi.fn().mockResolvedValue(false),
    });
    fireEvent.mouseEnter(screen.getByText("Organize"));
    fireEvent.click(screen.getByText("/Docs"));
    await vi.waitFor(() => expect(menu.confirm).toHaveBeenCalled());

    expect(menu.handleMove).not.toHaveBeenCalled();
  });
});
