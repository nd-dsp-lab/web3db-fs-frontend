import { renderHook, act } from "@testing-library/react";
import { useExternalDropUpload } from "./useExternalDropUpload";

// The drop overlay and the "wrong view" hint are covered through AppLayout.
// What could only be reached from here is the directory walk: dropping a
// folder yields FileSystemEntry objects that have to be recursed, batched and
// flattened into paths, and none of that was exercised before.

function setup({ view = "my-drive", searchQuery = "" } = {}) {
  const calls = { uploads: [], toasts: [] };
  const toast = {
    info: (m) => calls.toasts.push(["info", m]),
    error: (m) => calls.toasts.push(["error", m]),
  };
  const { result } = renderHook(() =>
    useExternalDropUpload({
      view, searchQuery, toast,
      handleDropUpload: (items) => calls.uploads.push(items),
    })
  );
  return { hook: result, calls };
}

// --- FileSystemEntry stand-ins ---

const fileEntry = (name) => ({
  isFile: true, isDirectory: false, name,
  file: (res) => res(new File(["x"], name)),
});

// batches models readEntries' contract: successive calls return successive
// chunks, and an empty array marks the end.
const dirEntry = (name, children, { batchSize = 100, fail = false } = {}) => ({
  isFile: false, isDirectory: true, name,
  createReader() {
    let i = 0;
    return {
      readEntries(onOk, onErr) {
        if (fail) return onErr(new Error("permission denied"));
        const batch = children.slice(i, i + batchSize);
        i += batch.length;
        onOk(batch);
      },
    };
  },
});

const dropEvent = (entries, files = []) => ({
  dataTransfer: {
    types: ["Files"],
    items: entries.map((e) => ({ webkitGetAsEntry: () => e })),
    files,
  },
  preventDefault: () => {},
});

const drop = async (hook, event) => {
  await act(async () => { await hook.current.onExternalDrop(event); });
};

const dragEvent = () => ({ dataTransfer: { types: ["Files"] }, preventDefault: () => {} });

describe("the drop overlay", () => {
  test("appears while files are dragged over My Drive", () => {
    const { hook } = setup();
    act(() => hook.current.onDragEnter(dragEvent()));

    expect(hook.current.dragOver).toBe(true);
  });

  // dragenter/dragleave fire again for every child element the pointer
  // crosses. A plain boolean would flicker off on the first inner element.
  test("survives the pointer crossing nested children", () => {
    const { hook } = setup();
    act(() => hook.current.onDragEnter(dragEvent()));
    act(() => hook.current.onDragEnter(dragEvent()));
    act(() => hook.current.onDragLeave(dragEvent()));

    expect(hook.current.dragOver).toBe(true);

    act(() => hook.current.onDragLeave(dragEvent()));
    expect(hook.current.dragOver).toBe(false);
  });

  test("stays hidden where dropping is not allowed", () => {
    for (const props of [{ view: "shared" }, { view: "trash" }, { searchQuery: "report" }]) {
      const { hook } = setup(props);
      act(() => hook.current.onDragEnter(dragEvent()));
      expect(hook.current.dragOver).toBe(false);
    }
  });

  // Dragging a tile between folders is an internal drag with no "Files" type;
  // the same element handles both, so they must not interfere.
  test("an internal tile drag is ignored entirely", () => {
    const { hook } = setup();
    const internal = { dataTransfer: { types: ["text/plain"] }, preventDefault: () => {} };
    act(() => hook.current.onDragEnter(internal));

    expect(hook.current.dragOver).toBe(false);
  });
});

describe("dropping folders", () => {
  test("a nested tree is flattened into paths the backend can recreate", async () => {
    const { hook, calls } = setup();
    const tree = dirEntry("docs", [
      fileEntry("a.txt"),
      dirEntry("sub", [fileEntry("b.txt")]),
    ]);
    await drop(hook, dropEvent([tree]));

    expect(calls.uploads[0].map((i) => i.rel)).toEqual(["docs/a.txt", "docs/sub/b.txt"]);
  });

  test("loose files dropped alongside a folder keep their bare names", async () => {
    const { hook, calls } = setup();
    await drop(hook, dropEvent([fileEntry("top.txt"), dirEntry("docs", [fileEntry("a.txt")])]));

    expect(calls.uploads[0].map((i) => i.rel)).toEqual(["top.txt", "docs/a.txt"]);
  });

  // readEntries returns at most ~100 children per call, so a folder larger
  // than that is only fully read if the reader is called until it comes back
  // empty. A single call would silently upload the first chunk.
  test("a folder larger than one batch is read to the end", async () => {
    const { hook, calls } = setup();
    const many = Array.from({ length: 250 }, (_, i) => fileEntry(`f${i}.txt`));
    await drop(hook, dropEvent([dirEntry("big", many, { batchSize: 100 })]));

    expect(calls.uploads[0]).toHaveLength(250);
    expect(calls.uploads[0][249].rel).toBe("big/f249.txt");
  });

  test("an unreadable folder is reported and uploads nothing", async () => {
    const { hook, calls } = setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await drop(hook, dropEvent([dirEntry("locked", [], { fail: true })]));

    expect(calls.toasts).toEqual([["error", "Could not read the dropped folder"]]);
    expect(calls.uploads).toEqual([]);
    vi.restoreAllMocks();
  });

  test("an empty folder says so rather than starting an upload of nothing", async () => {
    const { hook, calls } = setup();
    await drop(hook, dropEvent([dirEntry("empty", [])]));

    expect(calls.toasts).toEqual([["info", "Dropped folder is empty"]]);
    expect(calls.uploads).toEqual([]);
  });
});

describe("browsers without the entry API", () => {
  test("falls back to the flat file list", async () => {
    const { hook, calls } = setup();
    const event = {
      dataTransfer: { types: ["Files"], items: [{}], files: [new File(["x"], "a.pdf")] },
      preventDefault: () => {},
    };
    await drop(hook, event);

    expect(calls.uploads[0].map((i) => i.rel)).toEqual(["a.pdf"]);
  });

  test("an empty drop uploads nothing at all", async () => {
    const { hook, calls } = setup();
    await drop(hook, dropEvent([], []));

    expect(calls.uploads).toEqual([]);
    expect(calls.toasts).toEqual([]);
  });
});

describe("dropping where uploads cannot land", () => {
  test("is refused with a hint and clears the overlay", async () => {
    const { hook, calls } = setup({ view: "shared" });
    act(() => hook.current.onDragEnter(dragEvent()));
    await drop(hook, dropEvent([fileEntry("a.txt")]));

    expect(calls.toasts).toEqual([["info", "Switch to My Drive to upload by dropping files"]]);
    expect(calls.uploads).toEqual([]);
    expect(hook.current.dragOver).toBe(false);
  });
});
