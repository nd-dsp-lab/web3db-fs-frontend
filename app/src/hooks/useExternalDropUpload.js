import { useState, useRef } from "react";

// Dropping files from the desktop onto the content area. Split out of
// AppLayout, which owned it only because that is where the drop target is.
//
// External drags carry "Files" in dataTransfer.types; internal tile drags
// (moving a file between folders) don't, so the two never conflict and both
// can share the same element.
const isExternalDrag = (e) => e.dataTransfer?.types?.includes("Files");

// readEntries hands back at most ~100 children per call and signals the end
// with an empty batch, so a single call silently truncates a large folder.
const readAllEntries = (reader) => new Promise((resolve, reject) => {
  const all = [];
  const step = () => reader.readEntries((batch) => {
    if (!batch.length) return resolve(all);
    all.push(...batch);
    step();
  }, reject);
  step();
});

// Walk a dropped FileSystemEntry into [{ file, rel }], where rel keeps the
// folder structure ("docs/sub/a.txt") for the backend to recreate.
async function collectEntry(entry, prefix, out) {
  if (entry.isFile) {
    const file = await new Promise((res, rej) => entry.file(res, rej));
    out.push({ file, rel: prefix + entry.name });
  } else if (entry.isDirectory) {
    const children = await readAllEntries(entry.createReader());
    for (const child of children) await collectEntry(child, `${prefix}${entry.name}/`, out);
  }
}

export function useExternalDropUpload({ view, searchQuery, toast, handleDropUpload }) {
  const [dragOver, setDragOver] = useState(false);
  // dragenter/dragleave fire for every nested element the pointer crosses, so
  // a plain boolean flickers off the moment the cursor enters a child. Count
  // the enters instead and only clear when the last one is matched.
  const dragDepth = useRef(0);

  // Uploads land in currentPath, which only My Drive has — and a search
  // result list isn't a folder you can drop into either.
  const canDrop = view === "my-drive" && !searchQuery;

  const onDragEnter = (e) => {
    if (!isExternalDrag(e)) return;
    e.preventDefault();
    dragDepth.current++;
    if (canDrop) setDragOver(true);
  };

  const onDragLeave = (e) => {
    if (!isExternalDrag(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  };

  const onDragOverContent = (e) => {
    if (isExternalDrag(e)) e.preventDefault(); // required to allow the drop
  };

  const onExternalDrop = async (e) => {
    if (!isExternalDrag(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    if (!canDrop) {
      toast.info("Switch to My Drive to upload by dropping files");
      return;
    }
    // Grab entries synchronously — dataTransfer.items dies with the event
    const entries = [...(e.dataTransfer.items || [])]
      .map((item) => item.webkitGetAsEntry?.())
      .filter(Boolean);

    if (!entries.length) {
      // Browser without the entry API: plain files only, no folder structure
      const files = [...(e.dataTransfer.files || [])].map((f) => ({ file: f, rel: f.name }));
      if (files.length) handleDropUpload(files);
      return;
    }

    const out = [];
    try {
      for (const entry of entries) await collectEntry(entry, "", out);
    } catch (err) {
      console.error("Reading dropped items failed:", err);
      toast.error("Could not read the dropped folder");
      return;
    }
    if (out.length) handleDropUpload(out);
    else toast.info("Dropped folder is empty");
  };

  return { dragOver, onDragEnter, onDragLeave, onDragOverContent, onExternalDrop };
}
