import React, { useState, useEffect } from "react";
import {
  Folder, Users, MoreVertical, Upload, FolderUp, FolderPlus,
} from "lucide-react";
import FileContextMenu from "./FileContextMenu";
import DetailsPanel from "./DetailsPanel";
import PreviewModal from "./PreviewModal";
import ShareModal from "./ShareModal";
import NameModal from "./NameModal";
import Sidebar from "./Sidebar";
import Header from "./Header";
import Toolbar from "./Toolbar";
import FileGrid from "./FileGrid";
import FileList from "./FileList";
import BackgroundMenu from "./BackgroundMenu";
import FolderMenu from "./FolderMenu";
import SelectionMenu from "./SelectionMenu";
import { useSelection } from "../hooks/useSelection";
import { useDownloads } from "../hooks/useDownloads";
import { useExternalDropUpload } from "../hooks/useExternalDropUpload";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useSortedItems } from "../hooks/useSortedItems";
import { useDragMove } from "../hooks/useDragMove";
import { useContextMenus } from "../hooks/useContextMenus";
import { makeTheme } from "../lib/theme";
import { joinPath } from "../lib/paths";
import { LayoutContext } from "../contexts/LayoutContext";

// Drive-style shared-folder icon: folder with a small people glyph punched
// out in the tile's background color (lucide has no combined icon)
const SharedFolderIcon = ({ size = 20, color, badge }) => (
  <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
    <Folder size={size} fill={color} color={color} />
    <Users
      size={Math.round(size * 0.5)}
      color={badge}
      strokeWidth={2.5}
      style={{ position: "absolute", left: "50%", top: "58%", transform: "translate(-50%, -50%)" }}
    />
  </span>
);


export default function AppLayout({
  account, authToken, connectWallet, disconnectWallet, displayItems, currentPath, setCurrentPath,
  uploadFile, setUploadMode, handleCreateFolder, handleRenameFolder, handleMoveFolder, handleTrashFolder, handleDelete, handleDeleteFolder, handleMove,
  handleTrash, handleRestore, handleDropUpload,
  handleShare, handleUnshare, handleShareCids, handleUnshareCids,
  handleRestoreFolder, handleDeleteFolderForever,
  folderCidsOf, folderStatsOf, fileTree, api,
  view, setView, searchQuery, setSearchQuery, searchType, setSearchType, searchScope, setSearchScope, darkMode, toggleTheme, user,
  starred, toggleStar, toggleStarMany, starredFolders, toggleStarFolder, storageUsed, storageQuota, toast,
  handleBulkTrash, handleBulkRestore, handleBulkDelete, handleBulkMove, confirm,
}) {
  const [viewMode, setViewMode] = useState("grid"); // "grid" | "list"
  const [previewFile, setPreviewFile] = useState(null);
  const [shareFile, setShareFile] = useState(null);
  const [hoveredKey, setHoveredKey] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsFile, setDetailsFile] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null); // { type: "file", file } | { type: "folder", name, path }
  const [newFolderOpen, setNewFolderOpen] = useState(false);

  const { selected, setSelected, toggleSelect, clearSelection, band, contentRef, onBandStart } =
    useSelection({ view, currentPath, searchQuery });

  const { dragOver, onDragEnter, onDragLeave, onDragOverContent, onExternalDrop } =
    useExternalDropUpload({ view, searchQuery, toast, handleDropUpload });

  const { downloadFile, downloadMany, downloadFolder } =
    useDownloads({ api, account, authToken, toast });

  const theme = makeTheme(darkMode);

  const triggerUpload = (mode) => {
    setUploadMode(mode);
    setIsNewMenuOpen(false);
    setTimeout(() => {
      const id = mode === "folder" ? "folderIn" : "fileIn";
      document.getElementById(id)?.click();
    }, 10);
  };

  // Folder items in My Drive only carry a name (path = currentPath + name);
  // in the Starred view they carry their full path directly.
  const folderPathOf = (item) =>
    item.fullPath || joinPath(currentPath, item.name);

  // Shared-folder detection: folders shared *to* me are always shared (-1 =
  // no recipient count); owned folders count as shared when their inherited
  // share set (intersection across their files) is non-empty
  const folderSharedCount = (item) => {
    if (item.shared) return -1;
    if (!folderStatsOf) return 0;
    return folderStatsOf((item.trash ? "/.trash" : "") + folderPathOf(item)).sharedWith?.length || 0;
  };

  const promptRenameFolder = (folderName, folderPath) =>
    setRenameTarget({ type: "folder", name: folderName, path: folderPath });

  const navigateInto = (item) => {
    // Shared/trash folders browse within their own views; starred-view and
    // search-result folders navigate back into the drive
    setView(item.shared ? "shared" : item.trash ? "trash" : "my-drive");
    setCurrentPath(folderPathOf(item));
    setSearchQuery("");
  };

  // Highlight the matching part of a name in search results
  const highlightName = (name) => {
    if (!searchQuery || typeof name !== "string") return name;
    const i = name.toLowerCase().indexOf(searchQuery.toLowerCase());
    if (i === -1) return name;
    return (
      <>
        {name.slice(0, i)}
        <mark style={{ backgroundColor: "#FDD663", color: "#1F1F1F", borderRadius: "2px", padding: 0 }}>
          {name.slice(i, i + searchQuery.length)}
        </mark>
        {name.slice(i + searchQuery.length)}
      </>
    );
  };

  const { sortBy, sortDir, toggleSort, folders, fileItems } =
    useSortedItems({ displayItems, folderStatsOf, folderPathOf });

  const selectedFiles = fileItems.filter((f) => selected.has(f.cid));
  const folderKeyOf = (item) => `folder:${folderPathOf(item)}`;
  const selectedFolders = folders.filter((i) => selected.has(folderKeyOf(i)));
  const selectedCount = selectedFiles.length + selectedFolders.length;
  const someSelected = selectedCount > 0;

  // Multi-select share: owned files + owned folders expanded to their cids,
  // presented through the ShareModal's folder mode as one grantFiles tx.
  const ownedSelection = selectedFiles.every((f) => f.is_owner) && selectedFolders.every((i) => !i.shared);
  const {
    isNewMenuOpen, setIsNewMenuOpen,
    contextMenu, closeContextMenu,
    bgMenu, setBgMenu, folderMenu, setFolderMenu,
    folderOrganizeOpen, setFolderOrganizeOpen, selMenu, setSelMenu,
    openMenuForFile, openMenuForFolder, onBackgroundContextMenu,
  } = useContextMenus({
    view, searchQuery,
    selection: { count: selectedCount, has: (key) => selected.has(key) },
    folderPathOf, folderKeyOf,
  });

  const {
    onFileDragStart, onFolderDragStart, canDragFolder,
    onInternalDropTo, onFolderDrop, dropHover, dropUnhover,
  } = useDragMove({
    view, currentPath, theme,
    selection: {
      files: selectedFiles, folders: selectedFolders,
      count: selectedCount, has: (key) => selected.has(key), clear: clearSelection,
    },
    folderPathOf, folderKeyOf,
    handleMove, handleMoveFolder, handleBulkMove,
  });

  useKeyboardShortcuts({
    // Gate on what is actually open, not on detailsFile, which lingers
    enabled: !(previewFile || shareFile || detailsOpen || newFolderOpen || renameTarget),
    view,
    selection: { files: selectedFiles, folders: selectedFolders, count: selectedCount, clear: clearSelection },
    folderPathOf,
    actions: {
      renameFile: (file) => setRenameTarget({ type: "file", file }),
      renameFolder: (item) => promptRenameFolder(item.name, folderPathOf(item)),
      bulkTrash: handleBulkTrash,
      bulkDelete: handleBulkDelete,
      toggleStarMany,
    },
  });

  const openShareForSelection = () => {
    const cids = [
      ...selectedFiles.filter((f) => f.is_owner).map((f) => f.cid),
      ...selectedFolders.filter((i) => !i.shared).flatMap((i) => (folderCidsOf ? folderCidsOf(folderPathOf(i)) : [])),
    ];
    setShareFile({
      folder: true,
      selection: true,
      filename: `${selectedCount} selected item(s)`,
      cids: [...new Set(cids)],
    });
  };

  // Multi-select download: each folder as its own zip, then files one by
  // one. Trash-view folder paths are logical — the real path sits under /.trash.
  const downloadSelection = async () => {
    for (const i of selectedFolders) {
      await downloadFolder(i.name, (i.trash ? "/.trash" : "") + folderPathOf(i));
    }
    if (selectedFiles.length) await downloadMany(selectedFiles);
  };

  // While the panel is open it follows the selection — first selected file,
  // or the selected folder when only folders are selected.
  useEffect(() => {
    if (!detailsOpen) return;
    if (selectedCount > 1) {
      // Drive-style selection summary: counts + combined size (folders
      // contribute their aggregate stats)
      const folderStats = selectedFolders.map((i) => folderStatsOf((i.trash ? "/.trash" : "") + folderPathOf(i)));
      setDetailsFile({
        type: "multi",
        items: selectedCount,
        files: selectedFiles.length + folderStats.reduce((s, st) => s + st.fileCount, 0),
        folders: selectedFolders.length,
        size: selectedFiles.reduce((s, f) => s + (f.size || 0), 0) + folderStats.reduce((s, st) => s + st.size, 0),
      });
    } else if (selectedFiles.length > 0) {
      setDetailsFile(selectedFiles[0]);
    } else if (selectedFolders.length > 0) {
      const item = selectedFolders[0];
      setDetailsFile({ type: "folder", name: item.name, path: folderPathOf(item), shared: !!item.shared });
    }
  }, [detailsOpen, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const openDetails = (file) => { setDetailsFile(file); setDetailsOpen(true); };

  // --- Reusable bits ---
  const MoreButton = ({ item, visible }) => (
    <button
      onClick={(e) => { e.stopPropagation(); item.type === "file" ? openMenuForFile(e, item) : openMenuForFolder(e, item); }}
      title="More actions"
      style={{
        background: "none", border: "none", cursor: "pointer", color: theme.subText,
        borderRadius: "50%", width: "30px", height: "30px", display: "flex",
        alignItems: "center", justifyContent: "center", flexShrink: 0,
        opacity: visible ? 1 : 0, transition: "opacity 0.1s",
      }}
    >
      <MoreVertical size={17} />
    </button>
  );

  // Clickable list-view column header; arrow shows the active sort direction
  // Shared by the New button dropdown and the background right-click menu
  const newMenuItems = [
    { Icon: FolderPlus, label: "New folder", action: () => setNewFolderOpen(true) },
    { Icon: Upload, label: "File upload", action: () => triggerUpload("single") },
    { Icon: FolderUp, label: "Folder upload", action: () => triggerUpload("folder") },
  ];

  // Breadcrumb: "My Drive > folder > sub"
  const crumbs = currentPath === "/" ? [] : currentPath.split("/").filter(Boolean);
  const crumbPath = (idx) => "/" + crumbs.slice(0, idx + 1).join("/");

  const emptyState = (
    <div style={{ textAlign: "center", padding: "80px 0", color: theme.subText }}>
      <Folder size={56} strokeWidth={1} style={{ opacity: 0.4, marginBottom: "12px" }} />
      <div style={{ fontSize: "16px", color: theme.text, marginBottom: "4px" }}>
        {searchQuery ? "No matching files"
          : view === "shared" ? "Nothing shared with you yet"
          : view === "recent" ? "No recent files"
          : view === "starred" ? "No starred files"
          : view === "trash" ? "Trash is empty"
          : "This folder is empty"}
      </div>
      <div style={{ fontSize: "13px" }}>
        {searchQuery ? "Try a different search term."
          : view === "shared" ? "Files that others share with you will show up here."
          : view === "recent" ? "Files you upload or receive will show up here, newest first."
          : view === "starred" ? "Right-click a file and choose “Add to starred”."
          : view === "trash" ? "Files you delete are kept here until you delete them forever."
          : "Drop files here or use the New button to upload files."}
      </div>
    </div>
  );

  const sectionLabel = (text) => (
    <div style={{ fontSize: "13px", fontWeight: 500, color: theme.subText, margin: "18px 4px 10px" }}>{text}</div>
  );

  // Checkbox used on tiles and rows; visible on hover or while selecting
  const SelectBox = ({ cid, visible }) => (
    <input
      type="checkbox"
      checked={selected.has(cid)}
      onChange={() => toggleSelect(cid)}
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "16px", height: "16px", accentColor: "#1A73E8", cursor: "pointer",
        flexShrink: 0, opacity: visible || selected.has(cid) ? 1 : 0, transition: "opacity 0.1s",
      }}
    />
  );

  // Bundle the values the deep view components need, so they can pull from
  // context instead of being threaded long prop chains through AppLayout.
  const layoutCtx = {
    theme, view,
    folders, fileItems,
    hoveredKey, setHoveredKey,
    selected, setSelected, toggleSelect, someSelected, selectedCount,
    navigateInto, setPreviewFile,
    openMenuForFile, openMenuForFolder,
    canDragFolder, onFileDragStart, onFolderDragStart, onFolderDrop,
    folderKeyOf, folderPathOf, folderSharedCount,
    starred, starredFolders,
    SelectBox, MoreButton, SharedFolderIcon, sectionLabel, highlightName,
    sortBy, sortDir, toggleSort,
    api, authToken,
    // Toolbar
    selectedFiles, selectedFolders, clearSelection, ownedSelection,
    toggleStarMany, openShareForSelection, downloadSelection,
    handleBulkRestore, handleBulkDelete, handleBulkTrash,
    searchQuery, crumbs, crumbPath, currentPath, setCurrentPath,
    dropHover, dropUnhover, onInternalDropTo,
    displayItems, handleDeleteFolder, viewMode, setViewMode,
    detailsOpen, setDetailsOpen,
    searchType, setSearchType, searchScope, setSearchScope,
    newMenuItems, confirm,
    // FolderMenu
    fileTree, toggleStarFolder, folderCidsOf,
    folderOrganizeOpen, setFolderOrganizeOpen,
    downloadFolder, openDetails, setShareFile, promptRenameFolder,
    handleMoveFolder, handleTrashFolder, handleRestoreFolder, handleDeleteFolderForever,
    // Sidebar
    setView, setSearchQuery, isNewMenuOpen, setIsNewMenuOpen,
    storageUsed, storageQuota,
    // Header
    darkMode, toggleTheme, account, connectWallet, disconnectWallet, user,
  };

  return (
    <LayoutContext.Provider value={layoutCtx}>
    <div style={{ display: "flex", height: "100vh", backgroundColor: theme.bg, fontFamily: "'Google Sans', Roboto, Arial, sans-serif", color: theme.text }}>
      {/* SIDEBAR */}
      <Sidebar />

      {/* MAIN CONTENT AREA */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Header />

        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOverContent}
          onDrop={onExternalDrop}
          style={{
            flex: 1, margin: "12px 16px 16px 4px", backgroundColor: theme.card,
            borderRadius: "16px", display: "flex", flexDirection: "column", overflow: "hidden",
            position: "relative",
          }}
        >
          {dragOver && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 50, pointerEvents: "none",
              backgroundColor: "rgba(26,115,232,0.08)", border: "2px dashed #1A73E8",
              borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center",
              flexDirection: "column", gap: "10px",
            }}>
              <Upload size={40} color="#1A73E8" strokeWidth={1.5} />
              <div style={{ fontSize: "16px", fontWeight: 500, color: theme.text }}>
                Drop files to upload to {currentPath === "/" ? "My Drive" : `"${crumbs[crumbs.length - 1]}"`}
              </div>
            </div>
          )}
          <Toolbar />

          {/* CONTENT */}
          <div ref={contentRef} onMouseDown={onBandStart} onContextMenu={onBackgroundContextMenu} style={{ padding: "0 24px 24px", flex: 1, overflowY: "auto" }}>
            {(!displayItems || displayItems.length === 0) ? emptyState : viewMode === "grid" ? (
              <FileGrid />
            ) : (
              <FileList />
            )}
          </div>
        </div>

        {detailsOpen && (
          <DetailsPanel
            file={detailsFile}
            account={account}
            authToken={authToken}
            api={api}
            // detailsFile also gates the keyboard shortcuts, so it has to be
            // cleared here or they stay dead for the rest of the session.
            onClose={() => { setDetailsOpen(false); setDetailsFile(null); }}
            theme={theme}
            toast={toast}
            isStarred={detailsFile
              ? (detailsFile.type === "folder" ? starredFolders?.has(detailsFile.path) : starred?.has(detailsFile.cid))
              : false}
            folderStatsOf={folderStatsOf}
          />
        )}
        </div>
      </main>

      {bgMenu && (
        <BackgroundMenu bgMenu={bgMenu} setBgMenu={setBgMenu} />
      )}

      {folderMenu && (
        <FolderMenu folderMenu={folderMenu} setFolderMenu={setFolderMenu} />
      )}

      {selMenu && (
        <SelectionMenu selMenu={selMenu} setSelMenu={setSelMenu} />
      )}

      {band && (
        <div style={{
          position: "fixed", left: band.left, top: band.top,
          width: band.right - band.left, height: band.bottom - band.top,
          backgroundColor: "rgba(26,115,232,0.12)", border: "1px solid rgba(26,115,232,0.6)",
          zIndex: 5000, pointerEvents: "none",
        }} />
      )}

      <input type="file" id="fileIn" style={{ display: "none" }} onChange={uploadFile} />
      <input type="file" id="folderIn" webkitdirectory="true" directory="" multiple style={{ display: "none" }} onChange={uploadFile} />

      {shareFile && (
        <ShareModal
          file={shareFile}
          account={account}
          authToken={authToken}
          api={api}
          confirm={confirm}
          onClose={() => setShareFile(null)}
          onShare={shareFile.folder
            ? (_cid, recipient) => handleShareCids(
                shareFile.cids,
                recipient,
                shareFile.selection ? `${shareFile.cids.length} file(s)` : `the folder "${shareFile.filename}"`
              )
            : handleShare}
          onUnshare={shareFile.folder
            ? (_cid, addr) => handleUnshareCids(shareFile.cids, addr)
            : handleUnshare}
          darkMode={darkMode}
        />
      )}

      {previewFile && (
        <PreviewModal
          file={previewFile}
          account={account}
          authToken={authToken}
          api={api}
          onClose={() => setPreviewFile(null)}
          onDownload={downloadFile}
          darkMode={darkMode}
        />
      )}

      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          file={contextMenu.file}
          theme={theme}
          fileTree={fileTree}
          currentPath={currentPath}
          confirm={confirm}
          onClose={closeContextMenu}
          onDownload={downloadFile}
          onDetails={openDetails}
          onShareOpen={(file) => setShareFile(file)}
          onRenameOpen={(file) => setRenameTarget({ type: "file", file })}
          onDelete={handleDelete}
          onMove={handleMove}
          onTrash={handleTrash}
          onRestore={handleRestore}
          inTrash={(contextMenu.file.folder_path || "/").startsWith("/.trash")}
          isStarred={starred?.has(contextMenu.file.cid)}
          onToggleStar={toggleStar}
        />
      )}

      {newFolderOpen && (
        <NameModal
          title="New folder"
          submitLabel="Create"
          initialName=""
          isFolder
          darkMode={darkMode}
          siblings={(displayItems || []).map((i) => i.name).filter(Boolean)}
          onClose={() => setNewFolderOpen(false)}
          onSubmit={(name) => handleCreateFolder(name)}
        />
      )}

      {renameTarget && (
        <NameModal
          initialName={renameTarget.type === "file" ? renameTarget.file.filename : renameTarget.name}
          isFolder={renameTarget.type === "folder"}
          darkMode={darkMode}
          siblings={(displayItems || []).map((i) => i.name).filter((n) => n && n !== (renameTarget.type === "file" ? renameTarget.file.filename : renameTarget.name))}
          onClose={() => setRenameTarget(null)}
          onSubmit={(newName) => {
            if (renameTarget.type === "folder") {
              handleRenameFolder(renameTarget.path, newName);
            } else {
              const f = renameTarget.file;
              const folder = f.folder_path || currentPath || "/";
              handleMove(f.cid, joinPath(folder.replace(/\/+$/, ""), newName));
            }
          }}
        />
      )}
    </div>
    </LayoutContext.Provider>
  );
}
