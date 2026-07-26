import { Star, UserPlus, Download, RotateCcw, Trash2 } from "lucide-react";
import { MenuPanel, MenuRow, MenuLabel } from "./Menu";
import { TRASH } from "../lib/theme";
import { useLayout } from "../contexts/LayoutContext";

// Right-click menu shown when a multi-selection is right-clicked: bulk
// star / share / download / trash (or restore + delete-forever in Trash).
export default function SelectionMenu({ selMenu, setSelMenu }) {
  const {
    selectedCount, view,
    selectedFiles, selectedFolders, starred, starredFolders, folderPathOf,
    toggleStarMany, ownedSelection, openShareForSelection, downloadSelection, clearSelection,
    handleBulkRestore, handleBulkDelete, handleBulkTrash,
  } = useLayout();
  const items = [
    ...(view !== "trash" ? [
      {
        Icon: Star,
        label: selectedFiles.every((f) => starred?.has(f.cid)) && selectedFolders.every((i) => starredFolders?.has(folderPathOf(i)))
          ? "Remove from starred" : "Add to starred",
        action: () => toggleStarMany(selectedFiles.map((f) => f.cid), selectedFolders.map(folderPathOf)),
      },
      ...(ownedSelection ? [{ Icon: UserPlus, label: "Share", action: openShareForSelection }] : []),
    ] : []),
    { Icon: Download, label: "Download", action: () => { downloadSelection(); clearSelection(); } },
    ...(view === "trash" ? [
      { Icon: RotateCcw, label: "Restore", action: () => { handleBulkRestore(selectedFiles, selectedFolders.map(folderPathOf)); clearSelection(); } },
      { Icon: Trash2, label: "Delete forever", color: TRASH, action: () => { handleBulkDelete(selectedFiles, selectedFolders.map(folderPathOf)); clearSelection(); } },
    ] : [
      {
        Icon: Trash2, label: "Move to trash", color: TRASH,
        action: () => {
          handleBulkTrash(
            selectedFiles.filter((f) => f.is_owner),
            selectedFolders.filter((i) => !i.shared).map(folderPathOf)
          );
          clearSelection();
        },
      },
    ]),
  ];

  return (
    <MenuPanel x={selMenu.x} y={selMenu.y}>
      <MenuLabel>{selectedCount} selected</MenuLabel>
      {items.map(({ Icon, label, color, action }) => (
        <MenuRow
          key={label}
          Icon={Icon}
          label={label}
          color={color}
          onClick={() => { setSelMenu(null); action(); }}
        />
      ))}
    </MenuPanel>
  );
}
