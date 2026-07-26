import { renderHook, act } from "@testing-library/react";
import { useSortedItems } from "./useSortedItems";

// Sorting was inline in AppLayout and only reachable by rendering the shell
// and reading the DOM order. The collation rules and the folder-stats
// lookup are the parts that break quietly, so they are pinned here.

const f = (name, over = {}) => ({ type: "file", cid: name, filename: name, ...over });
const d = (name, over = {}) => ({ type: "folder", name, fullPath: `/${name}`, ...over });

function setup({ displayItems = [], folderStatsOf = null } = {}) {
  const looked = [];
  const stats = folderStatsOf
    ? (path) => { looked.push(path); return folderStatsOf(path); }
    : null;
  const { result } = renderHook(() =>
    useSortedItems({
      displayItems,
      folderStatsOf: stats,
      folderPathOf: (i) => i.fullPath,
    })
  );
  return { hook: result, looked };
}

const names = (list) => list.map((i) => i.filename || i.name);

describe("names", () => {
  test("sort ascending by default", () => {
    const { hook } = setup({ displayItems: [f("c.txt"), f("a.txt"), f("b.txt")] });
    expect(names(hook.current.fileItems)).toEqual(["a.txt", "b.txt", "c.txt"]);
    expect(hook.current.sortDir).toBe("asc");
  });

  // Plain string comparison puts "file10" before "file2", which reads as
  // broken to anyone who has numbered their files.
  test("numbers in names compare as numbers", () => {
    const { hook } = setup({ displayItems: [f("file10"), f("file2"), f("file1")] });
    expect(names(hook.current.fileItems)).toEqual(["file1", "file2", "file10"]);
  });

  test("case does not split otherwise-adjacent names", () => {
    const { hook } = setup({ displayItems: [f("banana"), f("Apple"), f("cherry")] });
    expect(names(hook.current.fileItems)).toEqual(["Apple", "banana", "cherry"]);
  });

  test("folders and files are sorted as separate lists", () => {
    const { hook } = setup({ displayItems: [f("z.txt"), d("Beta"), f("a.txt"), d("Alpha")] });
    expect(names(hook.current.folders)).toEqual(["Alpha", "Beta"]);
    expect(names(hook.current.fileItems)).toEqual(["a.txt", "z.txt"]);
  });

  test("an item with no name at all does not throw", () => {
    const { hook } = setup({ displayItems: [{ type: "file", cid: "x" }, f("a.txt")] });
    expect(hook.current.fileItems).toHaveLength(2);
  });
});

describe("toggleSort", () => {
  test("picking date or size starts newest and largest first", () => {
    for (const key of ["date", "size"]) {
      const { hook } = setup();
      act(() => hook.current.toggleSort(key));
      expect([hook.current.sortBy, hook.current.sortDir]).toEqual([key, "desc"]);
    }
  });

  test("picking name starts A-to-Z", () => {
    const { hook } = setup();
    act(() => hook.current.toggleSort("size"));
    act(() => hook.current.toggleSort("name"));
    expect([hook.current.sortBy, hook.current.sortDir]).toEqual(["name", "asc"]);
  });

  test("re-picking the current column flips the direction instead", () => {
    const { hook } = setup();
    act(() => hook.current.toggleSort("name"));
    expect(hook.current.sortDir).toBe("desc");
    act(() => hook.current.toggleSort("name"));
    expect(hook.current.sortDir).toBe("asc");
  });

  test("descending actually reverses the list", () => {
    const { hook } = setup({ displayItems: [f("a.txt"), f("b.txt")] });
    act(() => hook.current.toggleSort("name"));
    expect(names(hook.current.fileItems)).toEqual(["b.txt", "a.txt"]);
  });
});

describe("sorting folders by size and date", () => {
  // A folder has no size or timestamp of its own; both are aggregates over
  // what is inside it, which only the stats lookup knows.
  const withStats = {
    "/Big": { size: 900, latest: 10 },
    "/Small": { size: 100, latest: 99 },
  };

  test("size comes from the folder's aggregate, not the item", () => {
    const { hook } = setup({
      displayItems: [d("Small"), d("Big")],
      folderStatsOf: (p) => withStats[p],
    });
    act(() => hook.current.toggleSort("size"));

    expect(names(hook.current.folders)).toEqual(["Big", "Small"]); // desc
  });

  test("date comes from the newest file inside", () => {
    const { hook } = setup({
      displayItems: [d("Big"), d("Small")],
      folderStatsOf: (p) => withStats[p],
    });
    act(() => hook.current.toggleSort("date"));

    expect(names(hook.current.folders)).toEqual(["Small", "Big"]);
  });

  // Trash-view folders show a logical path; their files really live under
  // /.trash, so the stats lookup has to be given the real one or it finds
  // nothing and every trashed folder sorts as size zero.
  test("trash folders are looked up under the trash prefix", () => {
    const { hook, looked } = setup({
      displayItems: [d("Gone", { trash: true })],
      folderStatsOf: () => ({ size: 1, latest: 1 }),
    });
    act(() => hook.current.toggleSort("size"));

    expect(looked).toContain("/.trash/Gone");
  });

  test("sorting by name needs no stats lookup at all", () => {
    const { looked } = setup({
      displayItems: [d("A"), d("B")],
      folderStatsOf: () => ({ size: 1, latest: 1 }),
    });

    expect(looked).toEqual([]);
  });

  test("a missing stats function leaves folders unsorted rather than crashing", () => {
    const { hook } = setup({ displayItems: [d("B"), d("A")] });
    act(() => hook.current.toggleSort("size"));

    expect(hook.current.folders).toHaveLength(2);
  });
});

describe("input handling", () => {
  test("a null item list is treated as empty", () => {
    const { hook } = setup({ displayItems: null });
    expect(hook.current.folders).toEqual([]);
    expect(hook.current.fileItems).toEqual([]);
  });

  // .sort() is destructive; sorting must not reorder the caller's array.
  test("the caller's list is not reordered in place", () => {
    const items = [f("c.txt"), f("a.txt")];
    setup({ displayItems: items });

    expect(names(items)).toEqual(["c.txt", "a.txt"]);
  });
});
