import React, { useEffect, useRef, useState } from "react";

// Drive-style name dialog, used for both Rename and New folder. For a file
// rename the base name is pre-selected so typing replaces it without
// clobbering the extension; for New folder initialName is "" (empty input).
export default function NameModal({
  initialName = "",
  isFolder,
  darkMode,
  siblings = [],
  title = "Rename",
  submitLabel = "OK",
  onClose,
  onSubmit,
}) {
  const [name, setName] = useState(initialName);
  const inputRef = useRef(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const dot = isFolder ? -1 : initialName.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : initialName.length);
  }, [initialName, isFolder]);

  const trimmed = name.trim();
  const error =
    trimmed.includes("/") ? "Name can't contain /" :
    trimmed && trimmed !== initialName && siblings.includes(trimmed) ? "An item with this name already exists here" :
    null;
  const canSubmit = Boolean(trimmed) && !error && trimmed !== initialName;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed);
    onClose();
  };

  const theme = darkMode
    ? { card: "#1E1F20", text: "#E3E3E3", subText: "#9AA0A6", border: "#3C4043", inputBg: "#131314" }
    : { card: "#FFFFFF", text: "#1F1F1F", subText: "#5F6368", border: "#DADCE0", inputBg: "#FFFFFF" };

  return (
    <div
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
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
        <div style={{ fontSize: "20px", marginBottom: "18px" }}>{title}</div>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          style={{
            width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: "14px",
            borderRadius: "6px", border: `2px solid ${error ? "#d93025" : "#1A73E8"}`,
            backgroundColor: theme.inputBg, color: theme.text, outline: "none",
          }}
        />
        <div style={{ minHeight: "18px", fontSize: "12px", color: "#d93025", marginTop: "6px" }}>
          {error}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "10px" }}>
          <button
            onClick={onClose}
            style={{
              padding: "9px 18px", borderRadius: "999px", border: "none", cursor: "pointer",
              background: "transparent", color: "#1A73E8", fontSize: "14px", fontWeight: 500,
            }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            style={{
              padding: "9px 22px", borderRadius: "999px", border: "none",
              cursor: canSubmit ? "pointer" : "default",
              backgroundColor: canSubmit ? "#1A73E8" : (darkMode ? "#3C4043" : "#E8EAED"),
              color: canSubmit ? "#fff" : theme.subText, fontSize: "14px", fontWeight: 500,
            }}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
