import { renderHook, act } from "@testing-library/react";
import { useSelection } from "./useSelection";

const PROPS = { view: "my-drive", currentPath: "/", searchQuery: "" };

test("toggleSelect adds then removes a key", () => {
  const { result } = renderHook(() => useSelection(PROPS));
  act(() => result.current.toggleSelect("cid1"));
  expect(result.current.selected.has("cid1")).toBe(true);
  act(() => result.current.toggleSelect("cid1"));
  expect(result.current.selected.has("cid1")).toBe(false);
});

test("clearSelection empties the set", () => {
  const { result } = renderHook(() => useSelection(PROPS));
  act(() => {
    result.current.toggleSelect("a");
    result.current.toggleSelect("b");
  });
  act(() => result.current.clearSelection());
  expect(result.current.selected.size).toBe(0);
});

test("selection clears when the view changes", () => {
  const { result, rerender } = renderHook((p) => useSelection(p), { initialProps: PROPS });
  act(() => result.current.toggleSelect("cid1"));
  expect(result.current.selected.size).toBe(1);
  rerender({ ...PROPS, view: "shared" });
  expect(result.current.selected.size).toBe(0);
});

test("Escape clears the selection", () => {
  const { result } = renderHook(() => useSelection(PROPS));
  act(() => result.current.toggleSelect("cid1"));
  act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  expect(result.current.selected.size).toBe(0);
});
