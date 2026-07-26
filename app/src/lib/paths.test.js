import {
  isTrashed, fullPathOf, joinPath, parentOf, baseNameOf,
  childPrefix, isUnder, isAtOrUnder, pruneSubtrees, remapSubtrees,
} from "./paths";

describe("isTrashed", () => {
  test("true when folder_path is under the trash prefix", () => {
    expect(isTrashed({ folder_path: "/.trash" })).toBe(true);
    expect(isTrashed({ folder_path: "/.trash/docs" })).toBe(true);
  });

  test("false for normal paths and missing folder_path", () => {
    expect(isTrashed({ folder_path: "/docs" })).toBe(false);
    expect(isTrashed({ folder_path: "/" })).toBe(false);
    expect(isTrashed({})).toBe(false);
  });
});

describe("fullPathOf", () => {
  test("root files get a single leading slash", () => {
    expect(fullPathOf({ folder_path: "/", filename: "a.txt" })).toBe("/a.txt");
    expect(fullPathOf({ folder_path: "", filename: "a.txt" })).toBe("/a.txt");
    expect(fullPathOf({ filename: "a.txt" })).toBe("/a.txt");
  });

  test("nested files join folder and name", () => {
    expect(fullPathOf({ folder_path: "/docs", filename: "a.txt" })).toBe("/docs/a.txt");
    expect(fullPathOf({ folder_path: "/docs/sub", filename: "b.md" })).toBe("/docs/sub/b.md");
  });
});

describe("joinPath", () => {
  test("the root contributes no separator of its own", () => {
    expect(joinPath("/", "a.txt")).toBe("/a.txt");
    expect(joinPath("", "a.txt")).toBe("/a.txt");
  });

  test("nested directories join with a single slash", () => {
    expect(joinPath("/docs", "a.txt")).toBe("/docs/a.txt");
    expect(joinPath("/docs/sub", "b")).toBe("/docs/sub/b");
  });

  test("a relative name keeps its own structure", () => {
    // Folder uploads pass "sub/a.txt" as the name, preserving the dropped tree
    expect(joinPath("/docs", "sub/a.txt")).toBe("/docs/sub/a.txt");
  });
});

describe("parentOf and baseNameOf", () => {
  test("a top-level folder's parent is the root, not an empty string", () => {
    expect(parentOf("/docs")).toBe("/");
    expect(baseNameOf("/docs")).toBe("docs");
  });

  test("nested paths split at the last separator", () => {
    expect(parentOf("/docs/sub/a.txt")).toBe("/docs/sub");
    expect(baseNameOf("/docs/sub/a.txt")).toBe("a.txt");
  });

  test("rejoining a split path reproduces it", () => {
    for (const p of ["/a", "/a/b", "/a/b/c.txt"]) {
      expect(joinPath(parentOf(p), baseNameOf(p))).toBe(p);
    }
  });
});

describe("isUnder and isAtOrUnder", () => {
  test("a folder does not contain itself, but is in its own subtree", () => {
    expect(isUnder("/docs", "/docs")).toBe(false);
    expect(isAtOrUnder("/docs", "/docs")).toBe(true);
  });

  test("a sibling with a shared name prefix is not inside", () => {
    // The bug this guards: startsWith("/docs") also matches "/docs2"
    expect(isUnder("/docs2/a.txt", "/docs")).toBe(false);
    expect(isAtOrUnder("/docs2", "/docs")).toBe(false);
  });

  test("everything is under the root", () => {
    expect(isUnder("/a.txt", "/")).toBe(true);
    expect(isUnder("/docs/sub/a.txt", "/")).toBe(true);
  });

  test("descendants at any depth count", () => {
    expect(isUnder("/docs/sub/a.txt", "/docs")).toBe(true);
  });
});

describe("childPrefix", () => {
  test("is what every path directly inside the folder starts with", () => {
    expect(childPrefix("/")).toBe("/");
    expect(childPrefix("/docs")).toBe("/docs/");
    expect("/docs/a.txt".slice(childPrefix("/docs").length)).toBe("a.txt");
  });
});

describe("pruneSubtrees", () => {
  test("drops the folder and its descendants, keeping everything else", () => {
    const set = new Set(["/docs", "/docs/sub", "/docs2", "/other"]);
    expect([...pruneSubtrees(set, ["/docs"])].sort()).toEqual(["/docs2", "/other"]);
  });

  test("prunes several folders at once", () => {
    const set = new Set(["/a", "/a/x", "/b", "/c"]);
    expect([...pruneSubtrees(set, ["/a", "/b"])]).toEqual(["/c"]);
  });

  test("returns a new set, leaving the original untouched", () => {
    const set = new Set(["/a"]);
    expect(pruneSubtrees(set, ["/a"])).not.toBe(set);
    expect(set.has("/a")).toBe(true);
  });
});

describe("remapSubtrees", () => {
  test("rewrites the folder and everything under it", () => {
    const set = new Set(["/docs", "/docs/sub", "/other"]);
    expect([...remapSubtrees(set, [["/docs", "/archive/docs"]])].sort())
      .toEqual(["/archive/docs", "/archive/docs/sub", "/other"]);
  });

  test("a sibling sharing a name prefix is left alone", () => {
    const set = new Set(["/docs", "/docs2"]);
    expect([...remapSubtrees(set, [["/docs", "/moved"]])].sort()).toEqual(["/docs2", "/moved"]);
  });

  test("the first matching move wins", () => {
    // Selecting a folder and something inside it must not apply both moves
    const set = new Set(["/a/b"]);
    expect([...remapSubtrees(set, [["/a", "/x"], ["/a/b", "/y"]])]).toEqual(["/x/b"]);
  });

  test("a rename is a move whose parent does not change", () => {
    const set = new Set(["/docs", "/docs/sub"]);
    expect([...remapSubtrees(set, [["/docs", "/notes"]])].sort()).toEqual(["/notes", "/notes/sub"]);
  });
});
