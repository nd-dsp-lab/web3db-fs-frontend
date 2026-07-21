import { useState, useEffect } from "react";

// Stars, kept locally per account. Files are keyed by CID (stable); folders
// have no CID so they're keyed by path, and rename/trash/delete rewrite or
// remove those keys via remapStarredFolders.
export function useStarred(account) {
  const [starred, setStarred] = useState(new Set());
  const [starredFolders, setStarredFolders] = useState(new Set());

  useEffect(() => {
    if (!account) { setStarred(new Set()); return; }
    try {
      setStarred(new Set(JSON.parse(localStorage.getItem(`starred:${account.toLowerCase()}`) || "[]")));
    } catch {
      setStarred(new Set());
    }
  }, [account]);

  useEffect(() => {
    if (!account) { setStarredFolders(new Set()); return; }
    try {
      setStarredFolders(new Set(JSON.parse(localStorage.getItem(`starredFolders:${account.toLowerCase()}`) || "[]")));
    } catch {
      setStarredFolders(new Set());
    }
  }, [account]);

  const persistStarredFolders = (next) => {
    if (account) localStorage.setItem(`starredFolders:${account.toLowerCase()}`, JSON.stringify([...next]));
    return next;
  };

  const toggleStar = (cid) => {
    if (!account) return;
    setStarred((prev) => {
      const next = new Set(prev);
      next.has(cid) ? next.delete(cid) : next.add(cid);
      localStorage.setItem(`starred:${account.toLowerCase()}`, JSON.stringify([...next]));
      return next;
    });
  };

  const toggleStarFolder = (folderPath) => {
    if (!account) return;
    setStarredFolders((prev) => {
      const next = new Set(prev);
      next.has(folderPath) ? next.delete(folderPath) : next.add(folderPath);
      return persistStarredFolders(next);
    });
  };

  // Bulk star: if every selected file is already starred, unstar them all.
  // folderPaths lets multi-select star folders in the same gesture — the
  // all-starred check spans both sets so the toggle stays consistent.
  const toggleStarMany = (cids, folderPaths = []) => {
    if (!account) return;
    const allStarred =
      cids.every((c) => starred.has(c)) && folderPaths.every((p) => starredFolders.has(p));
    setStarred((prev) => {
      const next = new Set(prev);
      cids.forEach((c) => (allStarred ? next.delete(c) : next.add(c)));
      localStorage.setItem(`starred:${account.toLowerCase()}`, JSON.stringify([...next]));
      return next;
    });
    if (folderPaths.length) {
      setStarredFolders((prev) => {
        const next = new Set(prev);
        folderPaths.forEach((p) => (allStarred ? next.delete(p) : next.add(p)));
        return persistStarredFolders(next);
      });
    }
  };

  // Drop stars for a folder (and its subfolders), or remap them on rename
  const remapStarredFolders = (folderPath, newPath = null) => {
    setStarredFolders((prev) => {
      const next = new Set();
      for (const p of prev) {
        if (p === folderPath || p.startsWith(folderPath + "/")) {
          if (newPath) next.add(newPath + p.slice(folderPath.length));
        } else {
          next.add(p);
        }
      }
      return persistStarredFolders(next);
    });
  };

  return { starred, starredFolders, toggleStar, toggleStarFolder, toggleStarMany, remapStarredFolders };
}
