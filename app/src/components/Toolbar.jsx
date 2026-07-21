import React from "react";
import {
  X, Star, UserPlus, Download, RotateCcw, Trash2, ChevronRight,
  ArrowUp, ArrowDown, Info, List as ListIcon, LayoutGrid,
} from "lucide-react";
import { useLayout } from "../contexts/LayoutContext";

const VIEW_TITLES = { "my-drive": "My Drive", shared: "Shared with me", recent: "Recent", starred: "Starred", trash: "Trash" };

// The row under the header: a selection toolbar while items are selected,
// otherwise the breadcrumb/search title, plus sort/details/view controls and
// the search filter chips.
export default function Toolbar() {
  const {
    theme, view,
    // selection
    someSelected, selectedCount, selectedFiles, selectedFolders, folderPathOf,
    clearSelection, starred, starredFolders, toggleStarMany, ownedSelection,
    openShareForSelection, downloadSelection, handleBulkRestore, handleBulkDelete, handleBulkTrash,
    // breadcrumb / navigation
    searchQuery, crumbs, crumbPath, currentPath, setCurrentPath,
    dropHover, dropUnhover, onInternalDropTo,
    // right-side controls
    displayItems, handleDeleteFolder, viewMode, setViewMode,
    sortBy, setSortBy, sortDir, setSortDir, detailsOpen, setDetailsOpen,
    // search chips
    searchType, setSearchType, searchScope, setSearchScope,
    confirm,
  } = useLayout();
  const ToolbarButton = ({ icon: Icon, title, onClick, color }) => (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: "none", border: "none", cursor: "pointer", color: color || theme.text,
        width: "38px", height: "38px", borderRadius: "50%", display: "flex",
        alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.tile}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
    >
      <Icon size={19} strokeWidth={1.8} />
    </button>
  );

  return (
    <>
      {/* Title row: breadcrumb + view toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px 6px" }}>
        {someSelected ? (
          /* SELECTION TOOLBAR — replaces the breadcrumb while files are selected */
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <ToolbarButton icon={X} title="Clear selection" onClick={clearSelection} />
            <span style={{ fontSize: "15px", fontWeight: 500, marginRight: "10px" }}>
              {selectedCount} selected
            </span>
            {view !== "trash" && (
              <ToolbarButton
                icon={Star}
                title={selectedFiles.every((f) => starred?.has(f.cid)) && selectedFolders.every((i) => starredFolders?.has(folderPathOf(i)))
                  ? "Remove from starred" : "Add to starred"}
                onClick={() => toggleStarMany(selectedFiles.map((f) => f.cid), selectedFolders.map(folderPathOf))}
              />
            )}
            {view !== "trash" && ownedSelection && (
              <ToolbarButton icon={UserPlus} title="Share" onClick={openShareForSelection} />
            )}
            <ToolbarButton icon={Download} title="Download" onClick={() => { downloadSelection(); clearSelection(); }} />
            {view === "trash" ? (
              <>
                <ToolbarButton icon={RotateCcw} title="Restore" onClick={() => { handleBulkRestore(selectedFiles, selectedFolders.map(folderPathOf)); clearSelection(); }} />
                <ToolbarButton icon={Trash2} title="Delete forever" color="#d93025" onClick={() => { handleBulkDelete(selectedFiles, selectedFolders.map(folderPathOf)); clearSelection(); }} />
              </>
            ) : (
              <ToolbarButton
                icon={Trash2} title="Move to trash" color="#d93025"
                onClick={() => {
                  handleBulkTrash(
                    selectedFiles.filter((f) => f.is_owner),
                    selectedFolders.filter((i) => !i.shared).map(folderPathOf)
                  );
                  clearSelection();
                }}
              />
            )}
          </div>
        ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "2px", fontSize: "22px", flexWrap: "wrap" }}>
          {searchQuery ? (
            <span>Results for “{searchQuery}”</span>
          ) : (
            <>
              <span
                onClick={() => setCurrentPath("/")}
                style={{ cursor: crumbs.length ? "pointer" : "default", padding: "2px 8px", borderRadius: "8px" }}
                onMouseEnter={(e) => { if (crumbs.length) e.currentTarget.style.backgroundColor = theme.tile; }}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                onDragOver={view === "my-drive" ? dropHover : undefined}
                onDragLeave={view === "my-drive" ? dropUnhover : undefined}
                onDrop={view === "my-drive" ? (e) => { dropUnhover(e); onInternalDropTo(e, "/"); } : undefined}
              >
                {VIEW_TITLES[view] || "My Drive"}
              </span>
              {(view === "my-drive" || view === "shared" || view === "trash") && crumbs.map((c, i) => (
                <React.Fragment key={i}>
                  <ChevronRight size={20} color={theme.subText} />
                  <span
                    onClick={() => setCurrentPath(crumbPath(i))}
                    style={{ cursor: i < crumbs.length - 1 ? "pointer" : "default", padding: "2px 8px", borderRadius: "8px" }}
                    onMouseEnter={(e) => { if (i < crumbs.length - 1) e.currentTarget.style.backgroundColor = theme.tile; }}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                    onDragOver={view === "my-drive" ? dropHover : undefined}
                    onDragLeave={view === "my-drive" ? dropUnhover : undefined}
                    onDrop={view === "my-drive" ? (e) => { dropUnhover(e); onInternalDropTo(e, crumbPath(i)); } : undefined}
                  >
                    {c}
                  </span>
                </React.Fragment>
              ))}
            </>
          )}
        </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {view === "trash" && (displayItems?.length || 0) > 0 && (
          <button
            onClick={async () => {
              if (await confirm({ title: "Empty trash", message: `Permanently delete all ${displayItems.length} file(s) in trash? This cannot be undone.`, confirmLabel: "Delete", danger: true })) {
                handleDeleteFolder("/.trash");
              }
            }}
            style={{
              border: "none", cursor: "pointer", padding: "8px 16px", borderRadius: "999px",
              backgroundColor: "transparent", color: "#d93025", fontSize: "13px", fontWeight: 500,
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.tile}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
          >
            Empty trash
          </button>
        )}

        {/* Sort controls (grid view; list view sorts via column headers) */}
        {viewMode === "grid" && (
          <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); setSortDir(e.target.value === "name" ? "asc" : "desc"); }}
              title="Sort by"
              style={{
                border: `1px solid ${theme.border}`, borderRadius: "999px", padding: "6px 10px",
                backgroundColor: "transparent", color: theme.text, fontSize: "13px", cursor: "pointer", outline: "none",
              }}
            >
              <option value="name">Name</option>
              <option value="date">Uploaded</option>
              <option value="size">Size</option>
            </select>
            <button
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              title={sortDir === "asc" ? "Ascending" : "Descending"}
              style={{
                background: "none", border: "none", cursor: "pointer", color: theme.subText,
                width: "32px", height: "32px", borderRadius: "50%", display: "flex",
                alignItems: "center", justifyContent: "center",
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.tile}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              {sortDir === "asc" ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
            </button>
          </div>
        )}

        <button
          onClick={() => setDetailsOpen((o) => !o)}
          title="File details"
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: detailsOpen ? "#1A73E8" : theme.subText,
            width: "36px", height: "36px", borderRadius: "50%", display: "flex",
            alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.tile}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
        >
          <Info size={19} strokeWidth={1.8} />
        </button>

        {/* Grid / list toggle */}
        <div style={{ display: "flex", border: `1px solid ${theme.border}`, borderRadius: "999px", overflow: "hidden" }}>
          {[["list", ListIcon], ["grid", LayoutGrid]].map(([mode, Icon]) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              title={`${mode} view`}
              style={{
                border: "none", cursor: "pointer", padding: "7px 16px",
                backgroundColor: viewMode === mode ? theme.navActive : "transparent",
                color: viewMode === mode ? theme.navActiveText : theme.subText,
                display: "flex", alignItems: "center",
              }}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* SEARCH FILTER CHIPS — type buckets + current-folder scope */}
      {searchQuery && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", padding: "0 24px 14px" }}>
          {[
            [null, "All"], ["folder", "Folders"], ["pdf", "PDFs"], ["image", "Images"],
            ["doc", "Docs"], ["video", "Videos"], ["audio", "Audio"], ["code", "Code"], ["archive", "Archives"],
          ].map(([key, label]) => {
            const active = searchType === key;
            return (
              <button
                key={label}
                onClick={() => setSearchType(key)}
                style={{
                  border: `1px solid ${active ? "transparent" : theme.border}`, cursor: "pointer",
                  padding: "6px 14px", borderRadius: "999px", fontSize: "13px",
                  backgroundColor: active ? theme.navActive : "transparent",
                  color: active ? theme.navActiveText : theme.text, fontWeight: active ? 600 : 400,
                }}
              >
                {label}
              </button>
            );
          })}
          {currentPath !== "/" && (
            <button
              onClick={() => setSearchScope(searchScope === "folder" ? "all" : "folder")}
              title="Only results inside the folder you were browsing"
              style={{
                border: `1px dashed ${searchScope === "folder" ? "transparent" : theme.border}`, cursor: "pointer",
                padding: "6px 14px", borderRadius: "999px", fontSize: "13px", marginLeft: "8px",
                backgroundColor: searchScope === "folder" ? theme.navActive : "transparent",
                color: searchScope === "folder" ? theme.navActiveText : theme.subText,
                fontWeight: searchScope === "folder" ? 600 : 400,
              }}
            >
              In “{crumbs[crumbs.length - 1]}”
            </button>
          )}
        </div>
      )}
    </>
  );
}
