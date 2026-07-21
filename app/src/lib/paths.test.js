import { isTrashed, fullPathOf } from "./paths";

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
