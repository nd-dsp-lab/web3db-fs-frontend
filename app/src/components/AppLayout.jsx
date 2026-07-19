import React, { useState, useEffect, useRef } from "react";
import {
  Plus, Folder, FileText, Image as ImageIcon, Video, Music, Archive,
  FileCode, File as FileIcon, HardDrive, Users, LayoutGrid, List as ListIcon,
  ChevronRight, MoreVertical, Trash2, Search, Upload, FolderUp, FolderPlus,
  Sun, Moon, Clock, Star, Cloud, Download, X, RotateCcw, Info, ArrowUp, ArrowDown, Pencil, UserPlus, FolderInput,
} from "lucide-react";
import FileContextMenu, { collectFolders } from "./FileContextMenu";
import DetailsPanel from "./DetailsPanel";
import PreviewModal from "./PreviewModal";
import ShareModal from "./ShareModal";

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

// Pick an icon + accent color from the file extension, similar to how
// Drive colors PDFs red, sheets green, etc.
export function fileVisual(filename = "") {
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

const THUMBNAIL_EXTENSIONS = [
  // images + pdf (rendered directly)
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "pdf",
  // text-like files (backend renders a page snippet)
  "txt", "md", "csv", "json", "js", "jsx", "ts", "tsx", "py", "html", "css",
  "xml", "yaml", "yml", "toml", "ini", "log", "sh", "c", "cpp", "h", "java",
  "go", "rs", "rb", "sql", "env", "cfg", "conf",
];
const hasThumbnail = (filename = "") => THUMBNAIL_EXTENSIONS.includes(filename.split(".").pop().toLowerCase());

// CID -> object URL (or "failed"); module-level so navigation and re-renders
// never refetch. Thumbnails are fetched with fetch() rather than <img src>
// because the ngrok tunnel needs the skip-warning header.
const thumbCache = new Map();

export function hasThumbnailFor(filename) { return hasThumbnail(filename); }

export function Thumbnail({ cid, filename, API_BASE_URL, fallback, authToken }) {
  const [src, setSrc] = useState(() => thumbCache.get(cid) || null);
  useEffect(() => {
    if (thumbCache.has(cid)) { setSrc(thumbCache.get(cid)); return; }
    if (!authToken) return; // wait for download auth before requesting
    let cancelled = false;
    fetch(`${API_BASE_URL}/thumbnail/${cid}`, { headers: { "ngrok-skip-browser-warning": "true", "x-auth-token": authToken } })
      .then((r) => (r.ok && r.headers.get("content-type")?.startsWith("image/") ? r.blob() : Promise.reject()))
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        thumbCache.set(cid, url);
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        thumbCache.set(cid, "failed");
        if (!cancelled) setSrc("failed");
      });
    return () => { cancelled = true; };
  }, [cid, API_BASE_URL, authToken]);

  if (!src || src === "failed") return fallback;
  // Photos crop from the center; document-style thumbs (text, PDF) are
  // top-anchored so short content isn't cropped away to a blank strip.
  const isPhoto = ["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(filename.split(".").pop().toLowerCase());
  return <img src={src} alt={filename} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: isPhoto ? "center" : "top", borderRadius: "8px" }} />;
}

export function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

const STORAGE_QUOTA = 1024 ** 3; // 1 GB nominal quota for the usage bar

const VIEW_TITLES = { "my-drive": "My Drive", shared: "Shared with me", recent: "Recent", starred: "Starred", trash: "Trash" };

export default function AppLayout({
  account, authToken, connectWallet, disconnectWallet, displayItems, currentPath, setCurrentPath,
  uploadFile, setUploadMode, handleCreateFolder, handleRenameFolder, handleMoveFolder, handleTrashFolder, handleDelete, handleDeleteFolder, handleMove,
  handleTrash, handleRestore, handleDropUpload,
  handleShare, handleUnshare, handleShareCids, handleUnshareCids,
  handleRestoreFolder, handleDeleteFolderForever,
  folderCidsOf, folderStatsOf, fileTree, API_BASE_URL,
  view, setView, searchQuery, setSearchQuery, darkMode, toggleTheme, user,
  starred, toggleStar, toggleStarMany, starredFolders, toggleStarFolder, storageUsed, toast,
  handleBulkTrash, handleBulkRestore, handleBulkDelete,
}) {
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [draggedFile, setDraggedFile] = useState(null);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, file }
  const [bgMenu, setBgMenu] = useState(null); // { x, y } — background right-click menu
  const [folderMenu, setFolderMenu] = useState(null); // { x, y, name } — folder right-click menu
  const [folderOrganizeOpen, setFolderOrganizeOpen] = useState(false); // Organize hover submenu in folder menu
  const [selMenu, setSelMenu] = useState(null); // { x, y } — right-click menu over a multi-selection
  const [viewMode, setViewMode] = useState("grid"); // "grid" | "list"
  const [previewFile, setPreviewFile] = useState(null);
  const [shareFile, setShareFile] = useState(null);
  const [hoveredKey, setHoveredKey] = useState(null);
  const [selected, setSelected] = useState(new Set()); // file CIDs + "folder:{path}" keys
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsFile, setDetailsFile] = useState(null);

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

  const promptRenameFolder = (folderName, folderPath) => {
    const newName = window.prompt("New folder name", folderName)?.trim();
    if (!newName || newName === folderName) return;
    if (newName.includes("/")) { toast.error("Folder name can't contain /"); return; }
    handleRenameFolder(folderPath, newName);
  };

  const openMenuForFolder = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    // Right-click inside a multi-selection acts on the whole selection
    if (selectedCount > 1 && selected.has(folderKeyOf(item))) { setSelMenu({ x: e.clientX, y: e.clientY }); return; }
    setFolderOrganizeOpen(false);
    setFolderMenu({ x: e.clientX, y: e.clientY, name: item.name, path: folderPathOf(item), shared: !!item.shared, trash: !!item.trash });
  };

  const navigateInto = (item) => {
    // Shared/trash folders browse within their own views; starred-view
    // folders navigate back into the drive
    setView(item.shared ? "shared" : item.trash ? "trash" : "my-drive");
    setCurrentPath(folderPathOf(item));
  };

  // Account chip: social users see name/email, wallet users see the address
  const displayName = user?.google?.name || user?.email?.address ||
    (account ? `${account.slice(0, 6)}...${account.slice(-4)}` : null);
  const avatarLetter = (user?.google?.name || user?.email?.address || account || "?")[0].toUpperCase();

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
  const clearSelection = () => setSelected(new Set());

  // Multi-select share: owned files + owned folders expanded to their cids,
  // presented through the ShareModal's folder mode as one grantFiles tx.
  const ownedSelection = selectedFiles.every((f) => f.is_owner) && selectedFolders.every((i) => !i.shared);
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

  // While the panel is open it follows the selection; navigation away from
  // the shown file's view clears it via displayItems refresh below.
  useEffect(() => {
    if (detailsOpen && selectedFiles.length > 0) setDetailsFile(selectedFiles[0]);
  }, [detailsOpen, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const openDetails = (file) => { setDetailsFile(file); setDetailsOpen(true); };

  // --- Reusable bits ---
  const NavItem = ({ id, icon: Icon, label }) => (
    <div
      onClick={() => { setView(id); setCurrentPath("/"); setSearchQuery(""); }}
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
                            <SelectBox cid={selKey} visible={hoveredKey === key || someSelected} />
                            {shCount !== 0 ? (
                              <span title={shCount > 0 ? `Shared with ${shCount}` : "Shared with you"}>
                                <SharedFolderIcon size={20} color={theme.subText} badge={hoveredKey === key ? theme.tileHover : theme.tile} />
                              </span>
                            ) : (
                              <Folder size={20} fill={theme.subText} color={theme.subText} style={{ flexShrink: 0 }} />
                            )}
                            <span style={{ flex: 1, fontSize: "14px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
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
                              <span style={{ flex: 1, fontSize: "13px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.filename}>{item.filename}</span>
                              {starred?.has(item.cid) && <Star size={13} fill="#F29900" color="#F29900" style={{ flexShrink: 0 }} />}
                              <MoreButton item={item} visible={hoveredKey === key} />
                            </div>
                            <div style={{
                              margin: "0 8px 8px", height: "110px", borderRadius: "8px", overflow: "hidden",
                              backgroundColor: theme.card, display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              {hasThumbnail(item.filename) ? (
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
            ) : (
              /* LIST VIEW */
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
                    const key = `${item.type}-${item.cid || item.name}`;
                    const { Icon, color } = item.type === "file" ? fileVisual(item.filename) : { Icon: Folder, color: theme.subText };
                    const sharedCount = Array.isArray(item.shared_with) ? item.shared_with.length : 0;
                    const folderShCount = item.type === "folder" ? folderSharedCount(item) : 0;
                    return (
                      <tr
                        key={key}
                        data-cid={item.type === "file" ? item.cid : folderKeyOf(item)}
                        draggable={item.type === "file"}
                        onDragStart={() => item.type === "file" && onFileDragStart(item)}
                        onDragOver={(e) => { if (item.type === "folder") e.preventDefault(); }}
                        onDrop={(e) => item.type === "folder" && onFolderDrop(e, item.name)}
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
                          {item.name}
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

      {folderMenu && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed", top: folderMenu.y, left: folderMenu.x, width: "180px",
            backgroundColor: theme.card, border: `1px solid ${theme.border}`, borderRadius: "8px",
            zIndex: 9999, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", padding: "6px 0",
          }}
        >
          {(() => {
            const Row = ({ Icon, label, color, onClick, right }) => (
              <div
                onClick={onClick}
                style={{
                  padding: "10px 18px", cursor: "pointer", display: "flex", alignItems: "center",
                  justifyContent: right ? "space-between" : "flex-start", gap: "12px", fontSize: "14px",
                  color: color || theme.text,
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.hoverRow}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
              >
                <span style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <Icon size={16} color={color || theme.subText} /> {label}
                </span>
                {right}
              </div>
            );
            const starLabel = starredFolders?.has(folderMenu.path) ? "Remove from starred" : "Add to starred";
            const doStar = () => { setFolderMenu(null); toggleStarFolder(folderMenu.path); };

            if (folderMenu.trash) {
              return (
                <>
                  <Row Icon={RotateCcw} label="Restore" onClick={() => { setFolderMenu(null); handleRestoreFolder(folderMenu.path); }} />
                  <Row Icon={Trash2} label="Delete forever" color="#d9534f" onClick={() => { setFolderMenu(null); handleDeleteFolderForever(folderMenu.path); }} />
                </>
              );
            }

            // Move destinations: all folders except the folder itself, its
            // descendants, and its current parent — plus root
            const parent = folderMenu.path.slice(0, folderMenu.path.lastIndexOf("/")) || "/";
            const dests = [
              ...(parent !== "/" ? [{ label: "/", path: "/" }] : []),
              ...collectFolders(fileTree).filter(({ path }) =>
                path !== folderMenu.path &&
                !path.startsWith(folderMenu.path + "/") &&
                path !== parent
              ),
            ];
            const doMove = (destPath) => {
              setFolderMenu(null);
              if (!window.confirm(`Move "${folderMenu.name}" to ${destPath}?`)) return;
              handleMoveFolder(folderMenu.path, destPath);
            };

            return (
              <>
                <Row Icon={Download} label="Download" onClick={() => { setFolderMenu(null); downloadFolder(folderMenu.name, folderMenu.path); }} />
                {/* Shared folders have no move rights — star stays top-level */}
                {folderMenu.shared && <Row Icon={Star} label={starLabel} onClick={doStar} />}
                <Row
                  Icon={Info} label="Folder details"
                  onClick={() => { setFolderMenu(null); openDetails({ type: "folder", name: folderMenu.name, path: folderMenu.path, shared: folderMenu.shared }); }}
                />
                {!folderMenu.shared && (
                  <>
                    <Row
                      Icon={UserPlus} label="Share"
                      onClick={() => {
                        setFolderMenu(null);
                        setShareFile({
                          folder: true,
                          filename: folderMenu.name,
                          path: folderMenu.path,
                          cids: folderCidsOf ? folderCidsOf(folderMenu.path) : [],
                        });
                      }}
                    />
                    <Row Icon={Pencil} label="Rename" onClick={() => { setFolderMenu(null); promptRenameFolder(folderMenu.name, folderMenu.path); }} />
                    {/* Organize: star + move grouped like Drive */}
                    <div
                      style={{ position: "relative" }}
                      onMouseEnter={() => setFolderOrganizeOpen(true)}
                      onMouseLeave={() => setFolderOrganizeOpen(false)}
                    >
                      <Row Icon={FolderInput} label="Organize" onClick={() => {}} right={<ChevronRight size={14} color={theme.subText} />} />
                      {folderOrganizeOpen && (
                        <div style={{
                          position: "absolute", left: "100%", top: 0, minWidth: "200px",
                          maxHeight: "260px", overflowY: "auto",
                          backgroundColor: theme.card, border: `1px solid ${theme.border}`, borderRadius: "8px",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.15)", padding: "6px 0", zIndex: 10000,
                        }}>
                          <Row Icon={Star} label={starLabel} onClick={doStar} />
                          <div style={{ borderTop: `1px solid ${theme.border}`, margin: "4px 0" }} />
                          <div style={{ padding: "6px 18px 4px", fontSize: "12px", color: theme.subText }}>Move to</div>
                          {dests.length === 0 && (
                            <div style={{ padding: "8px 18px", fontSize: "13px", color: theme.subText }}>No other folders</div>
                          )}
                          {dests.map(({ label, path }) => (
                            <Row key={path} Icon={Folder} label={label} onClick={() => doMove(path)} />
                          ))}
                        </div>
                      )}
                    </div>
                    <Row Icon={Trash2} label="Move to trash" color="#d9534f" onClick={() => { setFolderMenu(null); handleTrashFolder(folderMenu.path); }} />
                  </>
                )}
              </>
            );
          })()}
        </div>
      )}

      {selMenu && (
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
          {[
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
          ].map(({ Icon, label, color, action }) => (
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
          onClose={() => setContextMenu(null)}
          onDownload={downloadFile}
          onDetails={openDetails}
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
