import { useMemo } from "react";
import { getFolderContents } from "../utils/helpers";
import { SEARCH_TYPE_EXTS, TRASH_PREFIX } from "../lib/constants";
import { isTrashed, fullPathOf, joinPath, childPrefix, isUnder } from "../lib/paths";

// Derives the list of items to render for the current view: search results
// (name + optional type chip + folder scope), or the Shared / Recent /
// Starred / Trash / My Drive assemblies. Folders carry shared/trash tags so
// navigation and menus behave per view.
export function useDisplayItems({
  files, fileTree, view, currentPath,
  searchQuery, searchType, searchScope,
  emptyFolders, starred, starredFolders,
}) {
  return useMemo(() => {
    const asFileItem = (f) => ({ ...f, type: "file", name: f.filename || f.name });
    const folderExists = (path) => {
      let node = fileTree;
      for (const part of (path || "").split("/").filter(Boolean)) {
        node = node?.children?.find((c) => c.type === "folder" && c.name === part);
        if (!node) return false;
      }
      return !!node;
    };
    const active = files.filter((f) => !isTrashed(f)); // trashed files only show in the Trash view

    if (searchQuery.length > 0) {
      // Search: name match + optional type chip + optional current-folder scope
      const q = searchQuery.toLowerCase();
      const scopePrefix = childPrefix(currentPath);
      const inScope = (fullPath) => searchScope !== "folder" || fullPath.startsWith(scopePrefix);
      const results = [];

      if (searchType !== "folder") {
        const exts = searchType ? SEARCH_TYPE_EXTS[searchType] || [] : null;
        for (const f of active) {
          const name = f.filename || f.name || "";
          if (!name.toLowerCase().includes(q)) continue;
          if (!inScope(fullPathOf(f))) continue;
          if (exts && !exts.includes(name.split(".").pop().toLowerCase())) continue;
          results.push(asFileItem(f));
        }
      }

      if (!searchType || searchType === "folder") {
        // Folder results: every distinct owned folder path plus local empty folders
        const folderPaths = new Set(emptyFolders);
        for (const f of active.filter((x) => x.is_owner)) {
          const parts = fullPathOf(f).split("/").filter(Boolean);
          let p = "";
          for (let i = 0; i < parts.length - 1; i++) { p += "/" + parts[i]; folderPaths.add(p); }
        }
        for (const p of folderPaths) {
          const name = p.slice(p.lastIndexOf("/") + 1);
          if (p === currentPath) continue; // don't list the folder being searched in
          if (!name.toLowerCase().includes(q) || !inScope(p + "/")) continue;
          results.push({ type: "folder", name, fullPath: p });
        }
      }
      return results;
    }

    if (view === "shared") {
      // Shared files keep the owner's paths, so group them into folders and
      // let currentPath drive navigation just like My Drive. Folder items are
      // tagged shared:true so navigation stays in this view and owner-only
      // actions (rename, trash, share) are suppressed.
      const prefix = childPrefix(currentPath);
      const folderNames = new Set();
      const fileItems = [];
      for (const f of active.filter((f) => !f.is_owner)) {
        const full = fullPathOf(f);
        if (!full.startsWith(prefix)) continue;
        const rest = full.slice(prefix.length);
        const slash = rest.indexOf("/");
        if (slash === -1) fileItems.push(asFileItem(f));
        else folderNames.add(rest.slice(0, slash));
      }
      return [
        ...[...folderNames].sort().map((n) => ({ type: "folder", name: n, shared: true, fullPath: prefix + n })),
        ...fileItems,
      ];
    }

    if (view === "recent") {
      return [...active].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 30).map(asFileItem);
    }

    if (view === "starred") {
      return [
        // starred folders that still exist; fullPath drives navigation since
        // the Starred view is flat. Folders shared to this user aren't in the
        // owned tree — detect them by path prefix and tag shared:true so
        // navigation opens them in the Shared view.
        ...[...starredFolders]
          .filter((p) => folderExists(p) || active.some((f) => !f.is_owner && isUnder(fullPathOf(f), p)))
          .sort()
          .map((p) => ({ type: "folder", name: p.split("/").pop(), fullPath: p, shared: !folderExists(p) })),
        ...active.filter((f) => starred.has(f.cid)).map(asFileItem),
      ];
    }

    if (view === "trash") {
      // Trashed files keep their original paths under /.trash — group them
      // into folders like the Shared view, with currentPath as the position
      // inside the trash. Folder items are tagged trash:true so navigation
      // stays here and the menu offers restore/delete-forever.
      const prefix = TRASH_PREFIX + childPrefix(currentPath);
      const folderNames = new Set();
      const fileItems = [];
      for (const f of files.filter((f) => f.is_owner && isTrashed(f))) {
        const full = fullPathOf(f);
        if (!full.startsWith(prefix)) continue;
        const rest = full.slice(prefix.length);
        const slash = rest.indexOf("/");
        if (slash === -1) fileItems.push(asFileItem(f));
        else folderNames.add(rest.slice(0, slash));
      }
      return [
        ...[...folderNames].sort().map((n) => ({
          type: "folder", name: n, trash: true,
          fullPath: joinPath(currentPath, n),
        })),
        ...fileItems,
      ];
    }

    return fileTree ? (getFolderContents(fileTree, currentPath) || []) : [];
  }, [files, fileTree, view, currentPath, searchQuery, searchType, searchScope, emptyFolders, starred, starredFolders]);
}
