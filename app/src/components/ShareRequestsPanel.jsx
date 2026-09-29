import React, { useState } from "react";
import { Clock, Check, X } from "lucide-react";
import { useLayout } from "../contexts/LayoutContext";

const short = (a = "") => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "—");

// Pending access requests, shown above the file list in the Shared with
// others view. Renders nothing at all when there is nothing to answer, so the
// view reads as an ordinary file list until someone actually asks.
export default function ShareRequestsPanel() {
  const {
    theme, requests, handleApproveRequest, handleDenyRequest,
  } = useLayout();
  // cid:requester -> the duration this owner intends to grant. Seeded from
  // what was asked for, but theirs to change: the requester names a wish, the
  // owner decides.
  const [durations, setDurations] = useState({});
  const [busy, setBusy] = useState(null);

  if (requests.length === 0) return null;   // also covers the first load

  const keyOf = (r) => `${r.cid}:${r.requester}`;
  const grantOf = (r) => {
    const parsed = parseInt(durations[keyOf(r)] ?? String(r.duration_blocks), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  const resolve = async (r, action) => {
    const k = keyOf(r);
    setBusy(k);
    try {
      if (action === "approve") {
        const grant = grantOf(r);
        if (!grant) return;   // the button is disabled, so this is belt and braces
        await handleApproveRequest(r.cid, r.requester, grant);
      } else {
        await handleDenyRequest(r.cid, r.requester);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ marginTop: "8px" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        fontSize: "13px", fontWeight: 500, color: theme.subText, margin: "10px 4px",
      }}>
        <Clock size={15} />
        Pending requests ({requests.length})
      </div>

      <div style={{ border: `1px solid ${theme.border}`, borderRadius: "12px", overflow: "hidden" }}>
        {requests.map((r, i) => {
          const k = keyOf(r);
          const isBusy = busy === k;
          // A blank or zero duration would silently do nothing on click;
          // disabling says so instead.
          const grant = grantOf(r);
          return (
            <div
              key={k}
              style={{
                display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
                padding: "12px 14px", fontSize: "13px",
                borderTop: i === 0 ? "none" : `1px solid ${theme.border}`,
              }}
            >
              <div style={{ flex: 1, minWidth: "180px" }}>
                <div style={{ fontWeight: 500 }}>{r.filename || r.cid}</div>
                <div style={{ color: theme.subText, fontSize: "12px", marginTop: "2px" }}>
                  <span style={{ fontFamily: "monospace" }} title={r.requester}>{short(r.requester)}</span>
                  {" asked for "}{r.duration_blocks?.toLocaleString()} blocks
                </div>
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: "6px", color: theme.subText, fontSize: "12px" }}>
                Grant
                <input
                  type="number"
                  min="1"
                  step="1"
                  aria-label={`Blocks to grant ${short(r.requester)}`}
                  value={durations[k] ?? String(r.duration_blocks ?? "")}
                  disabled={isBusy}
                  onChange={(e) => setDurations((d) => ({ ...d, [k]: e.target.value }))}
                  style={{
                    width: "100px", padding: "6px 8px", borderRadius: "8px", fontSize: "13px",
                    border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg,
                    color: theme.text, outline: "none",
                  }}
                />
                blocks
              </label>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => resolve(r, "approve")}
                  disabled={isBusy || !grant}
                  style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "7px 14px", borderRadius: "8px", border: "none",
                    cursor: isBusy || !grant ? "default" : "pointer",
                    backgroundColor: grant ? "#1A73E8" : theme.tile,
                    color: grant ? "#fff" : theme.subText, fontSize: "13px", fontWeight: 500,
                  }}
                >
                  <Check size={14} /> Approve
                </button>
                <button
                  onClick={() => resolve(r, "deny")}
                  disabled={isBusy}
                  style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "7px 14px", borderRadius: "8px",
                    border: `1px solid ${theme.border}`, background: "none",
                    cursor: isBusy ? "default" : "pointer",
                    color: "#d9534f", fontSize: "13px", fontWeight: 500,
                  }}
                >
                  <X size={14} /> Deny
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
