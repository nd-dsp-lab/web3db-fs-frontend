import { useEffect, useRef } from "react";

// Drive-style shortcuts on the current selection:
//   F2 / ⌥⌘E    rename, single selection only
//   Delete      move to trash — delete forever when already in Trash
//   ⌥⌘S         toggle star
//
// The listener is on document rather than a focused element because the file
// grid has no focus of its own; the guards below are what keep that from
// stealing keys the rest of the page needs.

// A shortcut must never fire while the user is typing. contentEditable counts:
// the rename field and the share recipient box are both real inputs, but a
// future rich-text field would not be.
const isTyping = (t) =>
  !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

export function useKeyboardShortcuts({ enabled, view, selection, folderPathOf, actions }) {
  // The handler reads selection state that changes on every click, but the
  // listener should be attached once. A ref bridges the two: the effect below
  // closes over the ref, not over this render's values.
  const handler = useRef();
  handler.current = (e) => {
    if (!enabled || isTyping(e.target)) return;

    const { files, folders, count, clear } = selection;
    const combo = (e.metaKey || e.ctrlKey) && e.altKey;

    if (e.key === "F2" || (combo && e.code === "KeyE")) {
      // Renaming two things at once has no meaning, and trash is read-only
      if (count !== 1 || view === "trash") return;
      e.preventDefault();
      if (files.length === 1) {
        if (!files[0].is_owner) return;
        clear();
        actions.renameFile(files[0]);
      } else {
        const item = folders[0];
        if (item.shared || item.trash) return;
        clear();
        actions.renameFolder(item);
      }
      return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      if (count === 0) return;
      e.preventDefault();
      if (view === "trash") {
        actions.bulkDelete(files, folders.map(folderPathOf));
      } else {
        // Files shared to us and folders we don't own are silently skipped
        // rather than refused: the selection can legitimately mix both.
        actions.bulkTrash(
          files.filter((f) => f.is_owner),
          folders.filter((i) => !i.shared).map(folderPathOf)
        );
      }
      clear();
      return;
    }

    if (combo && e.code === "KeyS") {
      if (count === 0 || view === "trash") return;
      e.preventDefault();
      actions.toggleStarMany(files.map((f) => f.cid), folders.map(folderPathOf));
      clear();
    }
  };

  useEffect(() => {
    const onKeyDown = (e) => handler.current?.(e);
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
