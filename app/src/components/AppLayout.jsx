import React, { useState, useEffect, useRef } from "react";
import {
  Plus, Folder, FileText, Image as ImageIcon, Video, Music, Archive,
  FileCode, File as FileIcon, HardDrive, Users, LayoutGrid, List as ListIcon,
  ChevronRight, MoreVertical, Trash2, Search, Upload, FolderUp, FolderPlus,
  Sun, Moon, Clock, Star, Cloud, Download, X, RotateCcw,
} from "lucide-react";
import FileContextMenu from "./FileContextMenu";
import PreviewModal from "./PreviewModal";
import ShareModal from "./ShareModal";

// Pick an icon + accent color from the file extension, similar to how
// Drive colors PDFs red, sheets green, etc.
function fileVisual(filename = "") {
  const ext = filename.split(".").pop().toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext))
    return { Icon: ImageIcon, color: "#188038" };
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext))
    return { Icon: Video, color: "#d93025" };
  if (["mp3", "wav", "ogg", "flac", "m4a"].includes(ext))
    return { Icon: Music, color: "#f29900" };
  if (["zip", "tar", "gz", "rar", "7z"].includes(ext))
    return { Icon: Archive, color: "#5f6368" };
  if (["js", "jsx", "ts", "tsx", "py", "sol", "go", "rs", "c", "cpp", "java", "json", "html", "css", "sh"].includes(ext))
    return { Icon: FileCode, color: "#1a73e8" };
  if (["pdf"].includes(ext))
    return { Icon: FileText, color: "#d93025" };
  if (["doc", "docx", "txt", "md", "rtf"].includes(ext))
    return { Icon: FileText, color: "#1a73e8" };
  if (["xls", "xlsx", "csv"].includes(ext))
    return { Icon: FileText, color: "#188038" };
  return { Icon: FileIcon, color: "#5f6368" };
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

const STORAGE_QUOTA = 1024 ** 3; // 1 GB nominal quota for the usage bar

const VIEW_TITLES = { "my-drive": "My Drive", shared: "Shared with me", recent: "Recent", starred: "Starred", trash: "Trash" };

export default function AppLayout({
  account, connectWallet, disconnectWallet, displayItems, currentPath, setCurrentPath,
  uploadFile, setUploadMode, handleCreateFolder, handleDelete, handleDeleteFolder, handleMove,
  handleTrash, handleRestore, handleDropUpload,
  handleShare, handleUnshare, fileTree, API_BASE_URL,
  view, setView, searchQuery, setSearchQuery, darkMode, toggleTheme, user,
  starred, toggleStar, toggleStarMany, storageUsed, toast,
  handleBulkTrash, handleBulkRestore, handleBulkDelete,
}) {
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [draggedFile, setDraggedFile] = useState(null);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, file }
  const [bgMenu, setBgMenu] = useState(null); // { x, y } — background right-click menu
  const [viewMode, setViewMode] = useState("grid"); // "grid" | "list"
  const [previewFile, setPreviewFile] = useState(null);
  const [shareFile, setShareFile] = useState(null);
  const [hoveredKey, setHoveredKey] = useState(null);
  const [selected, setSelected] = useState(new Set()); // file CIDs (folders not selectable)

  // Selection is scoped to what's on screen: clear on any navigation, and on Escape
  useEffect(() => { setSelected(new Set()); }, [view, currentPath, searchQuery]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setSelected(new Set()); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const toggleSelect = (cid) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(cid) ? next.delete(cid) : next.add(cid);
      return next;
    });
  };

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
  const onExternalDrop = (e) => {
    if (!isExternalDrag(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    if (view !== "my-drive" || searchQuery) {
      toast.info("Switch to My Drive to upload by dropping files");
      return;
    }
    const files = [];
    let hadFolder = false;
    for (const item of e.dataTransfer.items || []) {
      const entry = item.webkitGetAsEntry?.();
      if (entry?.isDirectory) { hadFolder = true; continue; }
      const f = item.getAsFile?.();
      if (f) files.push(f);
    }
    if (hadFolder) toast.info("Folders can't be dropped — use New → Folder upload");
    if (files.length) handleDropUpload(files);
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
    if (!bgMenu) return;
    const close = () => setBgMenu(null);
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [bgMenu]);

  // --- RUBBER-BAND SELECTION ---
  // Drag from empty content-area background to draw a selection box; file
  // tiles/rows intersecting it get selected. Ctrl/shift-drag adds to the
  // existing selection. A plain click on empty space clears it.
  const contentRef = useRef(null);
  const [band, setBand] = useState(null); // viewport coords {left, top, right, bottom}

  const onBandStart = (e) => {
    if (e.button !== 0) return;
    // Only start from true background — not tiles, rows, or controls
    if (e.target.closest("[data-cid],[data-noselect],button,input,a,table thead")) return;
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    const base = additive ? new Set(selected) : new Set();
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    document.body.style.userSelect = "none";

    const onMove = (ev) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
      moved = true;
      const rect = {
        left: Math.min(start.x, ev.clientX), right: Math.max(start.x, ev.clientX),
        top: Math.min(start.y, ev.clientY), bottom: Math.max(start.y, ev.clientY),
      };
      setBand(rect);
      const hits = new Set(base);
      contentRef.current?.querySelectorAll("[data-cid]").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.left < rect.right && r.right > rect.left && r.top < rect.bottom && r.bottom > rect.top) {
          hits.add(el.dataset.cid);
        }
      });
      setSelected(hits);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      setBand(null);
      if (!moved && !additive) setSelected(new Set());
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const downloadFile = async (file) => {
    if (!account) {
      toast.info("Sign in first");
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE_URL}/download/${file.cid}/${encodeURIComponent(file.filename)}?user_address=${encodeURIComponent(account)}`,
        { headers: { "ngrok-skip-browser-warning": "true" } }
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
  const onFileDragStart = (file) => {
    setDraggedFile({ cid: file.cid, name: file.name, fromPath: currentPath });
  };

  const onFolderDrop = async (e, targetFolderName) => {
    e.preventDefault();
    if (!draggedFile) return;
    const targetPath = currentPath === "/" ? `/${targetFolderName}` : `${currentPath}/${targetFolderName}`;
    const destination = `${targetPath}/${draggedFile.name}`;
    await handleMove(draggedFile.cid, destination);
    setDraggedFile(null);
  };

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
    setContextMenu({ x: e.clientX, y: e.clientY, file: item });
  };

  const confirmDeleteFolder = (folderName) => {
    const folderPath = currentPath === "/" ? `/${folderName}` : `${currentPath}/${folderName}`;
    if (window.confirm(`Permanently delete folder "${folderName}" and all its contents? (Folders skip the trash.)`)) {
      handleDeleteFolder(folderPath);
    }
  };

  const navigateInto = (folderName) => {
    setCurrentPath(currentPath === "/" ? `/${folderName}` : `${currentPath}/${folderName}`);
  };

  // Account chip: social users see name/email, wallet users see the address
  const displayName = user?.google?.name || user?.email?.address ||
    (account ? `${account.slice(0, 6)}...${account.slice(-4)}` : null);
  const avatarLetter = (user?.google?.name || user?.email?.address || account || "?")[0].toUpperCase();

  const folders = (displayItems || []).filter((i) => i.type === "folder");
  const fileItems = (displayItems || []).filter((i) => i.type === "file");
  const selectedFiles = fileItems.filter((f) => selected.has(f.cid));
  const someSelected = selectedFiles.length > 0;
  const clearSelection = () => setSelected(new Set());

  // --- Reusable bits ---
  const NavItem = ({ id, icon: Icon, label }) => (
    <div
      onClick={() => { setView(id); setSearchQuery(""); }}
      style={{
        display: "flex", alignItems: "center", gap: "14px", padding: "8px 16px",
        cursor: "pointer", borderRadius: "999px", fontSize: "14px",
        backgroundColor: view === id ? theme.navActive : "transparent",
        color: view === id ? theme.navActiveText : theme.text,
        fontWeight: view === id ? 600 : 400, marginBottom: "2px",
      }}
      onMouseEnter={(e) => { if (view !== id) e.currentTarget.style.backgroundColor = theme.tile; }}
      onMouseLeave={(e) => { if (view !== id) e.currentTarget.style.backgroundColor = "transparent"; }}
    >
      <Icon size={18} strokeWidth={1.8} />
      {label}
    </div>
  );

  const MoreButton = ({ item, visible }) => (
    <button
      onClick={(e) => { e.stopPropagation(); item.type === "file" ? openMenuForFile(e, item) : confirmDeleteFolder(item.name); }}
      title={item.type === "file" ? "More actions" : "Delete folder"}
      style={{
        background: "none", border: "none", cursor: "pointer", color: theme.subText,
        borderRadius: "50%", width: "30px", height: "30px", display: "flex",
        alignItems: "center", justifyContent: "center", flexShrink: 0,
        opacity: visible ? 1 : 0, transition: "opacity 0.1s",
      }}
    >
      {item.type === "file" ? <MoreVertical size={17} /> : <Trash2 size={16} />}
    </button>
  );

  // Shared by the New button dropdown and the background right-click menu
  const newMenuItems = [
    { Icon: FolderPlus, label: "New folder", action: () => { const n = prompt("Folder name"); if (n) handleCreateFolder(n); } },
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

  // Round icon button for the selection toolbar
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

  return (
    <div style={{ display: "flex", height: "100vh", backgroundColor: theme.bg, fontFamily: "'Google Sans', Roboto, Arial, sans-serif", color: theme.text }}>
      {/* SIDEBAR */}
      <aside style={{ width: "256px", padding: "8px 12px 16px", display: "flex", flexDirection: "column" }}>
        <div
          style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 8px 20px", cursor: "pointer" }}
          onClick={() => { setView("my-drive"); setCurrentPath("/"); setSearchQuery(""); }}
        >
          <div style={{ backgroundColor: "#1A73E8", color: "white", width: "32px", height: "32px", borderRadius: "8px", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>Δ</div>
          <span style={{ fontSize: "22px" }}>Web3FS</span>
        </div>

        <div onMouseDown={(e) => e.stopPropagation()} style={{ position: "relative", padding: "0 4px", marginBottom: "16px" }}>
          <button
            style={{
              display: "flex", alignItems: "center", gap: "10px", padding: "14px 22px",
              borderRadius: "16px", border: "none", cursor: "pointer",
              backgroundColor: theme.card, color: theme.text, fontSize: "14px", fontWeight: 500,
              boxShadow: "0 1px 3px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.1)",
            }}
            onClick={() => setIsNewMenuOpen(!isNewMenuOpen)}
          >
            <Plus size={20} color="#1A73E8" /> New
          </button>

          {isNewMenuOpen && (
            <div style={{
              position: "absolute", top: "56px", left: "4px", width: "200px",
              backgroundColor: theme.card, border: `1px solid ${theme.border}`, borderRadius: "8px",
              zIndex: 100, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", padding: "6px 0",
            }}>
              {newMenuItems.map(({ Icon, label, action }) => (
                <div
                  key={label}
                  onClick={() => { action(); setIsNewMenuOpen(false); }}
                  style={{ padding: "10px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: "12px", fontSize: "14px" }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.hoverRow}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                >
                  <Icon size={17} color={theme.subText} /> {label}
                </div>
              ))}
            </div>
          )}
        </div>

        <nav>
          <NavItem id="my-drive" icon={HardDrive} label="My Drive" />
          <NavItem id="shared" icon={Users} label="Shared with me" />
          <NavItem id="recent" icon={Clock} label="Recent" />
          <NavItem id="starred" icon={Star} label="Starred" />
          <NavItem id="trash" icon={Trash2} label="Trash" />
        </nav>

        {/* STORAGE INDICATOR */}
        <div style={{ marginTop: "auto", padding: "12px 16px 4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", fontSize: "14px", marginBottom: "10px" }}>
            <Cloud size={18} strokeWidth={1.8} color={theme.subText} />
            Storage
          </div>
          <div style={{ height: "4px", borderRadius: "999px", backgroundColor: theme.tile, overflow: "hidden", marginBottom: "8px" }}>
            <div style={{
              height: "100%", borderRadius: "999px", backgroundColor: "#1A73E8",
              width: `${Math.min(100, (storageUsed / STORAGE_QUOTA) * 100)}%`, minWidth: storageUsed > 0 ? "2px" : 0,
            }} />
          </div>
          <div style={{ fontSize: "12px", color: theme.subText }}>
            {formatBytes(storageUsed)} of {formatBytes(STORAGE_QUOTA)} used
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <header style={{ height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px 0", gap: "16px" }}>
          <div style={{ position: "relative", flex: 1, maxWidth: "640px" }}>
            <Search size={18} style={{ position: "absolute", left: "18px", top: "50%", transform: "translateY(-50%)", color: theme.subText }} />
            <input
              type="text"
              placeholder="Search in Web3FS"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box", padding: "13px 20px 13px 48px",
                borderRadius: "999px", border: "none", backgroundColor: theme.searchBg,
                color: theme.text, outline: "none", fontSize: "15px",
              }}
            />
          </div>

          <button
            onClick={toggleTheme}
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            style={{
              background: "none", border: "none", cursor: "pointer", color: theme.subText,
              width: "40px", height: "40px", borderRadius: "50%", display: "flex",
              alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.searchBg}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          {account ? (
            <div
              onClick={() => { if (window.confirm("Log out of Web3FS?")) disconnectWallet(); }}
              title={account}
              style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", padding: "4px 12px 4px 4px", borderRadius: "999px", backgroundColor: theme.searchBg }}
            >
              <div style={{
                width: "32px", height: "32px", borderRadius: "50%", backgroundColor: "#1A73E8",
                color: "white", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "15px", fontWeight: 600,
              }}>{avatarLetter}</div>
              <span style={{ fontSize: "13px", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</span>
            </div>
          ) : (
            <button onClick={connectWallet} style={{ backgroundColor: "#1A73E8", color: "white", border: "none", padding: "10px 22px", borderRadius: "999px", cursor: "pointer", fontWeight: 500, fontSize: "14px" }}>
              Sign in
            </button>
          )}
        </header>

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
          {/* Title row: breadcrumb + view toggle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px 6px" }}>
            {someSelected ? (
              /* SELECTION TOOLBAR — replaces the breadcrumb while files are selected */
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <ToolbarButton icon={X} title="Clear selection" onClick={clearSelection} />
                <span style={{ fontSize: "15px", fontWeight: 500, marginRight: "10px" }}>
                  {selectedFiles.length} selected
                </span>
                {view !== "trash" && (
                  <ToolbarButton
                    icon={Star}
                    title={selectedFiles.every((f) => starred?.has(f.cid)) ? "Remove from starred" : "Add to starred"}
                    onClick={() => toggleStarMany(selectedFiles.map((f) => f.cid))}
                  />
                )}
                <ToolbarButton icon={Download} title="Download" onClick={() => { downloadMany(selectedFiles); clearSelection(); }} />
                {view === "trash" ? (
                  <>
                    <ToolbarButton icon={RotateCcw} title="Restore" onClick={() => { handleBulkRestore(selectedFiles); clearSelection(); }} />
                    <ToolbarButton icon={Trash2} title="Delete forever" color="#d93025" onClick={() => { handleBulkDelete(selectedFiles); clearSelection(); }} />
                  </>
                ) : (
                  <ToolbarButton
                    icon={Trash2} title="Move to trash" color="#d93025"
                    onClick={() => { handleBulkTrash(selectedFiles.filter((f) => f.is_owner)); clearSelection(); }}
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
                  >
                    {VIEW_TITLES[view] || "My Drive"}
                  </span>
                  {view === "my-drive" && crumbs.map((c, i) => (
                    <React.Fragment key={i}>
                      <ChevronRight size={20} color={theme.subText} />
                      <span
                        onClick={() => setCurrentPath(crumbPath(i))}
                        style={{ cursor: i < crumbs.length - 1 ? "pointer" : "default", padding: "2px 8px", borderRadius: "8px" }}
                        onMouseEnter={(e) => { if (i < crumbs.length - 1) e.currentTarget.style.backgroundColor = theme.tile; }}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
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
                onClick={() => {
                  if (window.confirm(`Permanently delete all ${displayItems.length} file(s) in trash? This cannot be undone.`)) {
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

          {/* CONTENT */}
          <div ref={contentRef} onMouseDown={onBandStart} onContextMenu={onBackgroundContextMenu} style={{ padding: "0 24px 24px", flex: 1, overflowY: "auto" }}>
            {(!displayItems || displayItems.length === 0) ? emptyState : viewMode === "grid" ? (
              <>
                {folders.length > 0 && (
                  <>
                    {sectionLabel("Folders")}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px" }}>
                      {folders.map((item) => {
                        const key = `folder-${item.name}`;
                        return (
                          <div
                            key={key}
                            data-noselect="true"
                            onClick={() => navigateInto(item.name)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => onFolderDrop(e, item.name)}
                            onMouseEnter={() => setHoveredKey(key)}
                            onMouseLeave={() => setHoveredKey(null)}
                            style={{
                              display: "flex", alignItems: "center", gap: "12px", padding: "10px 8px 10px 16px",
                              borderRadius: "12px", cursor: "pointer",
                              backgroundColor: hoveredKey === key ? theme.tileHover : theme.tile,
                            }}
                          >
                            <Folder size={20} fill={theme.subText} color={theme.subText} style={{ flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: "14px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
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
                              <span style={{ flex: 1, fontSize: "13px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.filename}>{item.filename}</span>
                              {starred?.has(item.cid) && <Star size={13} fill="#F29900" color="#F29900" style={{ flexShrink: 0 }} />}
                              <MoreButton item={item} visible={hoveredKey === key} />
                            </div>
                            <div style={{
                              margin: "0 8px 8px", height: "110px", borderRadius: "8px",
                              backgroundColor: theme.card, display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              <Icon size={44} color={color} strokeWidth={1.2} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            ) : (
              /* LIST VIEW */
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "8px" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${theme.border}`, textAlign: "left", color: theme.subText, fontSize: "13px" }}>
                    <th style={{ width: "32px", padding: "10px 0 10px 8px" }}>
                      {fileItems.length > 0 && (
                        <input
                          type="checkbox"
                          title="Select all"
                          checked={selectedFiles.length === fileItems.length}
                          onChange={() =>
                            setSelected(selectedFiles.length === fileItems.length
                              ? new Set()
                              : new Set(fileItems.map((f) => f.cid)))
                          }
                          style={{ width: "16px", height: "16px", accentColor: "#1A73E8", cursor: "pointer" }}
                        />
                      )}
                    </th>
                    <th style={{ padding: "10px 8px", fontWeight: 500 }}>Name</th>
                    <th style={{ fontWeight: 500 }}>Sharing</th>
                    <th style={{ fontWeight: 500 }}>Uploaded</th>
                    <th style={{ fontWeight: 500 }}>Size</th>
                    <th style={{ fontWeight: 500 }}>CID</th>
                    <th style={{ width: "48px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map((item) => {
                    const key = `${item.type}-${item.cid || item.name}`;
                    const { Icon, color } = item.type === "file" ? fileVisual(item.filename) : { Icon: Folder, color: theme.subText };
                    const sharedCount = Array.isArray(item.shared_with) ? item.shared_with.length : 0;
                    return (
                      <tr
                        key={key}
                        {...(item.type === "file" ? { "data-cid": item.cid } : { "data-noselect": "true" })}
                        draggable={item.type === "file"}
                        onDragStart={() => item.type === "file" && onFileDragStart(item)}
                        onDragOver={(e) => { if (item.type === "folder") e.preventDefault(); }}
                        onDrop={(e) => item.type === "folder" && onFolderDrop(e, item.name)}
                        onContextMenu={(e) => item.type === "file" && openMenuForFile(e, item)}
                        onMouseEnter={() => setHoveredKey(key)}
                        onMouseLeave={() => setHoveredKey(null)}
                        style={{
                          borderBottom: `1px solid ${theme.border}`,
                          backgroundColor: hoveredKey === key ? theme.hoverRow : "transparent",
                          cursor: "pointer",
                        }}
                      >
                        <td style={{ padding: "10px 0 10px 8px" }}>
                          {item.type === "file" && <SelectBox cid={item.cid} visible={hoveredKey === key || someSelected} />}
                        </td>
                        <td
                          style={{ padding: "10px 8px", display: "flex", alignItems: "center", gap: "14px", fontSize: "14px" }}
                          onClick={(e) => {
                            if (item.type === "file" && (e.ctrlKey || e.metaKey)) { toggleSelect(item.cid); return; }
                            item.type === "folder" ? navigateInto(item.name) : setPreviewFile(item);
                          }}
                        >
                          <Icon size={19} color={color} fill={item.type === "folder" ? color : "none"} />
                          {item.name}
                          {item.type === "file" && starred?.has(item.cid) && <Star size={13} fill="#F29900" color="#F29900" />}
                        </td>
                        <td style={{ fontSize: "13px", color: theme.subText }}>
                          {item.type === "file"
                            ? (item.is_owner
                              ? (sharedCount > 0 ? `Shared with ${sharedCount}` : "Only you")
                              : (item.owner ? `Shared by ${item.owner.slice(0, 6)}...${item.owner.slice(-4)}` : "Shared with me"))
                            : "—"}
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
            )}
          </div>
        </div>
      </main>

      {bgMenu && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed", top: bgMenu.y, left: bgMenu.x, width: "200px",
            backgroundColor: theme.card, border: `1px solid ${theme.border}`, borderRadius: "8px",
            zIndex: 9999, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", padding: "6px 0",
          }}
        >
          {newMenuItems.map(({ Icon, label, action }) => (
            <div
              key={label}
              onClick={() => { setBgMenu(null); action(); }}
              style={{ padding: "10px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: "12px", fontSize: "14px" }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.hoverRow}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              <Icon size={17} color={theme.subText} /> {label}
            </div>
          ))}
        </div>
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
          onClose={() => setShareFile(null)}
          onShare={handleShare}
          onUnshare={handleUnshare}
          darkMode={darkMode}
        />
      )}

      {previewFile && (
        <PreviewModal
          file={previewFile}
          account={account}
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
          onClose={() => setContextMenu(null)}
          onDownload={downloadFile}
          onShareOpen={(file) => setShareFile(file)}
          onDelete={handleDelete}
          onMove={handleMove}
          onTrash={handleTrash}
          onRestore={handleRestore}
          inTrash={(contextMenu.file.folder_path || "/").startsWith("/.trash")}
          isStarred={starred?.has(contextMenu.file.cid)}
          onToggleStar={toggleStar}
        />
      )}
    </div>
  );
}
