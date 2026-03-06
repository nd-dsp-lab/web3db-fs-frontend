import React, { useEffect, useRef, useState } from "react";

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
  onShare,
  onUnshare,
  onDelete,
  onMove,
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

  // Derive shared list (mirrors AppLayout logic)
  let sharedList = file.shared_with || [];
  if (sharedList.length > 0 && typeof sharedList[0] === "object") {
    sharedList = sharedList.map(s => s.address || s.to || s.owner || JSON.stringify(s));
  }
  const hasShared = sharedList.length > 0;

  const { DOWNLOAD, permissions, is_owner } = file;

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
      <span style={{ width: "16px", textAlign: "center" }}>{icon}</span>
      {label}
    </div>
  );

  return (
    <div ref={menuRef} style={menuStyle}>

      {/* DOWNLOAD */}
      {(permissions & 4) !== 0 && (
        <Item icon="↓" label="Download" onClick={() => { onDownload(file); onClose(); }} />
      )}

      <div style={dividerStyle} />

      {/* SHARE — owner only */}
      {is_owner && (
        <Item
          icon="⤷" label="Share" color="#00a86b"
          onClick={async () => {
            onClose();
            const to = window.prompt("Enter recipient Ethereum address (0x...)");
            if (!to) return;
            await onShare(file.cid, to);
          }}
        />
      )}

      {/* UNSHARE — owner + has shared users */}
      {is_owner && hasShared && (
        <Item
          icon="✕" label="Unshare" color="#ff9800"
          onClick={async () => {
            onClose();
            let addr = null;
            if (sharedList.length === 1) {
              const ok = window.confirm(`Unshare "${file.filename}" with ${sharedList[0]}?`);
              if (!ok) return;
              addr = sharedList[0];
            } else {
              addr = window.prompt(
                `Shared with: ${sharedList.join(", ")}\n\nEnter address to unshare:`
              );
              if (!addr) return;
              addr = addr.trim();
            }
            await onUnshare(file.cid, addr);
          }}
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
              <span style={{ width: "16px", textAlign: "center" }}>▷</span>
              Move to
            </span>
            <span style={{ color: "#999", fontSize: "0.8em" }}>▶</span>
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
                  <span style={{ width: "16px" }}>▸</span> /
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
                  <span style={{ width: "16px" }}>▸</span> {label}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={dividerStyle} />

      {/* DELETE — owner only */}
      {is_owner && (
        <Item
          icon="⊗" label="Delete" color="#d9534f"
          onClick={async () => {
            onClose();
            const ok = window.confirm(`Delete "${file.filename}" (CID: ${file.cid})?`);
            if (!ok) return;
            await onDelete(file.cid);
          }}
        />
      )}
    </div>
  );
}