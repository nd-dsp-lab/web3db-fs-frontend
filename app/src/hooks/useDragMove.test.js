import { renderHook, act } from "@testing-library/react";
import { useDragMove } from "./useDragMove";

// AppLayout covers that dragging a tile onto a folder moves it. What was
// unreachable from there is the branching: dragging part of a selection vs a
// lone item, the drops that are deliberately no-ops, and the Trash rule.

const file = (over = {}) => ({ cid: "c1", name: "a.txt", is_owner: true, ...over });
const folder = (over = {}) => ({ name: "Docs", fullPath: "/Docs", ...over });

function setup({
  view = "my-drive", currentPath = "/", files = [], folders = [], selectedKeys = [],
} = {}) {
  const calls = { move: [], moveFolder: [], bulkMove: [], cleared: 0 };
  const selectedSet = new Set(selectedKeys);
  const { result } = renderHook(() =>
    useDragMove({
      view, currentPath,
      theme: { navActive: "#eef" },
      selection: {
        files, folders,
        count: files.length + folders.length,
        has: (k) => selectedSet.has(k),
        clear: () => { calls.cleared += 1; },
      },
      folderPathOf: (i) => i.fullPath,
      folderKeyOf: (i) => `folder:${i.fullPath}`,
      handleMove: async (cid, to) => { calls.move.push([cid, to]); },
      handleMoveFolder: async (from, to) => { calls.moveFolder.push([from, to]); },
      handleBulkMove: async (f, p, dest) => { calls.bulkMove.push([f, p, dest]); },
    })
  );
  return { hook: result, calls };
}

// A drop event only needs the two methods the handler calls.
const dropEvent = () => {
  const e = { prevented: false, stopped: false };
  e.preventDefault = () => { e.prevented = true; };
  e.stopPropagation = () => { e.stopped = true; };
  return e;
};

const dropOn = async (hook, path) => {
  const e = dropEvent();
  await act(async () => { await hook.current.onInternalDropTo(e, path); });
  return e;
};

describe("what a drag picks up", () => {
  test("an unselected file drags alone", () => {
    const { hook } = setup({ files: [file(), file({ cid: "c2" })], selectedKeys: ["c2"] });
    act(() => hook.current.onFileDragStart(file()));

    expect(hook.current.draggedItem).toEqual({
      type: "file", cid: "c1", name: "a.txt", fromPath: "/",
    });
  });

  // Drive behaviour: grabbing one tile of a multi-selection drags all of it.
  test("a file inside a multi-selection drags the whole selection", () => {
    const { hook } = setup({
      files: [file(), file({ cid: "c2" })], selectedKeys: ["c1", "c2"],
    });
    act(() => hook.current.onFileDragStart(file()));

    expect(hook.current.draggedItem).toEqual({ type: "selection" });
  });

  // A selection of one is just that item; dragging it should not take the
  // "whole selection" path, which filters by ownership.
  test("a selection of one is not treated as a multi-selection", () => {
    const { hook } = setup({ files: [file()], selectedKeys: ["c1"] });
    act(() => hook.current.onFileDragStart(file()));

    expect(hook.current.draggedItem.type).toBe("file");
  });

  test("folders drag by path, and follow the same selection rule", () => {
    const { hook } = setup({ folders: [folder()] });
    act(() => hook.current.onFolderDragStart(folder()));
    expect(hook.current.draggedItem).toEqual({ type: "folder", path: "/Docs" });

    const multi = setup({
      files: [file()], folders: [folder()], selectedKeys: ["c1", "folder:/Docs"],
    });
    act(() => multi.hook.current.onFolderDragStart(folder()));
    expect(multi.hook.current.draggedItem).toEqual({ type: "selection" });
  });

  test("shared and trashed folders cannot be dragged at all", () => {
    const { hook } = setup();
    expect(hook.current.canDragFolder(folder())).toBe(true);
    expect(hook.current.canDragFolder(folder({ shared: true }))).toBe(false);
    expect(hook.current.canDragFolder(folder({ trash: true }))).toBe(false);
  });
});

describe("dropping", () => {
  test("a file moves into the destination folder", async () => {
    const { hook, calls } = setup();
    act(() => hook.current.onFileDragStart(file()));
    await dropOn(hook, "/Docs");

    expect(calls.move).toEqual([["c1", "/Docs/a.txt"]]);
  });

  test("dropping at the root builds a root path, not a double slash", async () => {
    const { hook, calls } = setup({ currentPath: "/Docs" });
    act(() => hook.current.onFileDragStart(file()));
    await dropOn(hook, "/");

    expect(calls.move).toEqual([["c1", "/a.txt"]]);
  });

  // Every move costs a wallet signature, so a drop that changes nothing must
  // not start one.
  test("dropping a file back where it already is does nothing", async () => {
    const { hook, calls } = setup({ currentPath: "/Docs" });
    act(() => hook.current.onFileDragStart(file()));
    await dropOn(hook, "/Docs");

    expect(calls.move).toEqual([]);
  });

  test("a folder moves by path", async () => {
    const { hook, calls } = setup({ folders: [folder()] });
    act(() => hook.current.onFolderDragStart(folder()));
    await dropOn(hook, "/Archive");

    expect(calls.moveFolder).toEqual([["/Docs", "/Archive"]]);
  });

  test("onFolderDrop resolves the target tile to its path", async () => {
    const { hook, calls } = setup();
    act(() => hook.current.onFileDragStart(file()));
    await act(async () => {
      await hook.current.onFolderDrop(dropEvent(), folder({ fullPath: "/Target" }));
    });

    expect(calls.move).toEqual([["c1", "/Target/a.txt"]]);
  });

  test("dropping with nothing in flight is a no-op", async () => {
    const { hook, calls } = setup();
    await dropOn(hook, "/Docs");

    expect([...calls.move, ...calls.moveFolder, ...calls.bulkMove]).toEqual([]);
  });

  // Trash is not a place you rearrange things.
  test("no drag-move happens inside the Trash view", async () => {
    const { hook, calls } = setup({ view: "trash" });
    act(() => hook.current.onFileDragStart(file()));
    await dropOn(hook, "/Docs");

    expect(calls.move).toEqual([]);
  });

  test("the drop is consumed so parent targets don't also handle it", async () => {
    const { hook } = setup();
    act(() => hook.current.onFileDragStart(file()));
    const e = await dropOn(hook, "/Docs");

    expect([e.prevented, e.stopped]).toEqual([true, true]);
  });

  // The move can take a signature and a confirmation; the drag itself is over
  // as soon as the pointer is released, so the highlight must not linger.
  test("the dragged item is cleared before the move is awaited", async () => {
    const { hook } = setup();
    act(() => hook.current.onFileDragStart(file()));
    await dropOn(hook, "/Docs");

    expect(hook.current.draggedItem).toBe(null);
  });
});

describe("dropping a whole selection", () => {
  test("moves every owned file and folder in one go, then clears", async () => {
    const mine = file({ cid: "mine" });
    const { hook, calls } = setup({
      files: [mine], folders: [folder({ fullPath: "/Mine" })],
      selectedKeys: ["mine", "folder:/Mine"],
    });
    act(() => hook.current.onFileDragStart(mine));
    await dropOn(hook, "/Dest");

    expect(calls.bulkMove).toEqual([[[mine], ["/Mine"], "/Dest"]]);
    expect(calls.cleared).toBe(1);
  });

  // A selection can mix ours with things shared to us; the parts we can't
  // move are dropped rather than the whole gesture being refused.
  test("items we cannot move are filtered out, not refused", async () => {
    const mine = file({ cid: "mine" });
    const theirs = file({ cid: "theirs", is_owner: false });
    const { hook, calls } = setup({
      files: [mine, theirs],
      folders: [
        folder({ fullPath: "/Mine" }),
        folder({ fullPath: "/Shared", shared: true }),
        folder({ fullPath: "/Gone", trash: true }),
      ],
      selectedKeys: ["mine", "theirs"],
    });
    act(() => hook.current.onFileDragStart(mine));
    await dropOn(hook, "/Dest");

    expect(calls.bulkMove).toEqual([[[mine], ["/Mine"], "/Dest"]]);
  });
});

describe("drop-target highlighting", () => {
  const target = () => {
    const el = { style: { backgroundColor: "transparent" } };
    return { currentTarget: el, preventDefault: () => {}, el };
  };

  test("lights up only while an internal drag is in flight", () => {
    const { hook } = setup();
    const idle = target();
    hook.current.dropHover(idle);
    expect(idle.el.style.backgroundColor).toBe("transparent");

    act(() => hook.current.onFileDragStart(file()));
    const active = target();
    hook.current.dropHover(active);
    expect(active.el.style.backgroundColor).toBe("#eef");
  });

  test("clears on leave", () => {
    const { hook } = setup();
    act(() => hook.current.onFileDragStart(file()));
    const t = target();
    hook.current.dropHover(t);
    hook.current.dropUnhover(t);

    expect(t.el.style.backgroundColor).toBe("transparent");
  });
});
