import { renderHook, act } from "@testing-library/react";
import { useEmptyFolders } from "./useEmptyFolders";

const ACCOUNT = "0xABCdef0000000000000000000000000000000000";
const KEY = `emptyFolders:${ACCOUNT.toLowerCase()}`;

beforeEach(() => localStorage.clear());

test("loads saved empty folders for the account", () => {
  localStorage.setItem(KEY, JSON.stringify(["/projects"]));
  const { result } = renderHook(() => useEmptyFolders(ACCOUNT));
  expect(result.current.emptyFolders.has("/projects")).toBe(true);
});

test("no account yields an empty set", () => {
  const { result } = renderHook(() => useEmptyFolders(null));
  expect(result.current.emptyFolders.size).toBe(0);
});

test("persistEmptyFolders writes to localStorage and returns the set", () => {
  const { result } = renderHook(() => useEmptyFolders(ACCOUNT));
  let returned;
  act(() => { returned = result.current.persistEmptyFolders(new Set(["/a", "/b"])); });
  expect([...returned].sort()).toEqual(["/a", "/b"]);
  expect(JSON.parse(localStorage.getItem(KEY)).sort()).toEqual(["/a", "/b"]);
});
