import React, { useEffect, useState, useCallback } from "react";
import { X, Download, FileWarning, Loader2 } from "lucide-react";

const TEXT_EXTS = ["txt", "md", "csv", "tsv", "log", "json", "js", "jsx", "ts", "tsx", "py", "sol", "go", "rs", "c", "cpp", "h", "java", "html", "css", "sh", "yml", "yaml", "toml", "xml", "env", "ini", "conf"];
const TEXT_PREVIEW_LIMIT = 1024 * 1024; // 1 MB

// The backend serves downloads as application/octet-stream, which makes the
// browser download blob URLs instead of rendering them — re-type from extension.
const EXT_MIME = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp",
  pdf: "application/pdf",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac", m4a: "audio/mp4",
};

function typedBlob(blob, filename) {
  if (blob.type && blob.type !== "application/octet-stream") return blob;
  const ext = filename.split(".").pop().toLowerCase();
  const mime = EXT_MIME[ext];
  return mime ? new Blob([blob], { type: mime }) : blob;
}

// Exported for tests: the extension-to-renderer mapping is easy to get wrong
// silently — a missing entry shows "No preview available" with no error.
export function previewKind(filename = "", mime = "") {
  const ext = filename.split(".").pop().toLowerCase();
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext)) return "image";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("video/") || ["mp4", "mov", "webm", "mkv"].includes(ext)) return "video";
  if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "flac", "m4a"].includes(ext)) return "audio";
  if (mime.startsWith("text/") || TEXT_EXTS.includes(ext)) return "text";
  return "none";
}

export default function PreviewModal({ file, account, authToken, API_BASE_URL, onClose, onDownload, darkMode }) {
  const [state, setState] = useState({ status: "loading" }); // loading | ready | error
  const [objectUrl, setObjectUrl] = useState(null);
  const [textContent, setTextContent] = useState(null);
  const [kind, setKind] = useState("none");

  useEffect(() => {
    let cancelled = false;
    let url = null;
    (async () => {
      try {
        if (!authToken) { setState({ status: "error", message: "Verifying sign-in — reopen in a moment" }); return; }
        const res = await fetch(
          `${API_BASE_URL}/download/${file.cid}/${encodeURIComponent(file.filename)}`,
          { headers: { "ngrok-skip-browser-warning": "true", "x-auth-token": authToken } }
        );
        if (!res.ok) throw new Error(`Preview failed (${res.status})`);
        const blob = typedBlob(await res.blob(), file.filename);
        if (cancelled) return;
        const k = previewKind(file.filename, blob.type);
        setKind(k);
        if (k === "text") {
          if (blob.size > TEXT_PREVIEW_LIMIT) {
            setState({ status: "error", message: "File too large for text preview." });
            return;
          }
          setTextContent(await blob.text());
        } else if (k !== "none") {
          url = URL.createObjectURL(blob);
          setObjectUrl(url);
        }
        if (!cancelled) setState({ status: "ready" });
      } catch (err) {
        if (!cancelled) setState({ status: "error", message: err.message || "Preview failed" });
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, account, authToken, API_BASE_URL]);

  const handleKey = useCallback((e) => { if (e.key === "Escape") onClose(); }, [onClose]);
  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const headerBtn = {
    background: "rgba(255,255,255,0.1)", border: "none", cursor: "pointer",
    color: "#fff", width: "40px", height: "40px", borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
  };

  const body = () => {
    if (state.status === "loading") {
      return <Loader2 size={40} color="#fff" style={{ animation: "spin 1s linear infinite" }} />;
    }
    if (state.status === "error" || kind === "none") {
      return (
        <div style={{ textAlign: "center", color: "#fff" }}>
          <FileWarning size={48} strokeWidth={1.2} style={{ opacity: 0.7, marginBottom: "12px" }} />
          <div style={{ marginBottom: "6px" }}>{state.message || "No preview available"}</div>
          <button
            onClick={() => onDownload(file)}
            style={{ marginTop: "10px", padding: "10px 24px", borderRadius: "999px", border: "none", cursor: "pointer", backgroundColor: "#1A73E8", color: "#fff", fontSize: "14px" }}
          >
            Download
          </button>
        </div>
      );
    }
    switch (kind) {
      case "image":
        return <img src={objectUrl} alt={file.filename} style={{ maxWidth: "90vw", maxHeight: "82vh", objectFit: "contain", borderRadius: "4px" }} />;
      case "pdf":
        return <iframe src={objectUrl} title={file.filename} style={{ width: "85vw", height: "82vh", border: "none", borderRadius: "4px", backgroundColor: "#fff" }} />;
      case "video":
        return <video src={objectUrl} controls autoPlay style={{ maxWidth: "90vw", maxHeight: "82vh", borderRadius: "4px" }} />;
      case "audio":
        return <audio src={objectUrl} controls autoPlay style={{ width: "60vw" }} />;
      case "text":
        return (
          <pre style={{
            width: "80vw", maxHeight: "80vh", overflow: "auto", margin: 0,
            padding: "20px", borderRadius: "8px", fontSize: "13px", lineHeight: 1.5,
            backgroundColor: darkMode ? "#1E1F20" : "#fff", color: darkMode ? "#E3E3E3" : "#1F1F1F",
            whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>{textContent}</pre>
        );
      default:
        return null;
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 20000, backgroundColor: "rgba(0,0,0,0.85)",
        display: "flex", flexDirection: "column",
      }}
    >
      <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
      <header
        onClick={(e) => e.stopPropagation()}
        style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 20px", color: "#fff" }}
      >
        <button onClick={onClose} title="Close" style={headerBtn}><X size={20} /></button>
        <span style={{ flex: 1, fontSize: "15px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.filename}</span>
        {(file.permissions & 4) !== 0 && (
          <button onClick={() => onDownload(file)} title="Download" style={headerBtn}><Download size={19} /></button>
        )}
      </header>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", paddingBottom: "20px" }}
      >
        {body()}
      </div>
    </div>
  );
}
