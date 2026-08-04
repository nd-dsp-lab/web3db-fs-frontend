import { useState, useEffect, useRef } from "react";

// Owns the multi-selection: a Set of file CIDs and "folder:{path}" keys,
// plus the rubber-band drag-to-select. Selection is scoped to what's on
// screen, so it clears on any navigation and on Escape.
export function useSelection({ view, currentPath, searchQuery }) {
  const [selected, setSelected] = useState(new Set());
  const contentRef = useRef(null);
  const [band, setBand] = useState(null); // viewport coords {left, top, right, bottom}

  useEffect(() => { setSelected(new Set()); }, [view, currentPath, searchQuery]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setSelected(new Set()); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const toggleSelect = (cid) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(cid) ? next.delete(cid) : next.add(cid);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  // Drag from empty content-area background to draw a selection box; file
  // tiles/rows intersecting it get selected. Ctrl/shift-drag adds to the
  // existing selection. A plain click on empty space clears it.
  const onBandStart = (e) => {
    if (e.button !== 0) return;
    // Only start from true background — not tiles, rows, or controls
    if (e.target.closest("[data-cid],[data-noselect],button,input,a,table thead")) return;
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    const base = additive ? new Set(selected) : new Set();
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    document.body.style.userSelect = "none";

    const onMove = (ev) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
      moved = true;
      const rect = {
        left: Math.min(start.x, ev.clientX), right: Math.max(start.x, ev.clientX),
        top: Math.min(start.y, ev.clientY), bottom: Math.max(start.y, ev.clientY),
      };
      setBand(rect);
      const hits = new Set(base);
      // :not([data-pending]) — an upload that hasn't mined yet isn't on-chain,
      // so every action a selection leads to would revert on it.
      contentRef.current?.querySelectorAll("[data-cid]:not([data-pending])").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.left < rect.right && r.right > rect.left && r.top < rect.bottom && r.bottom > rect.top) {
          hits.add(el.dataset.cid);
        }
      });
      setSelected(hits);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      setBand(null);
      if (!moved && !additive) setSelected(new Set());
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return { selected, setSelected, toggleSelect, clearSelection, band, contentRef, onBandStart };
}
