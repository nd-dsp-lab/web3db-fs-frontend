import { Star, UserPlus, Download, RotateCcw, Trash2 } from "lucide-react";

// Right-click menu shown when a multi-selection is right-clicked: bulk
// star / share / download / trash (or restore + delete-forever in Trash).
export default function SelectionMenu({
  selMenu, setSelMenu, theme, selectedCount, view,
  selectedFiles, selectedFolders, starred, starredFolders, folderPathOf,
  toggleStarMany, ownedSelection, openShareForSelection, downloadSelection, clearSelection,
  handleBulkRestore, handleBulkDelete, handleBulkTrash,
}) {
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
      { Icon: Trash2, label: "Delete forever", color: "#d9534f", action: () => { handleBulkDelete(selectedFiles, selectedFolders.map(folderPathOf)); clearSelection(); } },
    ] : [
      {
        Icon: Trash2, label: "Move to trash", color: "#d9534f",
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
    <div
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed", top: selMenu.y, left: selMenu.x, width: "200px",
        backgroundColor: theme.card, border: `1px solid ${theme.border}`, borderRadius: "8px",
        zIndex: 9999, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", padding: "6px 0",
      }}
    >
      <div style={{ padding: "8px 18px 6px", fontSize: "12px", color: theme.subText }}>
        {selectedCount} selected
      </div>
      {items.map(({ Icon, label, color, action }) => (
        <div
          key={label}
          onClick={() => { setSelMenu(null); action(); }}
          style={{ padding: "10px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: "12px", fontSize: "14px", color: color || theme.text }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.hoverRow}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
        >
          <Icon size={16} color={color || theme.subText} /> {label}
        </div>
      ))}
    </div>
  );
}
