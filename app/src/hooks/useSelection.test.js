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

// --- rubber-band drag-to-select -------------------------------------------
// onBandStart attaches document-level mousemove/mouseup listeners, so these
// tests dispatch real events and stub getBoundingClientRect on the tiles.

// Lays out three tiles side by side, each 100 wide at y 0..100.
function mountContent(result) {
  const content = document.createElement("div");
  ["a", "b", "c"].forEach((cid, i) => {
    const tile = document.createElement("div");
    tile.dataset.cid = cid;
    tile.getBoundingClientRect = () => ({ left: i * 100, right: i * 100 + 100, top: 0, bottom: 100 });
    content.appendChild(tile);
  });
  document.body.appendChild(content);
  result.current.contentRef.current = content;
  return content;
}

function mouseDownOn(target, over = {}) {
  const e = new MouseEvent("mousedown", { button: 0, clientX: 0, clientY: 0, bubbles: true, ...over });
  Object.defineProperty(e, "target", { value: target });
  return e;
}

afterEach(() => { document.body.innerHTML = ""; });

test("dragging a band selects the tiles it intersects and clears the band on release", () => {
  const { result } = renderHook(() => useSelection(PROPS));
  const content = mountContent(result);

  act(() => result.current.onBandStart(mouseDownOn(content)));
  act(() => document.dispatchEvent(new MouseEvent("mousemove", { clientX: 150, clientY: 50 })));

  expect(result.current.band).toEqual({ left: 0, right: 150, top: 0, bottom: 50 });
  expect([...result.current.selected].sort()).toEqual(["a", "b"]);
  expect(document.body.style.userSelect).toBe("none");

  act(() => document.dispatchEvent(new MouseEvent("mouseup")));
  expect(result.current.band).toBeNull();
  expect([...result.current.selected].sort()).toEqual(["a", "b"]);
  expect(document.body.style.userSelect).toBe("");
});

test("a plain click on empty background clears the selection", () => {
  const { result } = renderHook(() => useSelection(PROPS));
  const content = mountContent(result);
  act(() => result.current.toggleSelect("a"));

  act(() => result.current.onBandStart(mouseDownOn(content)));
  act(() => document.dispatchEvent(new MouseEvent("mousemove", { clientX: 2, clientY: 1 }))); // under the 4px threshold
  act(() => document.dispatchEvent(new MouseEvent("mouseup")));

  expect(result.current.selected.size).toBe(0);
});

test("ctrl-drag adds to the existing selection instead of replacing it", () => {
  const { result } = renderHook(() => useSelection(PROPS));
  const content = mountContent(result);
  act(() => result.current.toggleSelect("c"));

  act(() => result.current.onBandStart(mouseDownOn(content, { ctrlKey: true })));
  act(() => document.dispatchEvent(new MouseEvent("mousemove", { clientX: 50, clientY: 50 })));
  act(() => document.dispatchEvent(new MouseEvent("mouseup")));

  expect([...result.current.selected].sort()).toEqual(["a", "c"]);
});

test("a band never starts on a tile, a control, or a non-left button", () => {
  const { result } = renderHook(() => useSelection(PROPS));
  const content = mountContent(result);

  const tile = content.firstChild; // eslint-disable-line testing-library/no-node-access -- hand-built DOM, not a rendered component
  act(() => result.current.onBandStart(mouseDownOn(tile)));
  act(() => result.current.onBandStart(mouseDownOn(content, { button: 2 }))); // right-click
  act(() => document.dispatchEvent(new MouseEvent("mousemove", { clientX: 150, clientY: 50 })));

  expect(result.current.band).toBeNull();
  expect(result.current.selected.size).toBe(0);
});
