import React, { useEffect, useState } from "react";
import { X, Copy, ExternalLink, Star } from "lucide-react";
import { fileVisual, formatBytes, Thumbnail, hasThumbnailFor } from "./AppLayout";

const short = (addr = "") => (addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "—");

// Right-side file details card, Drive style. Shows metadata for one file;
// sharing list comes from the existing /shared-users endpoint.
export default function DetailsPanel({ file, account, API_BASE_URL, onClose, theme, toast, isStarred }) {
  const [sharedUsers, setSharedUsers] = useState(null); // null = loading

  useEffect(() => {
    setSharedUsers(null);
    if (!file || !file.is_owner) return;
    let cancelled = false;
    fetch(
      `${API_BASE_URL}/shared-users?cid=${encodeURIComponent(file.cid)}&user_address=${encodeURIComponent(account)}`,
      { headers: { "ngrok-skip-browser-warning": "true" } }
    )
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setSharedUsers(d.shared_with || []); })
      .catch(() => { if (!cancelled) setSharedUsers([]); });
    return () => { cancelled = true; };
  }, [file, account, API_BASE_URL]);

  const row = (label, value) => (
    <div style={{ marginBottom: "14px" }}>
      <div style={{ fontSize: "12px", color: theme.subText, marginBottom: "2px" }}>{label}</div>
      <div style={{ fontSize: "13px", wordBreak: "break-word" }}>{value}</div>
    </div>
  );

  const copyCid = () => {
    navigator.clipboard.writeText(file.cid)
      .then(() => toast.success("CID copied"))
      .catch(() => toast.error("Could not copy"));
  };

  const { Icon, color } = file ? fileVisual(file.filename) : { Icon: null, color: null };
  const ext = file?.filename?.includes(".") ? file.filename.split(".").pop().toUpperCase() : "FILE";
  const inTrash = (file?.folder_path || "").startsWith("/.trash");
  const location = !file ? "" : inTrash ? "Trash" : (file.folder_path === "/" || !file.folder_path) ? "My Drive" : file.folder_path;

  return (
    <aside style={{
      width: "320px", flexShrink: 0, margin: "12px 16px 16px 0", backgroundColor: theme.card,
      borderRadius: "16px", padding: "16px 20px", overflowY: "auto",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          {file && <Icon size={18} color={color} style={{ flexShrink: 0 }} />}
          <span style={{ fontSize: "15px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {file ? file.filename : "Details"}
          </span>
          {file && isStarred && <Star size={14} fill="#F29900" color="#F29900" style={{ flexShrink: 0 }} />}
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none", border: "none", cursor: "pointer", color: theme.subText,
            width: "32px", height: "32px", borderRadius: "50%", display: "flex",
            alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <X size={17} />
        </button>
      </div>

      {!file ? (
        <div style={{ color: theme.subText, fontSize: "13px", textAlign: "center", padding: "40px 0" }}>
          Select a file to see its details.
        </div>
      ) : (
        <>
          <div style={{
            height: "160px", borderRadius: "12px", backgroundColor: theme.tile, marginBottom: "18px",
            display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
          }}>
            {hasThumbnailFor(file.filename) ? (
              <Thumbnail
                cid={file.cid}
                filename={file.filename}
                API_BASE_URL={API_BASE_URL}
                fallback={<Icon size={56} color={color} strokeWidth={1.2} />}
              />
            ) : (
              <Icon size={56} color={color} strokeWidth={1.2} />
            )}
          </div>

          {row("Type", ext)}
          {row("Size", file.size ? formatBytes(file.size) : "—")}
          {row("Uploaded", file.timestamp
            ? new Date(file.timestamp * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
            : "—")}
          {row("Owner", file.is_owner ? "You" : short(file.owner))}
          {row("Location", location)}
          {row("Content ID", (
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontFamily: "monospace", fontSize: "12px" }}>{short(file.cid)}</span>
              <button onClick={copyCid} title="Copy CID" style={{ background: "none", border: "none", cursor: "pointer", color: theme.subText, display: "flex", padding: "2px" }}>
                <Copy size={13} />
              </button>
              {file.ipfs_url && (
                <a href={file.ipfs_url} target="_blank" rel="noreferrer" title="Open on IPFS gateway" style={{ color: theme.subText, display: "flex" }}>
                  <ExternalLink size={13} />
                </a>
              )}
            </span>
          ))}

          <div style={{ fontSize: "12px", color: theme.subText, margin: "6px 0 8px" }}>Who has access</div>
          {!file.is_owner ? (
            <div style={{ fontSize: "13px" }}>Shared with you by {short(file.owner)}</div>
          ) : sharedUsers === null ? (
            <div style={{ fontSize: "13px", color: theme.subText }}>Loading…</div>
          ) : sharedUsers.length === 0 ? (
            <div style={{ fontSize: "13px", color: theme.subText }}>Only you</div>
          ) : (
            sharedUsers.map((addr) => (
              <div key={addr} style={{ fontSize: "13px", fontFamily: "monospace", marginBottom: "4px" }}>{short(addr)}</div>
            ))
          )}
        </>
      )}
    </aside>
  );
}
