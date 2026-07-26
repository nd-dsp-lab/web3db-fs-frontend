import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

// AppLayout covers that the shortcuts are wired up and that open panels
// suppress them. These drive the handler directly, where the combinations
// that are awkward to stage through the full shell -- mixed ownership, the
// Trash variants, typing in a field -- are reachable.

const file = (over = {}) => ({ cid: "c1", name: "a.txt", is_owner: true, ...over });
const folder = (over = {}) => ({ name: "Docs", fullPath: "/Docs", ...over });

function setup({ view = "my-drive", enabled = true, files = [], folders = [] } = {}) {
  const calls = { renameFile: [], renameFolder: [], bulkTrash: [], bulkDelete: [], star: [], cleared: 0 };
  const actions = {
    renameFile: (f) => calls.renameFile.push(f),
    renameFolder: (i) => calls.renameFolder.push(i),
    bulkTrash: (f, p) => calls.bulkTrash.push([f, p]),
    bulkDelete: (f, p) => calls.bulkDelete.push([f, p]),
    toggleStarMany: (cids, paths) => calls.star.push([cids, paths]),
  };
  renderHook(() =>
    useKeyboardShortcuts({
      enabled, view,
      selection: {
        files, folders,
        count: files.length + folders.length,
        clear: () => { calls.cleared += 1; },
      },
      folderPathOf: (i) => i.fullPath,
      actions,
    })
  );
  return { calls };
}

// Dispatches a real keydown so the document listener under test is what runs.
function press(key, { code, meta = false, alt = false, target } = {}) {
  const e = new KeyboardEvent("keydown", {
    key, code: code ?? key, metaKey: meta, altKey: alt, bubbles: true, cancelable: true,
  });
  (target || document.body).dispatchEvent(e);
  return e;
}

const RENAME = { key: "F2" };
const STAR = { key: "s", code: "KeyS", meta: true, alt: true };

afterEach(() => { document.body.innerHTML = ""; });

describe("rename", () => {
  test("F2 and ⌥⌘E both rename a single owned file", () => {
    for (const keys of [RENAME, { key: "e", code: "KeyE", meta: true, alt: true }]) {
      const { calls } = setup({ files: [file()] });
      press(keys.key, keys);

      expect(calls.renameFile).toHaveLength(1);
      expect(calls.cleared).toBe(1);
    }
  });

  test("renaming a single folder goes to the folder path instead", () => {
    const { calls } = setup({ folders: [folder()] });
    press("F2");

    expect(calls.renameFolder).toEqual([folder()]);
  });

  // Renaming two things at once has no meaning, so the key should do nothing
  // rather than pick one arbitrarily.
  test("a multi-selection is left alone", () => {
    const { calls } = setup({ files: [file(), file({ cid: "c2" })] });
    press("F2");

    expect(calls.renameFile).toEqual([]);
    expect(calls.cleared).toBe(0);
  });

  test("nothing we cannot rename is renamed", () => {
    const cases = [
      { files: [file({ is_owner: false })] },        // someone else's file
      { folders: [folder({ shared: true })] },       // folder shared to us
      { folders: [folder({ trash: true })] },        // folder in the trash
      { files: [file()], view: "trash" },            // trash is read-only
    ];
    for (const c of cases) {
      const { calls } = setup(c);
      press("F2");
      expect([...calls.renameFile, ...calls.renameFolder]).toEqual([]);
    }
  });
});

describe("delete", () => {
  test("Delete and Backspace both move the selection to the trash", () => {
    for (const key of ["Delete", "Backspace"]) {
      const { calls } = setup({ files: [file()], folders: [folder()] });
      press(key);

      expect(calls.bulkTrash).toEqual([[[file()], ["/Docs"]]]);
      expect(calls.bulkDelete).toEqual([]);
      expect(calls.cleared).toBe(1);
    }
  });

  // A selection can legitimately mix things we own with things shared to us.
  // The un-ownable parts are skipped rather than refusing the whole action.
  test("items we cannot trash are dropped from the request", () => {
    const mine = file({ cid: "mine" });
    const theirs = file({ cid: "theirs", is_owner: false });
    const { calls } = setup({
      files: [mine, theirs],
      folders: [folder({ fullPath: "/Mine" }), folder({ fullPath: "/Theirs", shared: true })],
    });
    press("Delete");

    expect(calls.bulkTrash).toEqual([[[mine], ["/Mine"]]]);
  });

  // In Trash there is nowhere further to move something, so the same key has
  // to mean delete-forever -- the confirm lives downstream in handleBulkDelete.
  test("in Trash the same key deletes forever, ownership filter and all", () => {
    const theirs = file({ cid: "theirs", is_owner: false });
    const { calls } = setup({ view: "trash", files: [theirs], folders: [folder()] });
    press("Delete");

    expect(calls.bulkDelete).toEqual([[[theirs], ["/Docs"]]]);
    expect(calls.bulkTrash).toEqual([]);
  });

  test("an empty selection does nothing at all", () => {
    const { calls } = setup();
    press("Delete");

    expect(calls.bulkTrash).toEqual([]);
    expect(calls.cleared).toBe(0);
  });
});

describe("star", () => {
  test("stars every file and folder in the selection", () => {
    const { calls } = setup({ files: [file()], folders: [folder()] });
    press(STAR.key, STAR);

    expect(calls.star).toEqual([[["c1"], ["/Docs"]]]);
    expect(calls.cleared).toBe(1);
  });

  // Starring something already in the trash would make it show up in Starred
  test("does nothing in Trash", () => {
    const { calls } = setup({ view: "trash", files: [file()] });
    press(STAR.key, STAR);

    expect(calls.star).toEqual([]);
  });

  test("needs both modifiers, not just one", () => {
    for (const mods of [{ meta: true }, { alt: true }, {}]) {
      const { calls } = setup({ files: [file()] });
      press("s", { code: "KeyS", ...mods });
      expect(calls.star).toEqual([]);
    }
  });
});

describe("guards", () => {
  // Backspace in the rename field must delete a character, not the file.
  test("keys typed into a field are never shortcuts", () => {
    for (const tag of ["input", "textarea"]) {
      const { calls } = setup({ files: [file()] });
      const el = document.createElement(tag);
      document.body.appendChild(el);
      press("Delete", { target: el });

      expect(calls.bulkTrash).toEqual([]);
    }
  });

  test("contentEditable counts as a field too", () => {
    const { calls } = setup({ files: [file()] });
    const el = document.createElement("div");
    el.contentEditable = "true";
    Object.defineProperty(el, "isContentEditable", { value: true });
    document.body.appendChild(el);
    press("Delete", { target: el });

    expect(calls.bulkTrash).toEqual([]);
  });

  test("disabled suppresses every shortcut", () => {
    const { calls } = setup({ enabled: false, files: [file()] });
    press("F2");
    press("Delete");
    press(STAR.key, STAR);

    expect([...calls.renameFile, ...calls.bulkTrash, ...calls.star]).toEqual([]);
  });

  test("a handled shortcut stops the browser acting on the key as well", () => {
    setup({ files: [file()] });
    expect(press("Delete").defaultPrevented).toBe(true);
  });

  test("an unhandled key is left for the page", () => {
    setup({ files: [file()] });
    expect(press("a").defaultPrevented).toBe(false);
  });

  test("the listener is removed on unmount", () => {
    const calls = { trashed: 0 };
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({
        enabled: true, view: "my-drive",
        selection: { files: [file()], folders: [], count: 1, clear: () => {} },
        folderPathOf: (i) => i.fullPath,
        actions: { bulkTrash: () => { calls.trashed += 1; } },
      })
    );
    press("Delete");
    unmount();
    press("Delete");

    expect(calls.trashed).toBe(1);
  });
});
