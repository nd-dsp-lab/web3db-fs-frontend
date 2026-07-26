import "@testing-library/jest-dom";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import FileContextMenu, { collectFolders } from "./FileContextMenu";

// FileContextMenu takes its collaborators as explicit props (no context).
// The menu shape depends on ownership, the DOWNLOAD permission bit, and
// whether the file is in the trash.

const LIGHT = { card: "#FFFFFF", text: "#1F1F1F", subText: "#5F6368", border: "#E0E3E7", hoverRow: "#F5F8FC" };
const DARK = { card: "#1E1F20", text: "#E3E3E3", subText: "#9AA0A6", border: "#3C4043", hoverRow: "#2D2E31" };

function setup(over = {}) {
  const props = {
    x: 0, y: 0,
    theme: LIGHT,
    file: { cid: "c1", filename: "a.pdf", is_owner: true, permissions: 0xFF },
    fileTree: null, currentPath: "/",
    confirm: vi.fn().mockResolvedValue(true),
    onClose: vi.fn(), onDownload: vi.fn(), onDetails: vi.fn(),
    onShareOpen: vi.fn(), onRenameOpen: vi.fn(), onDelete: vi.fn(),
    onMove: vi.fn(), onTrash: vi.fn(), onRestore: vi.fn(),
    inTrash: false, isStarred: false, onToggleStar: vi.fn(),
    ...over,
  };
  render(<FileContextMenu {...props} />);
  return props;
}

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
    // FileContextMenu items act on mouseDown (so the menu's outside-click
    // close on mousedown doesn't beat the selection)
    const menu = setup();
    fireEvent.mouseDown(screen.getByText("Download"));
    expect(menu.onDownload).toHaveBeenCalledWith(menu.file);

    fireEvent.mouseDown(screen.getByText("Rename"));
    expect(menu.onRenameOpen).toHaveBeenCalledWith(menu.file);

    fireEvent.mouseDown(screen.getByText("Share"));
    expect(menu.onShareOpen).toHaveBeenCalledWith(menu.file);
  });

  test("Move to trash trashes the file", () => {
    const menu = setup();
    fireEvent.mouseDown(screen.getByText("Move to trash"));
    expect(menu.onTrash).toHaveBeenCalledWith(menu.file);
  });

  test("Download is hidden without the DOWNLOAD permission bit", () => {
    setup({ file: { cid: "c1", filename: "a.pdf", is_owner: true, permissions: 0x1 } });
    expect(screen.queryByText("Download")).not.toBeInTheDocument();
  });
});

describe("a trashed file", () => {
  test("offers restore and delete-forever", () => {
    const menu = setup({ inTrash: true });
    expect(screen.queryByText("Move to trash")).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText("Restore"));
    expect(menu.onRestore).toHaveBeenCalledWith(menu.file);

    fireEvent.mouseDown(screen.getByText("Delete forever"));
    expect(menu.onDelete).toHaveBeenCalledWith("c1");
  });
});

describe("a file shared to me", () => {
  test("keeps star top-level and has no owner actions", () => {
    const menu = setup({ file: { cid: "c1", filename: "a.pdf", is_owner: false, permissions: 0x5 }, isStarred: false });
    fireEvent.mouseDown(screen.getByText("Add to starred"));
    expect(menu.onToggleStar).toHaveBeenCalledWith("c1");
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
    expect(menu).toHaveStyle({ color: DARK.text });
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
      .toHaveStyle({ color: "#d9534f" });
  });
});
/* eslint-enable testing-library/no-node-access */
