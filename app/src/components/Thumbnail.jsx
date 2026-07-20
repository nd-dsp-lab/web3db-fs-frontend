import { useState, useEffect } from "react";
import { hasThumbnailFor } from "../lib/fileTypes";

export { hasThumbnailFor };

// CID -> object URL (or "failed"); module-level so navigation and re-renders
// never refetch. Thumbnails are fetched with fetch() rather than <img src>
// because the ngrok tunnel needs the skip-warning header.
const thumbCache = new Map();

export function Thumbnail({ cid, filename, API_BASE_URL, fallback, authToken }) {
  const [src, setSrc] = useState(() => thumbCache.get(cid) || null);
  useEffect(() => {
    if (thumbCache.has(cid)) { setSrc(thumbCache.get(cid)); return; }
    if (!authToken) return; // wait for download auth before requesting
    let cancelled = false;
    fetch(`${API_BASE_URL}/thumbnail/${cid}`, { headers: { "ngrok-skip-browser-warning": "true", "x-auth-token": authToken } })
      .then((r) => (r.ok && r.headers.get("content-type")?.startsWith("image/") ? r.blob() : Promise.reject()))
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        thumbCache.set(cid, url);
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        thumbCache.set(cid, "failed");
        if (!cancelled) setSrc("failed");
      });
    return () => { cancelled = true; };
  }, [cid, API_BASE_URL, authToken]);

  if (!src || src === "failed") return fallback;
  // Photos crop from the center; document-style thumbs (text, PDF) are
  // top-anchored so short content isn't cropped away to a blank strip.
  const isPhoto = ["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(filename.split(".").pop().toLowerCase());
  return <img src={src} alt={filename} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: isPhoto ? "center" : "top", borderRadius: "8px" }} />;
}
