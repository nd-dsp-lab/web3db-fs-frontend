import React, { useEffect, useState } from "react";
import { X, Copy, ExternalLink, Star, Folder, Layers } from "lucide-react";
import { fileVisual, formatBytes } from "../lib/fileTypes";
import { Thumbnail, hasThumbnailFor } from "./Thumbnail";

const short = (addr = "") => (addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "—");

// Right-side details card, Drive style. Shows metadata for one file, or
// aggregate stats for a folder (file may be { type: "folder", name, path,
// shared }). Sharing lists come from /shared-users and /shared-users-batch.
export default function DetailsPanel({ file, account, authToken, api, onClose, theme, toast, isStarred, folderStatsOf }) {
  const [sharedUsers, setSharedUsers] = useState(null); // null = loading

  const isFolder = file?.type === "folder";
  const isMulti = file?.type === "multi"; // selection summary — no single subject
  const stats = isFolder && folderStatsOf ? folderStatsOf(file.path) : null;

  useEffect(() => {
    setSharedUsers(null);
    if (!file || file.type === "multi") return;
    let cancelled = false;
    const done = (list) => { if (!cancelled) setSharedUsers(list); };
    const fail = () => { if (!cancelled) setSharedUsers([]); };
    let target;
    if (isFolder) {
      if (file.shared) return; // recipient view — no shared-with list to show
      const cids = folderStatsOf ? folderStatsOf(file.path).cids : [];
      if (!cids.length) { setSharedUsers([]); return; }
      target = { cids, account };
    } else {
      if (!file.is_owner) return;
      target = { cid: file.cid };
    }
    api.sharedUsers(target, authToken).then(done).catch(fail);
    return () => { cancelled = true; };
  }, [file, account, authToken, api]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const { Icon, color } = !file
    ? { Icon: null, color: null }
    : isMulti
    ? { Icon: Layers, color: "#5F6368" }
    : isFolder
    ? { Icon: Folder, color: "#5F6368" }
    : fileVisual(file.filename);
  const ext = file?.filename?.includes(".") ? file.filename.split(".").pop().toUpperCase() : "FILE";
  const inTrash = (file?.folder_path || "").startsWith("/.trash");
  const folderParent = isFolder ? file.path.slice(0, file.path.lastIndexOf("/")) || "/" : null;
  const location = !file ? ""
    : isFolder ? (file.shared ? "Shared with me" : folderParent === "/" ? "My Drive" : folderParent)
    : inTrash ? "Trash"
    : (file.folder_path === "/" || !file.folder_path) ? "My Drive" : file.folder_path;
  const fmtDate = (ts) => ts
    ? new Date(ts * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "—";

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
            {file ? (isMulti ? `${file.items} items selected` : isFolder ? file.name : file.filename) : "Details"}
          </span>
          {file && isStarred && <Star size={14} fill="#F29900" color="#F29900" style={{ flexShrink: 0 }} />}
        </div>
        <button
          onClick={onClose}
          aria-label="Close details"
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
      ) : isMulti ? (
        <>
          <div style={{
            height: "160px", borderRadius: "12px", backgroundColor: theme.tile, marginBottom: "18px",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Layers size={56} color="#5F6368" strokeWidth={1.2} />
          </div>

          {row("Selected", `${file.items} item(s)`)}
          {row("Contents", `${file.files} file(s)` + (file.folders ? ` across ${file.folders} folder(s)` : ""))}
          {row("Total size", file.size ? formatBytes(file.size) : "—")}
        </>
      ) : isFolder ? (
        <>
          <div style={{
            height: "160px", borderRadius: "12px", backgroundColor: theme.tile, marginBottom: "18px",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Folder size={56} color="#5F6368" strokeWidth={1.2} />
          </div>

          {row("Type", "Folder")}
          {row("Contents", `${stats.fileCount} file(s)` + (stats.folderCount ? `, ${stats.folderCount} folder(s)` : ""))}
          {row("Size", stats.size ? formatBytes(stats.size) : "—")}
          {row("Created", fmtDate(stats.earliest))}
          {row("Modified", fmtDate(stats.latest))}
          {row("Owner", file.shared ? short(stats.owner) : "You")}
          {row("Location", location)}

          <div style={{ fontSize: "12px", color: theme.subText, margin: "6px 0 8px" }}>Who has access</div>
          {file.shared ? (
            <div style={{ fontSize: "13px" }}>Shared with you by {short(stats.owner)}</div>
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
                api={api}
                authToken={authToken}
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
