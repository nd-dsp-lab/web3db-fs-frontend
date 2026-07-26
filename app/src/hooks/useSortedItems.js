import { useState } from "react";

// Splits the current view's items into folders and files, each sorted by the
// column the user picked. Folders always come first because the two lists are
// rendered as separate groups, not because of anything in the comparators.

// numeric:true so "file10" sorts after "file2"; sensitivity:"base" so case
// and accents don't split otherwise-adjacent names.
const COMPARATORS = {
  name: (a, b) =>
    (a.filename || a.name || "").localeCompare(b.filename || b.name || "", undefined, {
      numeric: true, sensitivity: "base",
    }),
  date: (a, b) => (a.timestamp || 0) - (b.timestamp || 0),
  size: (a, b) => (a.size || 0) - (b.size || 0),
};

export function useSortedItems({ displayItems, folderStatsOf, folderPathOf }) {
  const [sortBy, setSortBy] = useState("name"); // "name" | "date" | "size"
  const [sortDir, setSortDir] = useState("asc");

  const toggleSort = (key) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(key);
    // Newest and largest first is what people mean by "sort by date" or
    // "sort by size"; only names read naturally A-to-Z.
    setSortDir(key === "name" ? "asc" : "desc");
  };

  const dirMul = sortDir === "asc" ? 1 : -1;
  const compare = (a, b) => COMPARATORS[sortBy](a, b) * dirMul;

  const items = displayItems || [];

  // A folder carries no size or timestamp of its own — those come from the
  // aggregate over its contents, and only when sorting actually needs them.
  const folders = items
    .filter((i) => i.type === "folder")
    .map((i) => {
      if (sortBy === "name" || !folderStatsOf) return i;
      // Trash-view folder paths are logical — the real path sits under /.trash
      const stats = folderStatsOf((i.trash ? "/.trash" : "") + folderPathOf(i));
      return { ...i, size: stats.size, timestamp: stats.latest || 0 };
    })
    .sort(compare);

  const fileItems = items.filter((i) => i.type === "file").sort(compare);

  return { sortBy, sortDir, toggleSort, folders, fileItems };
}
