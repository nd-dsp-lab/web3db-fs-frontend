import { Folder, Star, ArrowUp, ArrowDown } from "lucide-react";
import { fileVisual, formatBytes } from "../lib/fileTypes";
import { useLayout } from "../contexts/LayoutContext";

// List view: a sortable table of folders then files with Name / Sharing /
// Uploaded / Size / CID columns.
export default function FileList() {
  const {
    theme, folders, fileItems,
    sortBy, sortDir, toggleSort,
    selectedCount, setSelected, folderKeyOf,
    hoveredKey, setHoveredKey, someSelected,
    toggleSelect, navigateInto, setPreviewFile,
    openMenuForFile, openMenuForFolder,
    canDragFolder, onFileDragStart, onFolderDragStart, onFolderDrop,
    folderSharedCount, folderPathOf, starred, starredFolders,
    SelectBox, MoreButton, SharedFolderIcon, highlightName,
  } = useLayout();
  const SortHeader = ({ label, col, style: extra }) => (
    <th
      onClick={() => toggleSort(col)}
      style={{ fontWeight: 500, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", ...extra }}
      title={`Sort by ${label.toLowerCase()}`}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
        {label}
        {sortBy === col && (sortDir === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
      </span>
    </th>
  );

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "8px" }}>
      <thead>
        <tr style={{ borderBottom: `1px solid ${theme.border}`, textAlign: "left", color: theme.subText, fontSize: "13px" }}>
          <th style={{ width: "32px", padding: "10px 0 10px 8px" }}>
            {(fileItems.length > 0 || folders.length > 0) && (
              <input
                type="checkbox"
                title="Select all"
                checked={selectedCount === fileItems.length + folders.length}
                onChange={() =>
                  setSelected(selectedCount === fileItems.length + folders.length
                    ? new Set()
                    : new Set([...fileItems.map((f) => f.cid), ...folders.map(folderKeyOf)]))
                }
                style={{ width: "16px", height: "16px", accentColor: "#1A73E8", cursor: "pointer" }}
              />
            )}
          </th>
          <SortHeader label="Name" col="name" style={{ padding: "10px 8px" }} />
          <th style={{ fontWeight: 500 }}>Sharing</th>
          <SortHeader label="Uploaded" col="date" />
          <SortHeader label="Size" col="size" />
          <th style={{ fontWeight: 500 }}>CID</th>
          <th style={{ width: "48px" }}></th>
        </tr>
      </thead>
      <tbody>
        {[...folders, ...fileItems].map((item) => {
          // Folders key by path, not name: Starred and search list folders
          // from different parents, and two of those can share a name.
          const key = item.type === "file" ? `file-${item.cid}` : folderKeyOf(item);
          const { Icon, color } = item.type === "file" ? fileVisual(item.filename) : { Icon: Folder, color: theme.subText };
          const sharedCount = Array.isArray(item.shared_with) ? item.shared_with.length : 0;
          const folderShCount = item.type === "folder" ? folderSharedCount(item) : 0;
          return (
            <tr
              key={key}
              data-cid={item.type === "file" ? item.cid : folderKeyOf(item)}
              draggable={item.type === "file" || canDragFolder(item)}
              onDragStart={() => item.type === "file" ? onFileDragStart(item) : canDragFolder(item) && onFolderDragStart(item)}
              onDragOver={(e) => { if (item.type === "folder") e.preventDefault(); }}
              onDrop={(e) => item.type === "folder" && onFolderDrop(e, item)}
              onContextMenu={(e) => item.type === "file" ? openMenuForFile(e, item) : openMenuForFolder(e, item)}
              onMouseEnter={() => setHoveredKey(key)}
              onMouseLeave={() => setHoveredKey(null)}
              style={{
                borderBottom: `1px solid ${theme.border}`,
                backgroundColor: hoveredKey === key ? theme.hoverRow : "transparent",
                cursor: "pointer",
              }}
            >
              <td style={{ padding: "10px 0 10px 8px" }}>
                <SelectBox
                  cid={item.type === "file" ? item.cid : folderKeyOf(item)}
                  visible={hoveredKey === key || someSelected}
                />
              </td>
              <td
                style={{ padding: "10px 8px", display: "flex", alignItems: "center", gap: "14px", fontSize: "14px" }}
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey) { toggleSelect(item.type === "file" ? item.cid : folderKeyOf(item)); return; }
                  item.type === "folder" ? navigateInto(item) : setPreviewFile(item);
                }}
              >
                {item.type === "folder" && folderShCount !== 0 ? (
                  <span title={folderShCount > 0 ? `Shared with ${folderShCount}` : "Shared with you"}>
                    <SharedFolderIcon size={19} color={color} badge={hoveredKey === key ? theme.hoverRow : theme.card} />
                  </span>
                ) : (
                  <Icon size={19} color={color} fill={item.type === "folder" ? color : "none"} />
                )}
                {highlightName(item.name)}
                {((item.type === "file" && starred?.has(item.cid)) ||
                  (item.type === "folder" && starredFolders?.has(folderPathOf(item)))) &&
                  <Star size={13} fill="#F29900" color="#F29900" />}
              </td>
              <td style={{ fontSize: "13px", color: theme.subText }}>
                {item.type === "file"
                  ? (item.is_owner
                    ? (sharedCount > 0 ? `Shared with ${sharedCount}` : "Only you")
                    : (item.owner ? `Shared by ${item.owner.slice(0, 6)}...${item.owner.slice(-4)}` : "Shared with me"))
                  : (folderShCount === -1
                    ? "Shared with you"
                    : folderShCount > 0 ? `Shared with ${folderShCount}` : item.trash ? "—" : "Only you")}
              </td>
              <td style={{ fontSize: "13px", color: theme.subText }}>
                {item.type === "file" && item.timestamp
                  ? new Date(item.timestamp * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
                  : "—"}
              </td>
              <td style={{ fontSize: "13px", color: theme.subText }}>
                {item.type === "file" && item.size ? formatBytes(item.size) : "—"}
              </td>
              <td style={{ fontSize: "12px", color: theme.subText, fontFamily: "monospace" }}>
                {item.cid ? `${item.cid.slice(0, 8)}…${item.cid.slice(-4)}` : "—"}
              </td>
              <td style={{ textAlign: "right", paddingRight: "8px" }}>
                <MoreButton item={item} visible={hoveredKey === key} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
