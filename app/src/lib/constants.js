// Shared constants used across App.js and the layout/components.

// Trashed files live under this path prefix; the Trash view shows them and
// every other view filters them out.
export const TRASH_PREFIX = "/.trash";

// Fallback capacity for the sidebar usage bar until /storage-stats responds.
export const STORAGE_QUOTA = 1024 ** 3;

// Extension buckets for the search type-filter chips.
export const SEARCH_TYPE_EXTS = {
  pdf: ["pdf"],
  image: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"],
  doc: ["doc", "docx", "txt", "md", "rtf", "csv", "xls", "xlsx", "ppt", "pptx"],
  video: ["mp4", "mov", "avi", "mkv", "webm"],
  audio: ["mp3", "wav", "ogg", "flac", "m4a"],
  code: ["js", "jsx", "ts", "tsx", "py", "sol", "go", "rs", "c", "cpp", "h", "java", "json", "html", "css", "sh", "yml", "yaml"],
  archive: ["zip", "tar", "gz", "rar", "7z"],
};
