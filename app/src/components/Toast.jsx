import React from "react";
import { CheckCircle2, XCircle, Info, Loader2, X } from "lucide-react";

const ICONS = {
  success: { Icon: CheckCircle2, color: "#188038" },
  error: { Icon: XCircle, color: "#d93025" },
  info: { Icon: Info, color: "#1a73e8" },
  loading: { Icon: Loader2, color: "#1a73e8" },
};

// Bottom-left toast stack, Drive style. Toasts come from the useToasts hook
// in App.js: { id, message, type, action?: { label, onClick } }
export default function ToastStack({ toasts, dismiss, darkMode }) {
  if (!toasts.length) return null;

  const bg = darkMode ? "#E3E3E3" : "#2D2E31";
  const fg = darkMode ? "#1F1F1F" : "#E8EAED";

  return (
    <div style={{
      position: "fixed", left: "24px", bottom: "24px", zIndex: 20000,
      display: "flex", flexDirection: "column", gap: "10px", maxWidth: "420px",
    }}>
      {toasts.map(({ id, message, type, action, progress }) => {
        const { Icon, color } = ICONS[type] || ICONS.info;
        return (
          <div key={id} style={{
            display: "flex", alignItems: "center", gap: "12px",
            backgroundColor: bg, color: fg, padding: progress != null ? "12px 16px 15px" : "12px 16px",
            borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            fontSize: "14px", position: "relative", overflow: "hidden",
          }}>
            <Icon
              size={18} color={color} style={{ flexShrink: 0 }}
              className={type === "loading" ? "toast-spin" : undefined}
            />
            <span style={{ flex: 1 }}>{message}</span>
            {action && (
              <button
                onClick={() => { dismiss(id); action.onClick(); }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: darkMode ? "#0B57D0" : "#8AB4F8", fontWeight: 600,
                  fontSize: "14px", padding: "4px 8px", flexShrink: 0,
                }}
              >
                {action.label}
              </button>
            )}
            {type !== "loading" && (
              <button
                onClick={() => dismiss(id)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: fg, opacity: 0.7, display: "flex", padding: "2px", flexShrink: 0,
                }}
              >
                <X size={16} />
              </button>
            )}
            {progress != null && (
              <div style={{
                position: "absolute", left: 0, right: 0, bottom: 0, height: "3px",
                backgroundColor: darkMode ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.2)",
              }}>
                <div style={{
                  width: `${progress}%`, height: "100%",
                  backgroundColor: darkMode ? "#0B57D0" : "#8AB4F8",
                  transition: "width 0.15s ease",
                }} />
              </div>
            )}
          </div>
        );
      })}
      <style>{`
        @keyframes toast-spin { to { transform: rotate(360deg); } }
        .toast-spin { animation: toast-spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
