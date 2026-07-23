import { Image as ImageIcon, Video, Music, Archive, FileCode, FileText, File as FileIcon } from "lucide-react";

// Pick an icon + accent color from the file extension, similar to how
// Drive colors PDFs red, sheets green, etc.
export function fileVisual(filename = "") {
  const ext = filename.split(".").pop().toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext))
    return { Icon: ImageIcon, color: "#188038" };
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext))
    return { Icon: Video, color: "#d93025" };
  if (["mp3", "wav", "ogg", "flac", "m4a"].includes(ext))
    return { Icon: Music, color: "#f29900" };
  if (["zip", "tar", "gz", "rar", "7z"].includes(ext))
    return { Icon: Archive, color: "#5f6368" };
  if (["js", "jsx", "ts", "tsx", "py", "sol", "go", "rs", "c", "cpp", "java", "json", "html", "css", "sh"].includes(ext))
    return { Icon: FileCode, color: "#1a73e8" };
  if (["pdf"].includes(ext))
    return { Icon: FileText, color: "#d93025" };
  if (["doc", "docx", "txt", "md", "rtf"].includes(ext))
    return { Icon: FileText, color: "#1a73e8" };
  if (["xls", "xlsx", "csv", "tsv"].includes(ext))
    return { Icon: FileText, color: "#188038" };
  return { Icon: FileIcon, color: "#5f6368" };
}

// Files the backend can render a thumbnail for: images + pdf directly, and
// text-like files as a rendered page snippet.
const THUMBNAIL_EXTENSIONS = [
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "pdf",
  "txt", "md", "csv", "tsv", "json", "js", "jsx", "ts", "tsx", "py", "html", "css",
  "xml", "yaml", "yml", "toml", "ini", "log", "sh", "c", "cpp", "h", "java",
  "go", "rs", "rb", "sql", "env", "cfg", "conf",
];

export const hasThumbnailFor = (filename = "") =>
  THUMBNAIL_EXTENSIONS.includes(filename.split(".").pop().toLowerCase());

export function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}
