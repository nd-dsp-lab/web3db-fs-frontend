import React, { useState, useEffect, useRef } from "react";
import {
  Folder, Users, MoreVertical, Upload, FolderUp, FolderPlus, Download,
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
  folderCidsOf, folderStatsOf, fileTree, API_BASE_URL,
  view, setView, searchQuery, setSearchQuery, searchType, setSearchType, searchScope, setSearchScope, darkMode, toggleTheme, user,
  starred, toggleStar, toggleStarMany, starredFolders, toggleStarFolder, storageUsed, storageQuota, toast,
  handleBulkTrash, handleBulkRestore, handleBulkDelete, handleBulkMove, confirm,
}) {
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null); // { type: "file", cid, name, fromPath } | { type: "folder", path }
  const [contextMenu, setContextMenu] = useState(null); // { x, y, file }
  const [bgMenu, setBgMenu] = useState(null); // { x, y } — background right-click menu
  const [folderMenu, setFolderMenu] = useState(null); // { x, y, name } — folder right-click menu
  const [folderOrganizeOpen, setFolderOrganizeOpen] = useState(false); // Organize hover submenu in folder menu
  const [selMenu, setSelMenu] = useState(null); // { x, y } — right-click menu over a multi-selection
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

  // Close the New dropdown on outside click or Escape (clicks inside the
  // container are stopped from propagating below)
  useEffect(() => {
    if (!isNewMenuOpen) return;
    const close = () => setIsNewMenuOpen(false);
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [isNewMenuOpen]);

  // --- DESKTOP DRAG-AND-DROP UPLOAD ---
  // External drags carry "Files" in dataTransfer.types; internal tile drags
  // don't, so the two never conflict. Uploads land in currentPath.
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);
  const isExternalDrag = (e) => e.dataTransfer?.types?.includes("Files");

  const onDragEnter = (e) => {
    if (!isExternalDrag(e)) return;
    e.preventDefault();
    dragDepth.current++;
    if (view === "my-drive" && !searchQuery) setDragOver(true);
  };
  const onDragLeave = (e) => {
    if (!isExternalDrag(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  };
  const onDragOverContent = (e) => {
    if (isExternalDrag(e)) e.preventDefault(); // required to allow the drop
  };
  // Recursively read a dropped FileSystemEntry (file or directory) into
  // [{ file, rel }], where rel keeps the folder structure ("docs/sub/a.txt")
  const readAllEntries = (reader) => new Promise((resolve, reject) => {
    const all = [];
    const step = () => reader.readEntries((batch) => {
      if (!batch.length) return resolve(all);
      all.push(...batch);
      step(); // readEntries returns at most ~100 per call
    }, reject);
    step();
  });
  const collectEntry = async (entry, prefix, out) => {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      out.push({ file, rel: prefix + entry.name });
    } else if (entry.isDirectory) {
      const children = await readAllEntries(entry.createReader());
      for (const child of children) await collectEntry(child, `${prefix}${entry.name}/`, out);
    }
  };

  const onExternalDrop = async (e) => {
    if (!isExternalDrag(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    if (view !== "my-drive" || searchQuery) {
      toast.info("Switch to My Drive to upload by dropping files");
      return;
    }
    // Grab entries synchronously — dataTransfer.items dies with the event
    const entries = [...(e.dataTransfer.items || [])]
      .map((item) => item.webkitGetAsEntry?.())
      .filter(Boolean);
    if (!entries.length) {
      // Browser without the entry API: plain files only
      const files = [...(e.dataTransfer.files || [])].map((f) => ({ file: f, rel: f.name }));
      if (files.length) handleDropUpload(files);
      return;
    }
    const out = [];
    try {
      for (const entry of entries) await collectEntry(entry, "", out);
    } catch (err) {
      console.error("Reading dropped items failed:", err);
      toast.error("Could not read the dropped folder");
      return;
    }
    if (out.length) handleDropUpload(out);
    else toast.info("Dropped folder is empty");
  };

  // --- BACKGROUND RIGHT-CLICK MENU (New folder / uploads) ---
  // Only in My Drive: uploads and new folders target the current path,
  // which the other views don't have.
  const onBackgroundContextMenu = (e) => {
    if (view !== "my-drive" || searchQuery) return;
    if (e.target.closest("[data-cid],[data-noselect],button,input,a,table thead")) return;
    e.preventDefault();
    setBgMenu({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (!bgMenu && !folderMenu && !selMenu) return;
    const close = () => { setBgMenu(null); setFolderMenu(null); setSelMenu(null); setFolderOrganizeOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [bgMenu, folderMenu, selMenu]);

  const downloadFile = async (file) => {
    if (!account) {
      toast.info("Sign in first");
      return;
    }
    if (!authToken) {
      toast.info("Verifying sign-in — try again in a moment");
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE_URL}/download/${file.cid}/${encodeURIComponent(file.filename)}`,
        { headers: { "ngrok-skip-browser-warning": "true", "x-auth-token": authToken } }
      );
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message || "Download failed");
    }
  };

  // Sequential bulk download with a single progress toast
  const downloadMany = async (items) => {
    const tId = toast.loading(`Downloading 0/${items.length}…`);
    let done = 0;
    for (const f of items) {
      toast.update(tId, `Downloading ${done + 1}/${items.length}…`, "loading");
      await downloadFile(f); // errors toast individually inside
      done++;
    }
    toast.update(tId, `Downloaded ${done} file(s)`, "success");
  };

  // Google Drive palette (light) with a matching dark variant
  const theme = darkMode ? {
    bg: "#131314", card: "#1E1F20", text: "#E3E3E3", subText: "#9AA0A6",
    border: "#3C4043", searchBg: "#282A2C", tile: "#2D2E31", tileHover: "#37393B",
    navActive: "#004A77", navActiveText: "#C2E7FF", hoverRow: "#2D2E31",
  } : {
    bg: "#F8FAFD", card: "#FFFFFF", text: "#1F1F1F", subText: "#5F6368",
    border: "#E0E3E7", searchBg: "#EDF1F7", tile: "#F0F4F9", tileHover: "#E1E5EA",
    navActive: "#C2E7FF", navActiveText: "#001D35", hoverRow: "#F5F8FC",
  };

  // --- DRAG AND DROP LOGIC ---
  // Internal drags move files/folders between folders; drop targets are
  // folder tiles/rows, breadcrumb segments, and the My Drive nav item.
  // Dragging an item that's part of the multi-selection drags the whole
  // selection (Drive behavior); an unselected item drags alone.
  const onFileDragStart = (file) => {
    if (selectedCount > 1 && selected.has(file.cid)) { setDraggedItem({ type: "selection" }); return; }
    setDraggedItem({ type: "file", cid: file.cid, name: file.name, fromPath: currentPath });
  };

  const onFolderDragStart = (item) => {
    if (selectedCount > 1 && selected.has(folderKeyOf(item))) { setDraggedItem({ type: "selection" }); return; }
    setDraggedItem({ type: "folder", path: folderPathOf(item) });
  };

  // Owned live folders only — no dragging in trash or of folders shared to me
  const canDragFolder = (item) => !item.shared && !item.trash;

  const onInternalDropTo = async (e, destFolderPath) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedItem || view === "trash") return; // no drag-moves inside Trash
    const item = draggedItem;
    setDraggedItem(null);
    if (item.type === "selection") {
      await handleBulkMove(
        selectedFiles.filter((f) => f.is_owner),
        selectedFolders.filter((i) => !i.shared && !i.trash).map(folderPathOf),
        destFolderPath
      );
      clearSelection();
    } else if (item.type === "file") {
      if (item.fromPath === destFolderPath) return; // already there — skip the pointless signature
      const destination = destFolderPath === "/" ? `/${item.name}` : `${destFolderPath}/${item.name}`;
      await handleMove(item.cid, destination);
    } else {
      // handleMoveFolder no-ops on same-place and self/descendant drops
      await handleMoveFolder(item.path, destFolderPath);
    }
  };

  const onFolderDrop = (e, targetItem) =>
    onInternalDropTo(e, folderPathOf(targetItem));

  // Drag-over feedback for breadcrumb / nav drop targets
  const dropHover = (e) => { if (draggedItem) { e.preventDefault(); e.currentTarget.style.backgroundColor = theme.navActive; } };
  const dropUnhover = (e) => { e.currentTarget.style.backgroundColor = "transparent"; };

  const triggerUpload = (mode) => {
    setUploadMode(mode);
    setIsNewMenuOpen(false);
    setTimeout(() => {
      const id = mode === "folder" ? "folderIn" : "fileIn";
      document.getElementById(id)?.click();
    }, 10);
  };

  const openMenuForFile = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    // Right-click inside a multi-selection acts on the whole selection
    if (selectedCount > 1 && selected.has(item.cid)) { setSelMenu({ x: e.clientX, y: e.clientY }); return; }
    setContextMenu({ x: e.clientX, y: e.clientY, file: item });
  };

  // Folder items in My Drive only carry a name (path = currentPath + name);
  // in the Starred view they carry their full path directly.
  const folderPathOf = (item) =>
    item.fullPath || (currentPath === "/" ? `/${item.name}` : `${currentPath}/${item.name}`);

  // Shared-folder detection: folders shared *to* me are always shared (-1 =
  // no recipient count); owned folders count as shared when their inherited
  // share set (intersection across their files) is non-empty
  const folderSharedCount = (item) => {
    if (item.shared) return -1;
    if (!folderStatsOf) return 0;
    return folderStatsOf((item.trash ? "/.trash" : "") + folderPathOf(item)).sharedWith?.length || 0;
  };

  const downloadFolder = async (folderName, folderPath) => {
    if (!authToken) { toast.info("Verifying sign-in — try again in a moment"); return; }
    const tId = toast.loading(`Zipping "${folderName}"…`);
    try {
      const res = await fetch(
        `${API_BASE_URL}/download-folder?path=${encodeURIComponent(folderPath)}`,
        { headers: { "ngrok-skip-browser-warning": "true", "x-auth-token": authToken } }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${folderName}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      toast.update(tId, `Downloaded "${folderName}.zip"`, "success");
    } catch (err) {
      toast.update(tId, err.message || "Download failed", "error");
    }
  };

  const promptRenameFolder = (folderName, folderPath) =>
    setRenameTarget({ type: "folder", name: folderName, path: folderPath });

  const openMenuForFolder = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    // Right-click inside a multi-selection acts on the whole selection
    if (selectedCount > 1 && selected.has(folderKeyOf(item))) { setSelMenu({ x: e.clientX, y: e.clientY }); return; }
    setFolderOrganizeOpen(false);
    setFolderMenu({ x: e.clientX, y: e.clientY, name: item.name, path: folderPathOf(item), shared: !!item.shared, trash: !!item.trash });
  };

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

  // --- SORTING ---
  const [sortBy, setSortBy] = useState("name"); // "name" | "date" | "size"
  const [sortDir, setSortDir] = useState("asc");
  const dirMul = sortDir === "asc" ? 1 : -1;
  const fileCmp = {
    name: (a, b) => (a.filename || a.name || "").localeCompare(b.filename || b.name || "", undefined, { numeric: true, sensitivity: "base" }),
    date: (a, b) => (a.timestamp || 0) - (b.timestamp || 0),
    size: (a, b) => (a.size || 0) - (b.size || 0),
  }[sortBy];
  const toggleSort = (key) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(key); setSortDir(key === "name" ? "asc" : "desc"); } // newest/largest first feels natural
  };

  // Folders sort like files: name directly, size/date from aggregate stats
  // (total size, latest file timestamp)
  const folders = (displayItems || []).filter((i) => i.type === "folder")
    .map((i) => {
      if (sortBy === "name" || !folderStatsOf) return i;
      // Trash-view folder paths are logical — the real path sits under /.trash
      const s = folderStatsOf((i.trash ? "/.trash" : "") + folderPathOf(i));
      return { ...i, size: s.size, timestamp: s.latest || 0 };
    })
    .sort((a, b) => fileCmp(a, b) * dirMul);
  const fileItems = (displayItems || []).filter((i) => i.type === "file")
    .sort((a, b) => fileCmp(a, b) * dirMul);
  const selectedFiles = fileItems.filter((f) => selected.has(f.cid));
  const folderKeyOf = (item) => `folder:${folderPathOf(item)}`;
  const selectedFolders = folders.filter((i) => selected.has(folderKeyOf(i)));
  const selectedCount = selectedFiles.length + selectedFolders.length;
  const someSelected = selectedCount > 0;

  // Multi-select share: owned files + owned folders expanded to their cids,
  // presented through the ShareModal's folder mode as one grantFiles tx.
  const ownedSelection = selectedFiles.every((f) => f.is_owner) && selectedFolders.every((i) => !i.shared);
  // --- KEYBOARD SHORTCUTS (Drive-style) ---
  // ⌥⌘E / F2 rename (single selection), Delete/Backspace trash (delete
  // forever in Trash), ⌥⌘S toggle star — all act on the current selection.
  // Handler lives in a ref so the listener registers once but reads fresh state.
  const shortcutRef = useRef();
  shortcutRef.current = (e) => {
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (previewFile || shareFile || detailsFile || renameTarget) return;
    const combo = (e.metaKey || e.ctrlKey) && e.altKey;

    if (e.key === "F2" || (combo && e.code === "KeyE")) {
      if (selectedCount !== 1 || view === "trash") return;
      e.preventDefault();
      if (selectedFiles.length === 1) {
        const file = selectedFiles[0];
        if (!file.is_owner) return;
        clearSelection();
        setRenameTarget({ type: "file", file });
      } else {
        const item = selectedFolders[0];
        if (item.shared || item.trash) return;
        clearSelection();
        promptRenameFolder(item.name, folderPathOf(item));
      }
      return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      if (selectedCount === 0) return;
      e.preventDefault();
      if (view === "trash") {
        handleBulkDelete(selectedFiles, selectedFolders.map(folderPathOf));
      } else {
        handleBulkTrash(
          selectedFiles.filter((f) => f.is_owner),
          selectedFolders.filter((i) => !i.shared).map(folderPathOf)
        );
      }
      clearSelection();
      return;
    }

    if (combo && e.code === "KeyS") {
      if (selectedCount === 0 || view === "trash") return;
      e.preventDefault();
      toggleStarMany(selectedFiles.map((f) => f.cid), selectedFolders.map(folderPathOf));
      clearSelection();
    }
  };
  useEffect(() => {
    const h = (e) => shortcutRef.current?.(e);
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

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
    API_BASE_URL, authToken,
    // Toolbar
    selectedFiles, selectedFolders, clearSelection, ownedSelection,
    toggleStarMany, openShareForSelection, downloadSelection,
    handleBulkRestore, handleBulkDelete, handleBulkTrash,
    searchQuery, crumbs, crumbPath, currentPath, setCurrentPath,
    dropHover, dropUnhover, onInternalDropTo,
    displayItems, handleDeleteFolder, viewMode, setViewMode,
    setSortBy, setSortDir, detailsOpen, setDetailsOpen,
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
            API_BASE_URL={API_BASE_URL}
            onClose={() => setDetailsOpen(false)}
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
          API_BASE_URL={API_BASE_URL}
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
          API_BASE_URL={API_BASE_URL}
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
          fileTree={fileTree}
          currentPath={currentPath}
          confirm={confirm}
          onClose={() => setContextMenu(null)}
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
              const newPath = folder === "/" ? `/${newName}` : `${folder.replace(/\/+$/, "")}/${newName}`;
              handleMove(f.cid, newPath);
            }
          }}
        />
      )}
    </div>
    </LayoutContext.Provider>
  );
}
