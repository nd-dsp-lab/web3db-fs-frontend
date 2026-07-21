import { useState, useEffect } from "react";

// Folders only exist on-chain as file-path prefixes, so an empty folder has
// no on-chain record. Track them locally (per account) until a file lands.
export function useEmptyFolders(account) {
  const [emptyFolders, setEmptyFolders] = useState(new Set());

  useEffect(() => {
    if (!account) { setEmptyFolders(new Set()); return; }
    try {
      const saved = JSON.parse(localStorage.getItem(`emptyFolders:${account.toLowerCase()}`) || "[]");
      setEmptyFolders(new Set(saved));
    } catch {
      setEmptyFolders(new Set());
    }
  }, [account]);

  const persistEmptyFolders = (next) => {
    if (account) localStorage.setItem(`emptyFolders:${account.toLowerCase()}`, JSON.stringify([...next]));
    return next;
  };

  return { emptyFolders, setEmptyFolders, persistEmptyFolders };
}
