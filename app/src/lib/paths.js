import { TRASH_PREFIX } from "./constants";

// Trash is a hidden path prefix: "deleting" a file moves it under /.trash
// (one on-chain move tx), restoring moves it back. No contract changes.
export const isTrashed = (f) => (f.folder_path || "/").startsWith(TRASH_PREFIX);

// A file's full path from its folder + name (folder_path may be "/" or empty).
export const fullPathOf = (f) =>
  (f.folder_path === "/" || !f.folder_path) ? `/${f.filename}` : `${f.folder_path}/${f.filename}`;

// Paths are absolute and never end in "/", so the root is the one directory
// that must not contribute a separator: joining onto "/" naively yields "//a".
export const joinPath = (dir, name) => (dir === "/" || !dir ? `/${name}` : `${dir}/${name}`);

export const parentOf = (path) => path.slice(0, path.lastIndexOf("/")) || "/";
export const baseNameOf = (path) => path.slice(path.lastIndexOf("/") + 1);

// What every path directly inside a folder starts with — "/" at the root,
// "/docs/" below it. Views that group files into folders slice this prefix
// off to get the remainder, so they need the string, not just a predicate.
export const childPrefix = (dir) => joinPath(dir, "");

// Strictly inside: a folder does not contain itself. Compared against the
// separator so that "/docs2" is not treated as living under "/docs".
export const isUnder = (path, folder) => path.startsWith(childPrefix(folder));

// The subtree of a folder: the folder itself plus everything inside it. This
// is the unit that trashing, deleting and moving a folder all act on.
export const isAtOrUnder = (path, folder) => path === folder || isUnder(path, folder);

// Empty folders exist only in local state, as a set of paths, so relocating
// or removing one means rewriting that set. Both return a new Set.
export const pruneSubtrees = (paths, folders) =>
  new Set([...paths].filter((p) => !folders.some((f) => isAtOrUnder(p, f))));

// moves is [[from, to], ...]; the first match wins, matching the on-chain
// behaviour where a file is moved by exactly one of the selected folders.
export const remapSubtrees = (paths, moves) =>
  new Set([...paths].map((p) => {
    const move = moves.find(([from]) => isAtOrUnder(p, from));
    return move ? move[1] + p.slice(move[0].length) : p;
  }));
