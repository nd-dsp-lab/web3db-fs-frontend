import {
  buildFileTree,
  getFolderContents,
  mergeEmptyFoldersIntoTree,
  toHexifNumber,
  normalizeTxFields,
} from "./helpers";

const names = (nodes) => nodes.map((n) => n.name).sort();

describe("buildFileTree", () => {
  test("places root files directly under root", () => {
    const tree = buildFileTree([{ folder_path: "/", filename: "a.txt" }]);
    expect(tree.name).toBe("/");
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0]).toMatchObject({ name: "a.txt", type: "file" });
  });

  test("creates nested folders and groups siblings under one node", () => {
    const tree = buildFileTree([
      { folder_path: "/docs", filename: "a.txt" },
      { folder_path: "/docs", filename: "b.txt" },
      { folder_path: "/docs/sub", filename: "c.txt" },
    ]);
    const docs = tree.children.find((c) => c.name === "docs");
    expect(docs.type).toBe("folder");
    expect(names(docs.children)).toEqual(["a.txt", "b.txt", "sub"]);
    const sub = docs.children.find((c) => c.name === "sub");
    expect(names(sub.children)).toEqual(["c.txt"]);
  });

  test("merges empty folders that hold no files", () => {
    const tree = buildFileTree([], new Set(["/projects"]));
    expect(tree.children.find((c) => c.name === "projects")).toMatchObject({
      type: "folder",
      children: [],
    });
  });
});

describe("getFolderContents", () => {
  const tree = buildFileTree([
    { folder_path: "/docs", filename: "a.txt" },
    { folder_path: "/", filename: "root.txt" },
  ]);

  test("root returns top-level children", () => {
    expect(names(getFolderContents(tree, "/"))).toEqual(["docs", "root.txt"]);
  });

  test("descends into a named folder", () => {
    expect(names(getFolderContents(tree, "/docs"))).toEqual(["a.txt"]);
  });

  test("missing folder yields empty list", () => {
    expect(getFolderContents(tree, "/nope")).toEqual([]);
    expect(getFolderContents(null, "/")).toEqual([]);
  });
});

describe("mergeEmptyFoldersIntoTree", () => {
  test("no-op for empty set", () => {
    const tree = { name: "/", type: "folder", children: [] };
    expect(mergeEmptyFoldersIntoTree(tree, new Set())).toBe(tree);
  });

  test("skips root and ignores duplicates of existing folders", () => {
    const tree = buildFileTree([{ folder_path: "/docs", filename: "a.txt" }]);
    mergeEmptyFoldersIntoTree(tree, new Set(["/", "/docs"]));
    expect(tree.children.filter((c) => c.name === "docs")).toHaveLength(1);
  });
});

describe("toHexifNumber", () => {
  test("converts decimal numbers and numeric strings", () => {
    expect(toHexifNumber(255)).toBe("0xff");
    expect(toHexifNumber("16")).toBe("0x10");
  });

  test("passes through existing hex and non-numeric input", () => {
    expect(toHexifNumber("0x10")).toBe("0x10");
    expect(toHexifNumber("abc")).toBe("abc");
  });

  test("passes through null / undefined", () => {
    expect(toHexifNumber(null)).toBeNull();
    expect(toHexifNumber(undefined)).toBeUndefined();
  });
});

describe("normalizeTxFields", () => {
  test("hexifies numeric fields and defaults value to 0x0", () => {
    const out = normalizeTxFields({ gas: 21000, nonce: 5, chainId: 11155111 });
    expect(out.gas).toBe("0x5208");
    expect(out.nonce).toBe("0x5");
    expect(out.chainId).toBe("0xaa36a7");
    expect(out.value).toBe("0x0");
  });

  test("leaves absent fields absent and preserves value when set", () => {
    const out = normalizeTxFields({ value: 256 });
    expect(out.value).toBe("0x100");
    expect(out.gas).toBeUndefined();
  });
});
