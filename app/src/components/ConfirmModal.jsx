import React, { useEffect, useRef } from "react";

// Drive-style confirmation dialog, the themed replacement for window.confirm.
// Rendered by App from useConfirmDialog state; danger=true styles the confirm
// button red for destructive actions (delete forever, remove access, etc.).
export default function ConfirmModal({
  message,
  title,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  danger = false,
  darkMode,
  onConfirm,
  onCancel,
}) {
  const confirmRef = useRef(null);

  useEffect(() => { confirmRef.current?.focus(); }, []);

  const theme = darkMode
    ? { card: "#1E1F20", text: "#E3E3E3", subText: "#9AA0A6" }
    : { card: "#FFFFFF", text: "#1F1F1F", subText: "#5F6368" };
  const accent = danger ? "#d93025" : "#1A73E8";

  return (
    <div
      onClick={onCancel}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
        if (e.key === "Enter") onConfirm();
      }}
      style={{
        position: "fixed", inset: 0, zIndex: 20000, backgroundColor: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(420px, 90vw)", backgroundColor: theme.card, color: theme.text,
          borderRadius: "16px", padding: "24px", boxShadow: "0 8px 28px rgba(0,0,0,0.3)",
        }}
      >
        {title && <div style={{ fontSize: "20px", marginBottom: "10px" }}>{title}</div>}
        <div style={{ fontSize: "14px", color: theme.text, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
          {message}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "22px" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "9px 18px", borderRadius: "999px", border: "none", cursor: "pointer",
              background: "transparent", color: "#1A73E8", fontSize: "14px", fontWeight: 500,
            }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            style={{
              padding: "9px 22px", borderRadius: "999px", border: "none", cursor: "pointer",
              backgroundColor: accent, color: "#fff", fontSize: "14px", fontWeight: 500,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
