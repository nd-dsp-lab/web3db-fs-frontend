import { renderHook } from "@testing-library/react";
import { useDisplayItems } from "./useDisplayItems";
import { buildFileTree } from "../utils/helpers";
import { TRASH_PREFIX } from "../lib/constants";

// useDisplayItems is pure derivation behind useMemo: given the file list and
// the current view/search state, it produces the items to render. Each view
// and the search paths are exercised directly through the hook.

const file = (over = {}) => ({
  cid: "c1", filename: "a.pdf", folder_path: "/", is_owner: true, timestamp: 1, size: 1, ...over,
});

function run(over = {}) {
  const props = {
    files: [], fileTree: null, view: "my-drive", currentPath: "/",
    searchQuery: "", searchType: null, searchScope: "all",
    emptyFolders: new Set(), starred: new Set(), starredFolders: new Set(),
    ...over,
  };
  return renderHook(() => useDisplayItems(props)).result.current;
}

const names = (items) => items.map((i) => i.name);

describe("My Drive view", () => {
  test("lists the folder contents at the current path", () => {
    const files = [
      file({ cid: "c1", filename: "root.pdf", folder_path: "/" }),
      file({ cid: "c2", filename: "deep.pdf", folder_path: "/docs" }),
    ];
    const items = run({ files, fileTree: buildFileTree(files, new Set()), currentPath: "/" });

    // the root file plus the "docs" folder are visible; the deep file is not
    expect(names(items)).toEqual(expect.arrayContaining(["root.pdf", "docs"]));
    expect(names(items)).not.toContain("deep.pdf");
  });

  test("returns empty when there is no tree", () => {
    expect(run({ fileTree: null })).toEqual([]);
  });
});

describe("search", () => {
  const files = [
    file({ cid: "c1", filename: "report.pdf", folder_path: "/docs" }),
    file({ cid: "c2", filename: "notes.txt", folder_path: "/docs" }),
    file({ cid: "c3", filename: "photo.png", folder_path: "/other" }),
  ];

  test("matches file names case-insensitively", () => {
    const items = run({ files, searchQuery: "REPORT" });
    expect(names(items)).toEqual(["report.pdf"]);
  });

  test("a type chip filters to matching extensions", () => {
    const items = run({ files, searchQuery: "o", searchType: "image" });
    expect(names(items)).toEqual(["photo.png"]);
  });

  test("folder scope restricts results to the current subtree", () => {
    const items = run({ files, searchQuery: ".", searchType: null, searchScope: "folder", currentPath: "/docs" });
    // only files under /docs, and never a folder-typed result for /docs itself
    const fileNames = items.filter((i) => i.type === "file").map((i) => i.name);
    expect(fileNames).toEqual(expect.arrayContaining(["report.pdf", "notes.txt"]));
    expect(fileNames).not.toContain("photo.png");
  });

  test("the folder type returns matching folders, not files", () => {
    const items = run({ files, searchQuery: "doc", searchType: "folder" });
    expect(items.every((i) => i.type === "folder")).toBe(true);
    expect(names(items)).toContain("docs");
  });
});

describe("Shared view", () => {
  test("groups files shared to me into folders and lists loose files", () => {
    const files = [
      file({ cid: "c1", filename: "shared.pdf", folder_path: "/", is_owner: false }),
      file({ cid: "c2", filename: "nested.pdf", folder_path: "/team", is_owner: false }),
      file({ cid: "c3", filename: "mine.pdf", folder_path: "/", is_owner: true }),
    ];
    const items = run({ files, view: "shared", currentPath: "/" });

    const folder = items.find((i) => i.type === "folder");
    expect(folder).toMatchObject({ name: "team", shared: true });
    expect(names(items)).toContain("shared.pdf"); // loose shared file
    expect(names(items)).not.toContain("mine.pdf"); // owned files excluded
  });
});

describe("Recent view", () => {
  test("sorts newest first and caps at 30", () => {
    const files = Array.from({ length: 35 }, (_, i) =>
      file({ cid: `c${i}`, filename: `f${i}.pdf`, timestamp: i }));
    const items = run({ files, view: "recent" });

    expect(items).toHaveLength(30);
    expect(items[0].filename).toBe("f34.pdf"); // highest timestamp first
  });
});

describe("Starred view", () => {
  test("lists starred files and existing starred folders", () => {
    const files = [
      file({ cid: "c1", filename: "star.pdf", folder_path: "/docs" }),
      file({ cid: "c2", filename: "plain.pdf", folder_path: "/docs" }),
    ];
    const items = run({
      files,
      fileTree: buildFileTree(files, new Set()),
      view: "starred",
      starred: new Set(["c1"]),
      starredFolders: new Set(["/docs"]),
    });

    expect(names(items)).toContain("star.pdf");
    expect(names(items)).not.toContain("plain.pdf");
    expect(items.some((i) => i.type === "folder" && i.name === "docs")).toBe(true);
  });
});

describe("Trash view", () => {
  test("groups trashed files under their logical folders", () => {
    const files = [
      file({ cid: "c1", filename: "gone.pdf", folder_path: `${TRASH_PREFIX}` }),
      file({ cid: "c2", filename: "deep.pdf", folder_path: `${TRASH_PREFIX}/docs` }),
    ];
    const items = run({ files, view: "trash", currentPath: "/" });

    expect(names(items)).toContain("gone.pdf");       // loose trashed file
    const folder = items.find((i) => i.type === "folder");
    expect(folder).toMatchObject({ name: "docs", trash: true });
  });
});
