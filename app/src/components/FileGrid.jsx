import { Folder, Star } from "lucide-react";
import { Thumbnail } from "./Thumbnail";
import { fileVisual, hasThumbnailFor } from "../lib/fileTypes";
import { useLayout } from "../contexts/LayoutContext";

// Grid view: folder tiles followed by file cards with thumbnails.
export default function FileGrid() {
  const {
    folders, fileItems, theme,
    hoveredKey, setHoveredKey, someSelected,
    toggleSelect, navigateInto, openMenuForFolder, openMenuForFile,
    canDragFolder, onFolderDragStart, onFolderDrop, onFileDragStart, setPreviewFile,
    folderKeyOf, folderSharedCount, folderPathOf, starredFolders, starred,
    SelectBox, MoreButton, SharedFolderIcon, sectionLabel, highlightName,
    API_BASE_URL, authToken,
  } = useLayout();
  return (
    <>
      {folders.length > 0 && (
        <>
          {sectionLabel("Folders")}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px" }}>
            {folders.map((item) => {
              const key = `folder-${item.name}`;
              const selKey = folderKeyOf(item);
              const shCount = folderSharedCount(item);
              return (
                <div
                  key={key}
                  data-cid={selKey}
                  onClick={(e) => {
                    if (e.ctrlKey || e.metaKey) { toggleSelect(selKey); return; }
                    navigateInto(item);
                  }}
                  onContextMenu={(e) => openMenuForFolder(e, item)}
                  draggable={canDragFolder(item)}
                  onDragStart={() => canDragFolder(item) && onFolderDragStart(item)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onFolderDrop(e, item)}
                  onMouseEnter={() => setHoveredKey(key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  style={{
                    display: "flex", alignItems: "center", gap: "12px", padding: "10px 8px 10px 16px",
                    borderRadius: "12px", cursor: "pointer",
                    backgroundColor: hoveredKey === key ? theme.tileHover : theme.tile,
                  }}
                >
                  <SelectBox cid={selKey} visible={hoveredKey === key || someSelected} />
                  {shCount !== 0 ? (
                    <span title={shCount > 0 ? `Shared with ${shCount}` : "Shared with you"}>
                      <SharedFolderIcon size={20} color={theme.subText} badge={hoveredKey === key ? theme.tileHover : theme.tile} />
                    </span>
                  ) : (
                    <Folder size={20} fill={theme.subText} color={theme.subText} style={{ flexShrink: 0 }} />
                  )}
                  <span style={{ flex: 1, fontSize: "14px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{highlightName(item.name)}</span>
                  {starredFolders?.has(folderPathOf(item)) && <Star size={13} fill="#F29900" color="#F29900" style={{ flexShrink: 0 }} />}
                  <MoreButton item={item} visible={hoveredKey === key} />
                </div>
              );
            })}
          </div>
        </>
      )}

      {fileItems.length > 0 && (
        <>
          {sectionLabel("Files")}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px" }}>
            {fileItems.map((item) => {
              const key = `file-${item.cid}`;
              const { Icon, color } = fileVisual(item.filename);
              return (
                <div
                  key={key}
                  data-cid={item.cid}
                  draggable
                  onDragStart={() => onFileDragStart(item)}
                  onClick={(e) => {
                    if (e.ctrlKey || e.metaKey) { toggleSelect(item.cid); return; }
                    setPreviewFile(item);
                  }}
                  onContextMenu={(e) => openMenuForFile(e, item)}
                  onMouseEnter={() => setHoveredKey(key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  style={{
                    borderRadius: "12px", overflow: "hidden", cursor: "pointer",
                    backgroundColor: hoveredKey === key ? theme.tileHover : theme.tile,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 6px 10px 14px" }}>
                    <SelectBox cid={item.cid} visible={hoveredKey === key || someSelected} />
                    <Icon size={17} color={color} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: "13px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.filename}>{highlightName(item.filename)}</span>
                    {starred?.has(item.cid) && <Star size={13} fill="#F29900" color="#F29900" style={{ flexShrink: 0 }} />}
                    <MoreButton item={item} visible={hoveredKey === key} />
                  </div>
                  <div style={{
                    margin: "0 8px 8px", height: "110px", borderRadius: "8px", overflow: "hidden",
                    backgroundColor: theme.card, display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {hasThumbnailFor(item.filename) ? (
                      <Thumbnail
                        cid={item.cid}
                        filename={item.filename}
                        API_BASE_URL={API_BASE_URL}
                        authToken={authToken}
                        fallback={<Icon size={44} color={color} strokeWidth={1.2} />}
                      />
                    ) : (
                      <Icon size={44} color={color} strokeWidth={1.2} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
