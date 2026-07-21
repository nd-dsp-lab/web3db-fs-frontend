import { TRASH_PREFIX } from "./constants";

// Trash is a hidden path prefix: "deleting" a file moves it under /.trash
// (one on-chain move tx), restoring moves it back. No contract changes.
export const isTrashed = (f) => (f.folder_path || "/").startsWith(TRASH_PREFIX);

// A file's full path from its folder + name (folder_path may be "/" or empty).
export const fullPathOf = (f) =>
  (f.folder_path === "/" || !f.folder_path) ? `/${f.filename}` : `${f.folder_path}/${f.filename}`;
