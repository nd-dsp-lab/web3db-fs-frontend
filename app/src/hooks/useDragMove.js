import { useState } from "react";
import { joinPath } from "../lib/paths";

// Moving files and folders by dragging them onto another folder. Drop targets
// are folder tiles and rows, breadcrumb segments, and the My Drive nav item.
//
// This is the *internal* drag. Dropping files in from the desktop is a
// different gesture handled by useExternalDropUpload; the two share elements
// but never the same event, because only an external drag carries "Files" in
// dataTransfer.types.

export function useDragMove({
  view, currentPath, theme,
  selection, folderPathOf, folderKeyOf,
  handleMove, handleMoveFolder, handleBulkMove,
}) {
  // What is currently being dragged: a single file, a single folder, or the
  // whole multi-selection. null when nothing is in flight.
  const [draggedItem, setDraggedItem] = useState(null);

  // Drive behaviour: dragging something that is part of the current
  // multi-selection drags all of it. Dragging an unselected item drags that
  // item alone and leaves the selection where it is.
  const partOfSelection = (key) => selection.count > 1 && selection.has(key);

  const onFileDragStart = (file) => {
    if (partOfSelection(file.cid)) { setDraggedItem({ type: "selection" }); return; }
    setDraggedItem({ type: "file", cid: file.cid, name: file.name, fromPath: currentPath });
  };

  const onFolderDragStart = (item) => {
    if (partOfSelection(folderKeyOf(item))) { setDraggedItem({ type: "selection" }); return; }
    setDraggedItem({ type: "folder", path: folderPathOf(item) });
  };

  // Owned live folders only — no dragging in trash or of folders shared to me
  const canDragFolder = (item) => !item.shared && !item.trash;

  const onInternalDropTo = async (e, destFolderPath) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedItem || view === "trash") return; // no drag-moves inside Trash
    const item = draggedItem;
    // Cleared before awaiting: the drag is over the moment the drop lands,
    // and the move can take a signature and a confirmation to finish.
    setDraggedItem(null);

    if (item.type === "selection") {
      // Things we don't own are dropped from the move rather than refusing
      // it — a selection can legitimately mix ours with shared-to-us.
      await handleBulkMove(
        selection.files.filter((f) => f.is_owner),
        selection.folders.filter((i) => !i.shared && !i.trash).map(folderPathOf),
        destFolderPath
      );
      selection.clear();
      return;
    }

    if (item.type === "file") {
      if (item.fromPath === destFolderPath) return; // already there — skip the pointless signature
      await handleMove(item.cid, joinPath(destFolderPath, item.name));
      return;
    }

    // handleMoveFolder no-ops on same-place and self/descendant drops
    await handleMoveFolder(item.path, destFolderPath);
  };

  const onFolderDrop = (e, targetItem) => onInternalDropTo(e, folderPathOf(targetItem));

  // Drag-over feedback for breadcrumb / nav drop targets. Gated on
  // draggedItem so an external file drag doesn't light them up — those
  // targets can't accept one.
  const dropHover = (e) => {
    if (!draggedItem) return;
    e.preventDefault();
    e.currentTarget.style.backgroundColor = theme.navActive;
  };
  const dropUnhover = (e) => { e.currentTarget.style.backgroundColor = "transparent"; };

  return {
    draggedItem,
    onFileDragStart, onFolderDragStart, canDragFolder,
    onInternalDropTo, onFolderDrop, dropHover, dropUnhover,
  };
}
