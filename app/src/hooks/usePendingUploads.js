import { useCallback, useState } from "react";

// Uploads whose bytes are sealed and pinned on IPFS and whose transaction is
// signed and broadcast, but not yet mined. The upload flow hands control back
// at the signature instead of blocking on the receipt (see useUploadActions),
// so without these the file would be missing from the drive for a block time
// and then appear out of nowhere.
//
// They are kept apart from the fetched list rather than spliced into it: every
// refresh replaces that list wholesale, so an inserted row would be wiped by
// any concurrent action. Merging by CID here also makes the rows self-cleaning
// — a pending row drops out the moment the chain reports the file, with no
// bookkeeping tying the two together.
export function usePendingUploads() {
  const [pendingUploads, setPendingUploads] = useState([]);

  const addPendingUploads = useCallback((rows) => {
    setPendingUploads((prev) => [...prev, ...rows]);
  }, []);

  const dropPendingUploads = useCallback((cids) => {
    const drop = new Set(cids);
    setPendingUploads((prev) => prev.filter((r) => !drop.has(r.cid)));
  }, []);

  const clearPendingUploads = useCallback(() => setPendingUploads([]), []);

  return { pendingUploads, addPendingUploads, dropPendingUploads, clearPendingUploads };
}

// Fetched list first, then pending rows for files the chain hasn't reported
// yet. A confirmed upload is in both for one render at most.
export function mergePendingUploads(chainFiles, pendingUploads) {
  if (pendingUploads.length === 0) return chainFiles;
  const known = new Set(chainFiles.map((f) => f.cid));
  return [...chainFiles, ...pendingUploads.filter((p) => !known.has(p.cid))];
}

// A row shaped like the listing endpoint's, for a file that is not on-chain
// yet. `timestamp` is the local clock rather than 0 so the row sorts where the
// mined one will; size is the plaintext length, a few bytes under the
// ciphertext size the listing reports. Everything else the chain owns is empty,
// and `pending` marks the row so the views can render it inert.
export function pendingUploadRow({ cid, filename, fullPath, fileFormat, size, owner }) {
  const levels = String(fullPath || "").split("/").filter(Boolean);
  return {
    cid,
    filename,
    folder_path: levels.length > 1 ? "/" + levels.slice(0, -1).join("/") : "/",
    file_format: fileFormat || "",
    timestamp: Math.floor(Date.now() / 1000),
    owner,
    is_owner: true,
    permissions: 0,
    shared_with: [],
    size: size || 0,
    ipfs_url: "",
    pending: true,
  };
}
