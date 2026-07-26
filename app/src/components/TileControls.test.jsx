import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { MoreButton, SelectBox } from "./TileControls";
import { LayoutContext } from "../contexts/LayoutContext";

// The remount regression these were extracted to fix is covered from
// AppLayout, where the render body actually is. These cover the behaviour of
// the two controls themselves.

const theme = { subText: "#5F6368" };

function mountWith(ui, over = {}) {
  const calls = { fileMenu: [], folderMenu: [], toggled: [] };
  const ctx = {
    theme,
    openMenuForFile: (e, item) => calls.fileMenu.push(item),
    openMenuForFolder: (e, item) => calls.folderMenu.push(item),
    selected: new Set(over.selected || []),
    toggleSelect: (cid) => calls.toggled.push(cid),
  };
  render(<LayoutContext.Provider value={ctx}>{ui}</LayoutContext.Provider>);
  return calls;
}

describe("MoreButton", () => {
  test("routes to the file or the folder menu by item type", () => {
    const file = { type: "file", cid: "c1" };
    const calls = mountWith(<MoreButton item={file} visible />);
    fireEvent.click(screen.getByTitle("More actions"));

    expect(calls.fileMenu).toEqual([file]);
    expect(calls.folderMenu).toEqual([]);
  });

  test("a folder opens the folder menu instead", () => {
    const folder = { type: "folder", name: "Docs" };
    const calls = mountWith(<MoreButton item={folder} visible />);
    fireEvent.click(screen.getByTitle("More actions"));

    expect(calls.folderMenu).toEqual([folder]);
  });

  // Hiding it with opacity rather than unmounting keeps the tile from
  // reflowing as the pointer moves across the grid.
  test("stays in the layout when hidden", () => {
    mountWith(<MoreButton item={{ type: "file" }} visible={false} />);
    const btn = screen.getByTitle("More actions");

    expect(btn).toBeInTheDocument();
    expect(btn).toHaveStyle({ opacity: "0" });
  });
});

describe("SelectBox", () => {
  test("reflects and toggles the selection", () => {
    const calls = mountWith(<SelectBox cid="c1" visible />, { selected: ["c1"] });
    const box = screen.getByRole("checkbox");
    expect(box).toBeChecked();

    fireEvent.click(box);
    expect(calls.toggled).toEqual(["c1"]);
  });

  test("an unselected box is unchecked", () => {
    mountWith(<SelectBox cid="c1" visible />);
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  // The tile behind it opens the file on click; ticking the box must not.
  test("a click does not reach the tile behind it", () => {
    const onTileClick = vi.fn();
    mountWith(
      <div onClick={onTileClick}>
        <SelectBox cid="c1" visible />
      </div>
    );
    fireEvent.click(screen.getByRole("checkbox"));

    expect(onTileClick).not.toHaveBeenCalled();
  });

  // Once anything is selected every box shows, so the selection stays visible
  // when the pointer leaves the tile.
  test("a selected box is visible even when not hovered", () => {
    mountWith(<SelectBox cid="c1" visible={false} />, { selected: ["c1"] });
    expect(screen.getByRole("checkbox")).toHaveStyle({ opacity: "1" });
  });

  test("an unselected, unhovered box is transparent but present", () => {
    mountWith(<SelectBox cid="c1" visible={false} />);
    expect(screen.getByRole("checkbox")).toHaveStyle({ opacity: "0" });
  });
});
