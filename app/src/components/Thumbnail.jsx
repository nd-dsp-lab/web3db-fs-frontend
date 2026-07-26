import { useState, useEffect } from "react";
import { hasThumbnailFor } from "../lib/fileTypes";

export { hasThumbnailFor };

// CID -> object URL (or "failed"); module-level so navigation and re-renders
// never refetch. Thumbnails are fetched with fetch() rather than <img src>
// because the endpoint is authenticated and <img> cannot send x-auth-token.
const thumbCache = new Map();

export function Thumbnail({ cid, filename, api, fallback, authToken }) {
  const [src, setSrc] = useState(() => thumbCache.get(cid) || null);
  useEffect(() => {
    if (thumbCache.has(cid)) { setSrc(thumbCache.get(cid)); return; }
    if (!authToken) return; // wait for download auth before requesting
    let cancelled = false;
    api.get(`/thumbnail/${cid}`, { "x-auth-token": authToken })
      .then((r) => {
        if (r.ok && r.headers.get("content-type")?.startsWith("image/")) return r.blob();
        // 401/403 mean the token was stale or not yet valid, which a re-auth
        // fixes; caching those would leave a whole grid of fallback icons for
        // the rest of the session. Anything else: this cid has no thumbnail.
        const permanent = r.status !== 401 && r.status !== 403;
        return Promise.reject(Object.assign(new Error("no thumbnail"), { permanent }));
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        thumbCache.set(cid, url);
        if (!cancelled) setSrc(url);
      })
      .catch((err) => {
        // A network error rejects without `permanent` — also treated transient
        if (err?.permanent) thumbCache.set(cid, "failed");
        if (!cancelled) setSrc("failed");
      });
    return () => { cancelled = true; };
  }, [cid, api, authToken]);

  if (!src || src === "failed") return fallback;
  // Photos crop from the center; document-style thumbs (text, PDF) are
  // top-anchored so short content isn't cropped away to a blank strip.
  const isPhoto = ["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(filename.split(".").pop().toLowerCase());
  return <img src={src} alt={filename} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: isPhoto ? "center" : "top", borderRadius: "8px" }} />;
}
