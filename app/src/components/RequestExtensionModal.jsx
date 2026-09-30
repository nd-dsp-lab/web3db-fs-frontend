import React, { useEffect, useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import { makeTheme } from "../lib/theme";

// Shown when the recipient of an expired share opens the greyed-out file.
// There is nothing to preview -- the thumbnail and download endpoints both
// 403 once access lapses -- so opening it offers the way back instead.
//
// Duration is in raw blocks, matching the share dialog: the contract counts
// in blocks, and a days/weeks control was tried and backed out in part one
// rather than imply a precision the chain does not have.
export default function RequestExtensionModal({
  file, darkMode, onClose, onRequest, onCancelRequest,
}) {
  const [durationBlocksInput, setDurationBlocksInput] = useState("");
  const [busy, setBusy] = useState(false);
  const t = makeTheme(darkMode);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const parsed = parseInt(durationBlocksInput, 10);
  const durationBlocks = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  const pending = file.request_status === "pending";
  // Both a waiting and a declined request are "ask again" — only a file that
  // has never been asked about gets the first-time wording.
  const asked = pending || file.request_status === "denied";

  const submit = async () => {
    if (!durationBlocks || busy) return;
    setBusy(true);
    try {
      await onRequest(file.cid, durationBlocks);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    setBusy(true);
    try {
      await onCancelRequest(file.cid);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const note =
    pending ? "You've already asked for more time on this file. The owner hasn't answered yet."
    : file.request_status === "denied" ? "Your last request was declined. You can ask again."
    : "Your access to this file has expired. Ask the owner to extend it.";

  return (
    <div
      onClick={() => { if (!busy) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 20000, backgroundColor: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(440px, 90vw)", backgroundColor: t.card, color: t.text,
          borderRadius: "16px", padding: "24px", boxShadow: "0 8px 28px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
          <Clock size={18} color={t.subText} />
          <span style={{ fontSize: "17px", fontWeight: 500 }}>Request more time</span>
        </div>

        <div style={{
          fontSize: "13px", color: t.subText, marginBottom: "18px",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }} title={file.filename}>
          {file.filename}
        </div>

        <div style={{ fontSize: "13px", marginBottom: "18px" }}>{note}</div>

        {file.expires_at_block != null && (
          <div style={{ fontSize: "12px", color: t.subText, marginBottom: "18px" }}>
            Expired at block {file.expires_at_block.toLocaleString()}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "22px" }}>
          <label style={{ fontSize: "13px", color: t.subText }}>Ask for (blocks):</label>
          <input
            type="number"
            min="1"
            step="1"
            autoFocus
            placeholder="e.g. 1000"
            value={durationBlocksInput}
            disabled={busy}
            onChange={(e) => setDurationBlocksInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            style={{
              width: "140px", padding: "8px 10px", borderRadius: "8px", fontSize: "13px",
              border: `1px solid ${t.border}`, backgroundColor: t.inputBg, color: t.text, outline: "none",
            }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          {pending && (
            <button
              onClick={withdraw}
              disabled={busy}
              style={{
                marginRight: "auto", background: "none", border: "none", cursor: busy ? "default" : "pointer",
                color: "#d9534f", fontSize: "14px", padding: "8px 4px",
              }}
            >
              Withdraw request
            </button>
          )}
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              background: "none", border: "none", cursor: busy ? "default" : "pointer",
              color: t.subText, fontSize: "14px", padding: "8px 14px", borderRadius: "8px",
            }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!durationBlocks || busy}
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "8px 18px", borderRadius: "8px", border: "none",
              cursor: durationBlocks && !busy ? "pointer" : "default",
              backgroundColor: durationBlocks && !busy ? "#1A73E8" : t.tile,
              color: durationBlocks && !busy ? "#fff" : t.subText, fontSize: "14px", fontWeight: 500,
            }}
          >
            {busy && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />}
            {asked ? "Ask again" : "Send request"}
          </button>
        </div>
      </div>
    </div>
  );
}
