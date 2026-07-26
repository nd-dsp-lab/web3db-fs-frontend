import React, { useEffect, useRef, useState } from "react";
import { Download, Pencil, Share2, FolderInput, Trash2, ChevronRight, Folder, Star, RotateCcw, Info } from "lucide-react";
import { DOWNLOAD } from "../utils/permissions";
import { useLayout } from "../contexts/LayoutContext";
import { isTrashed, joinPath } from "../lib/paths";
import { DANGER, SHARE, STARRED } from "../lib/theme";

// Shortcut hints shown in menus — the keys act on the current selection
const IS_MAC = typeof navigator !== "undefined" && navigator.platform.toUpperCase().includes("MAC");
export const SHORTCUTS = {
  rename: IS_MAC ? "⌥⌘E" : "Ctrl+Alt+E",
  star: IS_MAC ? "⌥⌘S" : "Ctrl+Alt+S",
  trash: "Delete",
};

// Recursively builds a flat list of { label, path } for all folders in the tree
export function collectFolders(node, parentPath = "") {
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

// Everything but the menu's own position and subject comes from context: the
// actions here are the same ones the toolbar and the other menus already pull
// from there, and threading them through AppLayout only obscured that.
export default function FileContextMenu({ x, y, file, onClose }) {
  const {
    theme, fileTree, currentPath, confirm, starred,
    downloadFile, openDetails, setShareFile, promptRenameFile, toggleStar,
    handleDelete, handleMove, handleTrash, handleRestore,
  } = useLayout();

  const inTrash = isTrashed(file);
  const isStarred = !!starred?.has(file.cid);

  const menuRef = useRef(null);
  const [showOrganize, setShowOrganize] = useState(false);

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
  // Colours come from the app theme; only the semantic ones (danger, share,
  // starred) are literals, since those read correctly on either background.
  const menuStyle = {
    position: "fixed", top: y, left: x, zIndex: 9999,
    background: theme.card, border: `1px solid ${theme.border}`, borderRadius: "6px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.15)", minWidth: "180px",
    padding: "4px 0", fontSize: "0.875em", color: theme.text,
  };
  const itemBase = {
    padding: "8px 16px", cursor: "pointer", display: "flex",
    alignItems: "center", gap: "8px", whiteSpace: "nowrap",
    userSelect: "none", position: "relative",
  };
  const dividerStyle = { borderTop: `1px solid ${theme.border}`, margin: "4px 0" };

  const Item = ({ icon, label, onClick, color, disabled = false, shortcut }) => (
    <div
      onMouseDown={e => { e.stopPropagation(); if (!disabled) onClick(); }}
      style={{
        ...itemBase,
        color: color || theme.text,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = theme.hoverRow; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ width: "16px", display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</span>
      {label}
      {shortcut && <span style={{ marginLeft: "auto", paddingLeft: "18px", color: theme.subText, fontSize: "0.85em" }}>{shortcut}</span>}
    </div>
  );

  // Trashed files get a minimal menu: restore or delete forever
  if (inTrash) {
    return (
      <div ref={menuRef} style={menuStyle}>
        <Item
          icon={<RotateCcw size={15} />} label="Restore"
          onClick={() => { onClose(); handleRestore(file); }}
        />
        {(permissions & DOWNLOAD) !== 0 && (
          <Item icon={<Download size={15} />} label="Download" onClick={() => { downloadFile(file); onClose(); }} />
        )}
        <Item icon={<Info size={15} />} label="File details" onClick={() => { onClose(); openDetails(file); }} />
        <div style={dividerStyle} />
        <Item
          icon={<Trash2 size={15} />} label="Delete forever" color={DANGER}
          onClick={async () => { onClose(); await handleDelete(file.cid); }}
        />
      </div>
    );
  }

  return (
    <div ref={menuRef} style={menuStyle}>

      {/* DOWNLOAD */}
      {(permissions & DOWNLOAD) !== 0 && (
        <Item icon={<Download size={15} />} label="Download" onClick={() => { downloadFile(file); onClose(); }} />
      )}

      {/* FILE DETAILS */}
      <Item icon={<Info size={15} />} label="File details" onClick={() => { onClose(); openDetails(file); }} />

      {/* STAR — non-owners keep it top-level (no Organize menu without move rights) */}
      {!is_owner && (
        <Item
          icon={<Star size={15} fill={isStarred ? STARRED : "none"} color={isStarred ? STARRED : undefined} />}
          label={isStarred ? "Remove from starred" : "Add to starred"}
          shortcut={SHORTCUTS.star}
          onClick={() => { toggleStar(file.cid); onClose(); }}
        />
      )}

      {/* RENAME — owner only; a move within the same folder */}
      {is_owner && (
        <Item
          icon={<Pencil size={15} />} label="Rename" shortcut={SHORTCUTS.rename}
          onClick={() => { onClose(); promptRenameFile(file); }}
        />
      )}

      <div style={dividerStyle} />

      {/* SHARE — owner only; opens the share modal (add + revoke access) */}
      {is_owner && (
        <Item
          icon={<Share2 size={15} />} label="Share" color={SHARE}
          onClick={() => { onClose(); setShareFile(file); }}
        />
      )}

      {/* ORGANIZE — owner only: star + move destinations, grouped like Drive */}
      {is_owner && (
        <div
          style={{ position: "relative" }}
          onMouseEnter={() => setShowOrganize(true)}
          onMouseLeave={() => setShowOrganize(false)}
        >
          <div
            style={{ ...itemBase, justifyContent: "space-between" }}
            onMouseEnter={e => { e.currentTarget.style.background = theme.hoverRow; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span style={{ width: "16px", display: "flex", alignItems: "center", justifyContent: "center" }}><FolderInput size={15} /></span>
              Organize
            </span>
            <ChevronRight size={14} color={theme.subText} />
          </div>

          {showOrganize && (
            <div style={{
              position: "absolute", top: 0, left: "100%",
              background: theme.card, border: `1px solid ${theme.border}`, borderRadius: "6px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.15)", minWidth: "200px",
              maxHeight: "260px", overflowY: "auto", padding: "4px 0", zIndex: 10000,
            }}>
              <Item
                icon={<Star size={15} fill={isStarred ? STARRED : "none"} color={isStarred ? STARRED : undefined} />}
                label={isStarred ? "Remove from starred" : "Add to starred"}
                shortcut={SHORTCUTS.star}
                onClick={() => { toggleStar(file.cid); onClose(); }}
              />
              <div style={dividerStyle} />
              <div style={{ padding: "4px 16px", fontSize: "0.8em", color: theme.subText }}>Move to</div>

              {currentPath !== "/" && (
                <div
                  onMouseDown={async e => {
                    e.stopPropagation();
                    onClose();
                    const newPath = joinPath("/", file.filename);
                    const ok = await confirm({ title: "Move file", message: `Move "${file.filename}" to /?`, confirmLabel: "Move" });
                    if (!ok) return;
                    await handleMove(file.cid, newPath);
                  }}
                  style={itemBase}
                  onMouseEnter={e => e.currentTarget.style.background = theme.hoverRow}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <Folder size={14} color={theme.subText} /> /
                </div>
              )}

              {folders.length === 0 && currentPath === "/" && (
                <div style={{ ...itemBase, color: theme.subText, opacity: 0.7, cursor: "default" }}>No other folders</div>
              )}

              {folders.map(({ label, path }) => (
                <div
                  key={path}
                  onMouseDown={async e => {
                    e.stopPropagation();
                    onClose();
                    const newPath = joinPath(path, file.filename);
                    const ok = await confirm({ title: "Move file", message: `Move "${file.filename}" to ${path}?`, confirmLabel: "Move" });
                    if (!ok) return;
                    await handleMove(file.cid, newPath);
                  }}
                  style={itemBase}
                  onMouseEnter={e => e.currentTarget.style.background = theme.hoverRow}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <Folder size={14} color={theme.subText} /> {label}
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
          icon={<Trash2 size={15} />} label="Move to trash" color={DANGER} shortcut={SHORTCUTS.trash}
          onClick={async () => { onClose(); await handleTrash(file); }}
        />
      )}
    </div>
  );
}