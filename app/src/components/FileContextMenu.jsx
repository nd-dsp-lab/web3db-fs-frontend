import React, { useEffect, useRef, useState } from "react";
import { Download, Pencil, Share2, FolderInput, Trash2, ChevronRight, Folder, Star, RotateCcw } from "lucide-react";

// Recursively builds a flat list of { label, path } for all folders in the tree
function collectFolders(node, parentPath = "") {
  const results = [];
  if (!node || node.type !== "folder") return results;

  const fullPath = node.name === "/" ? "/" : `${parentPath}/${node.name}`;

  // Add this folder (skip root label — handled separately)
  if (node.name !== "/") {
    results.push({ label: fullPath, path: fullPath });
  }

  for (const child of node.children || []) {
    if (child.type === "folder") {
      results.push(...collectFolders(child, fullPath === "/" ? "" : fullPath));
    }
  }
  return results;
}

export default function FileContextMenu({
  x,
  y,
  file,
  fileTree,
  currentPath,
  onClose,
  onDownload,
  onShareOpen,
  onDelete,
  onMove,
  onTrash,
  onRestore,
  inTrash,
  isStarred,
  onToggleStar,
}) {
  const menuRef = useRef(null);
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false);

  // Close on outside click or Escape
  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    const handleKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Nudge menu back on-screen if it would overflow
  useEffect(() => {
    if (!menuRef.current) return;
    const { innerWidth, innerHeight } = window;
    const { offsetWidth: w, offsetHeight: h } = menuRef.current;
    if (x + w > innerWidth)  menuRef.current.style.left = `${x - w}px`;
    if (y + h > innerHeight) menuRef.current.style.top  = `${y - h}px`;
  }, [x, y]);

  const folders = collectFolders(fileTree).filter(f => f.path !== currentPath);

  const { permissions, is_owner } = file;

  // ---- Styles ----
  const menuStyle = {
    position: "fixed", top: y, left: x, zIndex: 9999,
    background: "#fff", border: "1px solid #ddd", borderRadius: "6px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.15)", minWidth: "180px",
    padding: "4px 0", fontSize: "0.875em",
  };
  const itemBase = {
    padding: "8px 16px", cursor: "pointer", display: "flex",
    alignItems: "center", gap: "8px", whiteSpace: "nowrap",
    userSelect: "none", position: "relative",
  };
  const dividerStyle = { borderTop: "1px solid #eee", margin: "4px 0" };

  const Item = ({ icon, label, onClick, color = "#222", disabled = false }) => (
    <div
      onMouseDown={e => { e.stopPropagation(); if (!disabled) onClick(); }}
      style={{
        ...itemBase,
        color: disabled ? "#bbb" : color,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = "#f5f5f5"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ width: "16px", display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</span>
      {label}
    </div>
  );

  // Trashed files get a minimal menu: restore or delete forever
  if (inTrash) {
    return (
      <div ref={menuRef} style={menuStyle}>
        <Item
          icon={<RotateCcw size={15} />} label="Restore"
          onClick={() => { onClose(); onRestore(file); }}
        />
        {(permissions & 4) !== 0 && (
          <Item icon={<Download size={15} />} label="Download" onClick={() => { onDownload(file); onClose(); }} />
        )}
        <div style={dividerStyle} />
        <Item
          icon={<Trash2 size={15} />} label="Delete forever" color="#d9534f"
          onClick={async () => { onClose(); await onDelete(file.cid); }}
        />
      </div>
    );
  }

  return (
    <div ref={menuRef} style={menuStyle}>

      {/* DOWNLOAD */}
      {(permissions & 4) !== 0 && (
        <Item icon={<Download size={15} />} label="Download" onClick={() => { onDownload(file); onClose(); }} />
      )}

      {/* STAR — anyone with the file in their list */}
      <Item
        icon={<Star size={15} fill={isStarred ? "#F29900" : "none"} color={isStarred ? "#F29900" : undefined} />}
        label={isStarred ? "Remove from starred" : "Add to starred"}
        onClick={() => { onToggleStar(file.cid); onClose(); }}
      />

      {/* RENAME — owner only; a move within the same folder */}
      {is_owner && (
        <Item
          icon={<Pencil size={15} />} label="Rename"
          onClick={async () => {
            onClose();
            const newName = window.prompt("New name", file.filename);
            if (!newName || newName === file.filename) return;
            const folder = file.folder_path || currentPath || "/";
            const newPath = folder === "/" ? `/${newName}` : `${folder.replace(/\/+$/, "")}/${newName}`;
            await onMove(file.cid, newPath);
          }}
        />
      )}

      <div style={dividerStyle} />

      {/* SHARE — owner only; opens the share modal (add + revoke access) */}
      {is_owner && (
        <Item
          icon={<Share2 size={15} />} label="Share" color="#00a86b"
          onClick={() => { onClose(); onShareOpen(file); }}
        />
      )}

      {/* MOVE — owner only, with folder submenu */}
      {is_owner && (
        <div
          style={{ position: "relative" }}
          onMouseEnter={() => setShowMoveSubmenu(true)}
          onMouseLeave={() => setShowMoveSubmenu(false)}
        >
          <div
            style={{
              ...itemBase,
              color: folders.length === 0 ? "#bbb" : "#222",
              cursor: folders.length === 0 ? "not-allowed" : "pointer",
              justifyContent: "space-between",
            }}
            onMouseEnter={e => { if (folders.length > 0) e.currentTarget.style.background = "#f5f5f5"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span style={{ width: "16px", display: "flex", alignItems: "center", justifyContent: "center" }}><FolderInput size={15} /></span>
              Move to
            </span>
            <ChevronRight size={14} color="#999" />
          </div>

          {/* Folder submenu */}
          {showMoveSubmenu && folders.length > 0 && (
            <div style={{
              position: "absolute", top: 0, left: "100%",
              background: "#fff", border: "1px solid #ddd", borderRadius: "6px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.15)", minWidth: "200px",
              maxHeight: "260px", overflowY: "auto", padding: "4px 0", zIndex: 10000,
            }}>
              {/* Root option */}
              {currentPath !== "/" && (
                <div
                  onMouseDown={async e => {
                    e.stopPropagation();
                    onClose();
                    const newPath = `/${file.filename}`;
                    const ok = window.confirm(`Move "${file.filename}" to /?`);
                    if (!ok) return;
                    await onMove(file.cid, newPath);
                  }}
                  style={itemBase}
                  onMouseEnter={e => e.currentTarget.style.background = "#f5f5f5"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <Folder size={14} color="#5f6368" /> /
                </div>
              )}

              {folders.map(({ label, path }) => (
                <div
                  key={path}
                  onMouseDown={async e => {
                    e.stopPropagation();
                    onClose();
                    const newPath = `${path}/${file.filename}`;
                    const ok = window.confirm(`Move "${file.filename}" to ${path}?`);
                    if (!ok) return;
                    await onMove(file.cid, newPath);
                  }}
                  style={itemBase}
                  onMouseEnter={e => e.currentTarget.style.background = "#f5f5f5"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <Folder size={14} color="#5f6368" /> {label}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={dividerStyle} />

      {/* MOVE TO TRASH — owner only; the wallet signature acts as the confirm */}
      {is_owner && (
        <Item
          icon={<Trash2 size={15} />} label="Move to trash" color="#d9534f"
          onClick={async () => { onClose(); await onTrash(file); }}
        />
      )}
    </div>
  );
}