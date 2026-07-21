import { renderHook, act } from "@testing-library/react";
import { useStarred } from "./useStarred";

const ACCOUNT = "0xABCdef0000000000000000000000000000000000";
const key = (p) => `${p}:${ACCOUNT.toLowerCase()}`;

beforeEach(() => localStorage.clear());

test("loads existing stars for the account from localStorage", () => {
  localStorage.setItem(key("starred"), JSON.stringify(["cid1"]));
  localStorage.setItem(key("starredFolders"), JSON.stringify(["/docs"]));
  const { result } = renderHook(() => useStarred(ACCOUNT));
  expect(result.current.starred.has("cid1")).toBe(true);
  expect(result.current.starredFolders.has("/docs")).toBe(true);
});

test("no account yields empty sets", () => {
  const { result } = renderHook(() => useStarred(null));
  expect(result.current.starred.size).toBe(0);
  expect(result.current.starredFolders.size).toBe(0);
});

test("toggleStar adds then removes and persists", () => {
  const { result } = renderHook(() => useStarred(ACCOUNT));
  act(() => result.current.toggleStar("cid1"));
  expect(result.current.starred.has("cid1")).toBe(true);
  expect(JSON.parse(localStorage.getItem(key("starred")))).toEqual(["cid1"]);

  act(() => result.current.toggleStar("cid1"));
  expect(result.current.starred.has("cid1")).toBe(false);
  expect(JSON.parse(localStorage.getItem(key("starred")))).toEqual([]);
});

test("toggleStarFolder persists to starredFolders", () => {
  const { result } = renderHook(() => useStarred(ACCOUNT));
  act(() => result.current.toggleStarFolder("/docs"));
  expect(result.current.starredFolders.has("/docs")).toBe(true);
  expect(JSON.parse(localStorage.getItem(key("starredFolders")))).toEqual(["/docs"]);
});

describe("toggleStarMany", () => {
  test("stars all when not all are starred", () => {
    const { result } = renderHook(() => useStarred(ACCOUNT));
    act(() => result.current.toggleStar("a")); // one already starred
    act(() => result.current.toggleStarMany(["a", "b"], ["/f"]));
    expect(result.current.starred.has("a")).toBe(true);
    expect(result.current.starred.has("b")).toBe(true);
    expect(result.current.starredFolders.has("/f")).toBe(true);
  });

  test("unstars all when every item is already starred", () => {
    const { result } = renderHook(() => useStarred(ACCOUNT));
    act(() => result.current.toggleStarMany(["a", "b"], ["/f"])); // star all
    act(() => result.current.toggleStarMany(["a", "b"], ["/f"])); // toggle off
    expect(result.current.starred.size).toBe(0);
    expect(result.current.starredFolders.size).toBe(0);
  });
});

describe("remapStarredFolders", () => {
  test("rewrites a folder and its subfolders on rename", () => {
    const { result } = renderHook(() => useStarred(ACCOUNT));
    act(() => result.current.toggleStarFolder("/docs"));
    act(() => result.current.toggleStarFolder("/docs/sub"));
    act(() => result.current.remapStarredFolders("/docs", "/papers"));
    expect([...result.current.starredFolders].sort()).toEqual(["/papers", "/papers/sub"]);
  });

  test("drops the folder when no new path is given", () => {
    const { result } = renderHook(() => useStarred(ACCOUNT));
    act(() => result.current.toggleStarFolder("/docs"));
    act(() => result.current.toggleStarFolder("/keep"));
    act(() => result.current.remapStarredFolders("/docs"));
    expect([...result.current.starredFolders]).toEqual(["/keep"]);
  });
});
