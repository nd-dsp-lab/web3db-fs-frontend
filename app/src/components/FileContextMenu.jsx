import React, { useEffect, useRef, useState } from "react";
import { Download, Pencil, Share2, FolderInput, Trash2, ChevronRight, Folder, Star, RotateCcw, Info } from "lucide-react";
import { DOWNLOAD } from "../utils/permissions";
import { useLayout } from "../contexts/LayoutContext";
import { isTrashed, joinPath } from "../lib/paths";
import { DANGER, SHARE, STARRED } from "../lib/theme";
import { MenuPanel, MenuRow, MenuLabel, MenuDivider } from "./Menu";

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

  // A shortcut hint sits at the row's trailing edge, where the other menus put
  // their chevrons.
  const Shortcut = ({ text }) => (
    <span style={{ color: theme.subText, fontSize: "12px" }}>{text}</span>
  );

  // The star's glyph fills when the file is starred, so it arrives built.
  const starIcon = (
    <Star size={16} fill={isStarred ? STARRED : "none"} color={isStarred ? STARRED : theme.subText} />
  );

  // Every move destination does the same thing with a different folder.
  const moveTo = async (path) => {
    onClose();
    const ok = await confirm({
      title: "Move file",
      message: `Move "${file.filename}" to ${path}?`,
      confirmLabel: "Move",
    });
    if (!ok) return;
    await handleMove(file.cid, joinPath(path, file.filename));
  };

  // Trashed files get a minimal menu: restore or delete forever
  if (inTrash) {
    return (
      <MenuPanel ref={menuRef} x={x} y={y} width={180}>
        <MenuRow
          Icon={RotateCcw} label="Restore"
          onClick={() => { onClose(); handleRestore(file); }}
        />
        {(permissions & DOWNLOAD) !== 0 && (
          <MenuRow Icon={Download} label="Download" onClick={() => { downloadFile(file); onClose(); }} />
        )}
        <MenuRow Icon={Info} label="File details" onClick={() => { onClose(); openDetails(file); }} />
        <MenuDivider />
        <MenuRow
          Icon={Trash2} label="Delete forever" color={DANGER}
          onClick={async () => { onClose(); await handleDelete(file.cid); }}
        />
      </MenuPanel>
    );
  }

  return (
    <MenuPanel ref={menuRef} x={x} y={y} width={180}>

      {/* DOWNLOAD */}
      {(permissions & DOWNLOAD) !== 0 && (
        <MenuRow Icon={Download} label="Download" onClick={() => { downloadFile(file); onClose(); }} />
      )}

      {/* FILE DETAILS */}
      <MenuRow Icon={Info} label="File details" onClick={() => { onClose(); openDetails(file); }} />

      {/* STAR — non-owners keep it top-level (no Organize menu without move rights) */}
      {!is_owner && (
        <MenuRow
          icon={starIcon}
          label={isStarred ? "Remove from starred" : "Add to starred"}
          right={<Shortcut text={SHORTCUTS.star} />}
          onClick={() => { toggleStar(file.cid); onClose(); }}
        />
      )}

      {/* RENAME — owner only; a move within the same folder */}
      {is_owner && (
        <MenuRow
          Icon={Pencil} label="Rename" right={<Shortcut text={SHORTCUTS.rename} />}
          onClick={() => { onClose(); promptRenameFile(file); }}
        />
      )}

      <MenuDivider />

      {/* SHARE — owner only; opens the share modal (add + revoke access) */}
      {is_owner && (
        <MenuRow
          Icon={Share2} label="Share" color={SHARE}
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
          <MenuRow
            Icon={FolderInput} label="Organize"
            right={<ChevronRight size={14} color={theme.subText} />}
          />

          {showOrganize && (
            // Flies out from the parent row rather than the viewport, so it
            // overrides the panel's fixed positioning.
            <MenuPanel
              width={200}
              style={{ position: "absolute", top: 0, left: "100%", maxHeight: "260px", overflowY: "auto", zIndex: 10000 }}
            >
              <MenuRow
                icon={starIcon}
                label={isStarred ? "Remove from starred" : "Add to starred"}
                right={<Shortcut text={SHORTCUTS.star} />}
                onClick={() => { toggleStar(file.cid); onClose(); }}
              />
              <MenuDivider />
              <MenuLabel>Move to</MenuLabel>

              {currentPath !== "/" && (
                <MenuRow
                  Icon={Folder} iconSize={14} label="/"
                  onClick={() => moveTo("/")}
                />
              )}

              {folders.length === 0 && currentPath === "/" && (
                <MenuLabel>No other folders</MenuLabel>
              )}

              {folders.map(({ label, path }) => (
                <MenuRow
                  key={path} Icon={Folder} iconSize={14} label={label}
                  onClick={() => moveTo(path)}
                />
              ))}
            </MenuPanel>
          )}
        </div>
      )}

      <MenuDivider />

      {/* MOVE TO TRASH — owner only; the wallet signature acts as the confirm */}
      {is_owner && (
        <MenuRow
          Icon={Trash2} label="Move to trash" color={DANGER} right={<Shortcut text={SHORTCUTS.trash} />}
          onClick={async () => { onClose(); await handleTrash(file); }}
        />
      )}
    </MenuPanel>
  );
}