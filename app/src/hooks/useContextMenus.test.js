/* eslint-disable testing-library/no-node-access --
   These tests render no components. They build bare DOM nodes purely as the
   event targets that onBackgroundContextMenu runs .closest() against, so
   there is no Testing Library query that could reach them. */
import { renderHook, act } from "@testing-library/react";
import { useContextMenus } from "./useContextMenus";

// AppLayout covers that right-clicking opens the expected menu. What was
// hard to reach through the shell is the dismissal wiring -- which listeners
// exist when, and that they are torn down -- and the rule that a right-click
// inside a multi-selection acts on the selection instead of the item.

const folder = (over = {}) => ({ name: "Docs", fullPath: "/Docs", ...over });

function setup({ view = "my-drive", searchQuery = "", count = 0, selectedKeys = [] } = {}) {
  const keys = new Set(selectedKeys);
  return renderHook(() =>
    useContextMenus({
      view, searchQuery,
      selection: { count, has: (k) => keys.has(k) },
      folderPathOf: (i) => i.fullPath,
      folderKeyOf: (i) => `folder:${i.fullPath}`,
    })
  );
}

// A right-click event carrying just what the handlers touch.
const clickAt = (x = 10, y = 20, target = document.body) => {
  const e = { clientX: x, clientY: y, target, prevented: false, stopped: false };
  e.preventDefault = () => { e.prevented = true; };
  e.stopPropagation = () => { e.stopped = true; };
  return e;
};

const press = (key) =>
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
const clickOutside = () =>
  document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

afterEach(() => { document.body.innerHTML = ""; });

describe("opening menus", () => {
  test("a file right-click records the pointer position and the file", () => {
    const { result } = setup();
    const e = clickAt(30, 40);
    act(() => result.current.openMenuForFile(e, { cid: "c1" }));

    expect(result.current.contextMenu).toEqual({ x: 30, y: 40, file: { cid: "c1" } });
    expect([e.prevented, e.stopped]).toEqual([true, true]);
  });

  test("a folder right-click resolves the path and the folder's flags", () => {
    const { result } = setup();
    act(() => result.current.openMenuForFolder(clickAt(5, 6), folder({ trash: true })));

    expect(result.current.folderMenu).toEqual({
      x: 5, y: 6, name: "Docs", path: "/Docs", shared: false, trash: true,
    });
  });

  // Reopening a folder menu with its Organize submenu already expanded would
  // show the submenu before the pointer is anywhere near it.
  test("the Organize submenu starts collapsed each time", () => {
    const { result } = setup();
    act(() => result.current.setFolderOrganizeOpen(true));
    act(() => result.current.openMenuForFolder(clickAt(), folder()));

    expect(result.current.folderOrganizeOpen).toBe(false);
  });
});

describe("right-clicking inside a multi-selection", () => {
  test("opens the selection menu instead of the file's own", () => {
    const { result } = setup({ count: 2, selectedKeys: ["c1"] });
    act(() => result.current.openMenuForFile(clickAt(7, 8), { cid: "c1" }));

    expect(result.current.selMenu).toEqual({ x: 7, y: 8 });
    expect(result.current.contextMenu).toBe(null);
  });

  test("the same holds for folders", () => {
    const { result } = setup({ count: 2, selectedKeys: ["folder:/Docs"] });
    act(() => result.current.openMenuForFolder(clickAt(), folder()));

    expect(result.current.selMenu).not.toBe(null);
    expect(result.current.folderMenu).toBe(null);
  });

  // Right-clicking something outside the selection targets that item, which
  // is what lets a user act on one file while others stay selected.
  test("an item outside the selection still opens its own menu", () => {
    const { result } = setup({ count: 2, selectedKeys: ["c1", "c2"] });
    act(() => result.current.openMenuForFile(clickAt(), { cid: "other" }));

    expect(result.current.contextMenu.file).toEqual({ cid: "other" });
    expect(result.current.selMenu).toBe(null);
  });

  test("a selection of one is not a multi-selection", () => {
    const { result } = setup({ count: 1, selectedKeys: ["c1"] });
    act(() => result.current.openMenuForFile(clickAt(), { cid: "c1" }));

    expect(result.current.contextMenu).not.toBe(null);
  });
});

describe("the background menu", () => {
  test("opens on empty space in My Drive", () => {
    const { result } = setup();
    act(() => result.current.onBackgroundContextMenu(clickAt(1, 2)));

    expect(result.current.bgMenu).toEqual({ x: 1, y: 2 });
  });

  // It creates folders and starts uploads, both of which need a current path
  // that Shared, Trash, Starred and search results don't have.
  test("stays shut outside My Drive and in search results", () => {
    for (const props of [{ view: "shared" }, { view: "trash" }, { searchQuery: "report" }]) {
      const { result } = setup(props);
      const e = clickAt();
      act(() => result.current.onBackgroundContextMenu(e));

      expect(result.current.bgMenu).toBe(null);
      expect(e.prevented).toBe(false); // the browser menu is left alone
    }
  });

  test("a right-click aimed at something is not a background click", () => {
    for (const html of ['<div data-cid="c1"></div>', "<button></button>", "<a></a>", "<input>"]) {
      document.body.innerHTML = html;
      const { result } = setup();
      act(() => result.current.onBackgroundContextMenu(clickAt(1, 2, document.body.firstChild)));

      expect(result.current.bgMenu).toBe(null);
    }
  });

  test("a right-click on a child of a tile still counts as aimed at it", () => {
    document.body.innerHTML = '<div data-cid="c1"><span id="label">a.txt</span></div>';
    const { result } = setup();
    act(() =>
      result.current.onBackgroundContextMenu(clickAt(1, 2, document.getElementById("label")))
    );

    expect(result.current.bgMenu).toBe(null);
  });
});

describe("dismissal", () => {
  const openBg = (result) => act(() => result.current.onBackgroundContextMenu(clickAt()));

  test("Escape closes an open right-click menu", () => {
    const { result } = setup();
    openBg(result);
    act(() => { press("Escape"); });

    expect(result.current.bgMenu).toBe(null);
  });

  test("a click anywhere else closes it too", () => {
    const { result } = setup();
    openBg(result);
    act(() => { clickOutside(); });

    expect(result.current.bgMenu).toBe(null);
  });

  test("closing clears every right-click menu and the submenu together", () => {
    const { result } = setup();
    act(() => result.current.openMenuForFolder(clickAt(), folder()));
    act(() => result.current.setFolderOrganizeOpen(true));
    act(() => { press("Escape"); });

    expect([
      result.current.folderMenu, result.current.bgMenu,
      result.current.selMenu, result.current.folderOrganizeOpen,
    ]).toEqual([null, null, null, false]);
  });

  test("the New dropdown closes on Escape and on an outside click", () => {
    for (const dismiss of [() => press("Escape"), clickOutside]) {
      const { result } = setup();
      act(() => result.current.setIsNewMenuOpen(true));
      act(() => { dismiss(); });

      expect(result.current.isNewMenuOpen).toBe(false);
    }
  });

  // The file context menu closes by its own onClose, not by these listeners.
  test("the file context menu is not dismissed by Escape", () => {
    const { result } = setup();
    act(() => result.current.openMenuForFile(clickAt(), { cid: "c1" }));
    act(() => { press("Escape"); });

    expect(result.current.contextMenu).not.toBe(null);
    act(() => result.current.closeContextMenu());
    expect(result.current.contextMenu).toBe(null);
  });

  // Listeners should exist only while something is open, and must not
  // outlive the component.
  test("no document listeners are left behind", () => {
    const added = [];
    const addSpy = vi.spyOn(document, "addEventListener")
      .mockImplementation((...a) => { added.push(a.slice(0, 2)); });
    const removed = [];
    const removeSpy = vi.spyOn(document, "removeEventListener")
      .mockImplementation((...a) => { removed.push(a.slice(0, 2)); });

    const { result, unmount } = setup();
    act(() => result.current.onBackgroundContextMenu(clickAt()));
    expect(added).toHaveLength(2); // mousedown + keydown

    unmount();
    expect(removed.map(([type]) => type).sort()).toEqual(["keydown", "mousedown"]);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  test("nothing is listening while every menu is closed", () => {
    const added = [];
    const spy = vi.spyOn(document, "addEventListener")
      .mockImplementation((...a) => { added.push(a[0]); });
    setup();

    expect(added).toEqual([]);
    spy.mockRestore();
  });
});
