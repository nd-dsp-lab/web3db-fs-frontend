import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import FileContextMenu, { collectFolders } from "./FileContextMenu";

// FileContextMenu takes its collaborators as explicit props (no context).
// The menu shape depends on ownership, the DOWNLOAD permission bit, and
// whether the file is in the trash.

function setup(over = {}) {
  const props = {
    x: 0, y: 0,
    file: { cid: "c1", filename: "a.pdf", is_owner: true, permissions: 0xFF },
    fileTree: null, currentPath: "/",
    confirm: jest.fn().mockResolvedValue(true),
    onClose: jest.fn(), onDownload: jest.fn(), onDetails: jest.fn(),
    onShareOpen: jest.fn(), onRenameOpen: jest.fn(), onDelete: jest.fn(),
    onMove: jest.fn(), onTrash: jest.fn(), onRestore: jest.fn(),
    inTrash: false, isStarred: false, onToggleStar: jest.fn(),
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
