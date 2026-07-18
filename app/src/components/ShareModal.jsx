import React, { useEffect, useState, useCallback } from "react";
import { X, UserPlus, Loader2, Trash2 } from "lucide-react";

export default function ShareModal({
  file, account, API_BASE_URL, onClose, onShare, onUnshare, darkMode,
}) {
  const [recipient, setRecipient] = useState("");
  const [sharedUsers, setSharedUsers] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [busy, setBusy] = useState(null); // "share" | address being revoked | null

  const t = darkMode ? {
    card: "#1E1F20", text: "#E3E3E3", subText: "#9AA0A6", border: "#3C4043",
    inputBg: "#282A2C", rowHover: "#2D2E31",
  } : {
    card: "#FFFFFF", text: "#1F1F1F", subText: "#5F6368", border: "#E0E3E7",
    inputBg: "#F0F4F9", rowHover: "#F5F8FC",
  };

  const fetchSharedUsers = useCallback(async () => {
    setLoadingList(true);
    try {
      // Folder mode: union of shared users across every file in the folder
      const res = file.folder
        ? await fetch(`${API_BASE_URL}/shared-users-batch`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
            body: JSON.stringify({ cids: file.cids, user_address: account }),
          })
        : await fetch(
            `${API_BASE_URL}/shared-users?cid=${encodeURIComponent(file.cid)}&user_address=${encodeURIComponent(account)}`,
            { headers: { "ngrok-skip-browser-warning": "true" } }
          );
      const data = await res.json();
      setSharedUsers(data.shared_with || []);
    } catch {
      setSharedUsers([]);
    } finally {
      setLoadingList(false);
    }
  }, [API_BASE_URL, file.cid, file.folder, file.cids, account]);

  useEffect(() => { fetchSharedUsers(); }, [fetchSharedUsers]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const doShare = async () => {
    const to = recipient.trim();
    if (!to) return;
    setBusy("share");
    try {
      await onShare(file.cid, to, file.filename);
      setRecipient("");
      await fetchSharedUsers();
    } finally {
      setBusy(null);
    }
  };

  const doRevoke = async (addr) => {
    if (!window.confirm(`Remove access for ${addr}?`)) return;
    setBusy(addr);
    try {
      await onUnshare(file.cid, addr);
      await fetchSharedUsers();
    } finally {
      setBusy(null);
    }
  };

  const short = (a) => `${a.slice(0, 6)}...${a.slice(-4)}`;

  return (
    <div
      onClick={() => { if (!busy) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 20000, backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "480px", maxWidth: "92vw", backgroundColor: t.card, color: t.text,
          borderRadius: "16px", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", padding: "24px",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
          <span style={{ fontSize: "18px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Share “{file.filename}”
          </span>
          <button
            onClick={() => { if (!busy) onClose(); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: t.subText, padding: "6px", display: "flex" }}
          >
            <X size={20} />
          </button>
        </div>

        {file.folder && (
          <div style={{ fontSize: "12px", color: t.subText, marginTop: "-12px", marginBottom: "16px" }}>
            {file.selection
              ? `Shares the ${file.cids.length} selected file(s), including files inside selected folders.`
              : `Shares the ${file.cids.length} file(s) currently in this folder — files added later aren’t shared automatically.`}
          </div>
        )}

        {/* Recipient input */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "22px" }}>
          <input
            type="text"
            placeholder="Email or Ethereum address (0x...)"
            value={recipient}
            disabled={!!busy}
            onChange={(e) => setRecipient(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") doShare(); }}
            style={{
              flex: 1, padding: "12px 16px", borderRadius: "10px", fontSize: "14px",
              border: `1px solid ${t.border}`, backgroundColor: t.inputBg, color: t.text, outline: "none",
            }}
          />
          <button
            onClick={doShare}
            disabled={!!busy || !recipient.trim()}
            style={{
              display: "flex", alignItems: "center", gap: "8px", padding: "0 20px",
              borderRadius: "10px", border: "none", fontSize: "14px", fontWeight: 500,
              backgroundColor: "#1A73E8", color: "#fff",
              cursor: busy || !recipient.trim() ? "not-allowed" : "pointer",
              opacity: busy || !recipient.trim() ? 0.6 : 1,
            }}
          >
            {busy === "share"
              ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
              : <UserPlus size={16} />}
            Share
          </button>
        </div>

        {/* People with access */}
        <div style={{ fontSize: "14px", fontWeight: 500, marginBottom: "10px" }}>People with access</div>
        <div style={{ maxHeight: "220px", overflowY: "auto" }}>
          {/* Owner row */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 4px" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "50%", backgroundColor: "#1A73E8",
              color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 600,
            }}>{account ? account.slice(2, 3).toUpperCase() : "?"}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "14px" }}>You</div>
              <div style={{ fontSize: "12px", color: t.subText, fontFamily: "monospace" }}>{account && short(account)}</div>
            </div>
            <span style={{ fontSize: "13px", color: t.subText }}>Owner</span>
          </div>

          {loadingList ? (
            <div style={{ padding: "14px 4px", color: t.subText, fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Loading…
            </div>
          ) : sharedUsers.length === 0 ? (
            <div style={{ padding: "14px 4px", color: t.subText, fontSize: "13px" }}>
              No one else has access yet.
            </div>
          ) : sharedUsers.map((addr) => (
            <div
              key={addr}
              style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 4px", borderRadius: "8px" }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = t.rowHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              <div style={{
                width: "32px", height: "32px", borderRadius: "50%", backgroundColor: "#5F6368",
                color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 600,
              }}>{addr.slice(2, 3).toUpperCase()}</div>
              <div style={{ flex: 1, fontSize: "13px", fontFamily: "monospace" }} title={addr}>{short(addr)}</div>
              <button
                onClick={() => doRevoke(addr)}
                disabled={!!busy}
                title="Remove access"
                style={{
                  background: "none", border: "none", cursor: busy ? "not-allowed" : "pointer",
                  color: "#d9534f", padding: "6px", display: "flex",
                }}
              >
                {busy === addr
                  ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
                  : <Trash2 size={15} />}
              </button>
            </div>
          ))}
        </div>

        {busy === "share" && (
          <div style={{ marginTop: "14px", fontSize: "13px", color: t.subText }}>
            Waiting for signature and on-chain confirmation…
          </div>
        )}
      </div>
    </div>
  );
}
