import React, { useState, useEffect, useCallback, useRef } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import AppLayout from "./components/AppLayout";
import ToastStack from "./components/Toast";
import { buildFileTree, getFolderContents, ensureSepolia, normalizeTxFields } from "./utils/helpers";

// Trash is a hidden path prefix: "deleting" a file moves it under /.trash
// (one on-chain move tx), restoring moves it back. No contract changes.
const TRASH_PREFIX = "/.trash";

// Extension buckets for the search type-filter chips
const SEARCH_TYPE_EXTS = {
  pdf: ["pdf"],
  image: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"],
  doc: ["doc", "docx", "txt", "md", "rtf", "csv", "xls", "xlsx", "ppt", "pptx"],
  video: ["mp4", "mov", "avi", "mkv", "webm"],
  audio: ["mp3", "wav", "ogg", "flac", "m4a"],
  code: ["js", "jsx", "ts", "tsx", "py", "sol", "go", "rs", "c", "cpp", "h", "java", "json", "html", "css", "sh", "yml", "yaml"],
  archive: ["zip", "tar", "gz", "rar", "7z"],
};
const isTrashed = (f) => (f.folder_path || "/").startsWith(TRASH_PREFIX);
const fullPathOf = (f) =>
  (f.folder_path === "/" || !f.folder_path) ? `/${f.filename}` : `${f.folder_path}/${f.filename}`;

function App() {
  // Replace with your actual backend URL
  const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "https://64e2c4b2e6e8.ngrok-free.app";

  // --- STATE MANAGEMENT ---
  const [files, setFiles] = useState([]);
  const [fileTree, setFileTree] = useState(null);
  const [currentPath, setCurrentPath] = useState("/");
  const [view, setView] = useState("my-drive");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState(null); // null | "folder" | key of SEARCH_TYPE_EXTS
  const [searchScope, setSearchScope] = useState("all"); // "all" | "folder" (current folder subtree)
  const [emptyFolders, setEmptyFolders] = useState(new Set());
  const [uploadMode, setUploadMode] = useState("single");
  const [starred, setStarred] = useState(new Set());

  // --- TOASTS ---
  const [toasts, setToasts] = useState([]);
  const toastSeq = useRef(0);
  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const pushToast = useCallback((message, type = "info", opts = {}) => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t, { id, message, type, action: opts.action, progress: opts.progress ?? null }]);
    if (type !== "loading") setTimeout(() => dismissToast(id), opts.duration || 5000);
    return id;
  }, [dismissToast]);
  const updateToast = useCallback((id, message, type, opts = {}) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, message, type, action: opts.action, progress: opts.progress ?? null } : x)));
    if (type !== "loading") setTimeout(() => dismissToast(id), opts.duration || 5000);
  }, [dismissToast]);
  const toast = {
    success: (m, o) => pushToast(m, "success", o),
    error: (m, o) => pushToast(m, "error", o),
    info: (m, o) => pushToast(m, "info", o),
    loading: (m, o) => pushToast(m, "loading", o),
    update: updateToast,
    dismiss: dismissToast,
  };

  // --- THEME ---
  // Follow the OS scheme until the user explicitly toggles, then persist.
  const [themePref, setThemePref] = useState(() => localStorage.getItem("themePref") || "system");
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const darkMode = themePref === "system" ? systemDark : themePref === "dark";
  const toggleTheme = () => {
    const next = darkMode ? "light" : "dark";
    setThemePref(next);
    localStorage.setItem("themePref", next);
  };

  // --- WALLET FUNCTIONALITY (Privy: email / Google / external wallet) ---
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  // Pick the wallet that matches the login method: social logins (email /
  // Google) use the Privy embedded wallet; wallet logins use the external one.
  // useWallets() can list a previously-connected MetaMask first, so never
  // just take wallets[0].
  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy") || null;
  const externalWallet = wallets.find((w) => w.walletClientType !== "privy") || null;
  const socialLogin = !!(user?.email || user?.google);
  const wallet = socialLogin ? (embeddedWallet || externalWallet) : (externalWallet || embeddedWallet);
  const account = ready && authenticated && wallet ? wallet.address : null;

  const connectWallet = () => login();

  // --- EMPTY FOLDERS (local per account) ---
  // Folders only exist on-chain as file-path prefixes, so an empty folder
  // has no on-chain record. Persist them locally until a file lands in them.
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

  // --- STARRED (local per account; CIDs are stable so localStorage is enough) ---
  useEffect(() => {
    if (!account) { setStarred(new Set()); return; }
    try {
      const saved = JSON.parse(localStorage.getItem(`starred:${account.toLowerCase()}`) || "[]");
      setStarred(new Set(saved));
    } catch {
      setStarred(new Set());
    }
  }, [account]);

  const toggleStar = (cid) => {
    if (!account) return;
    setStarred((prev) => {
      const next = new Set(prev);
      next.has(cid) ? next.delete(cid) : next.add(cid);
      localStorage.setItem(`starred:${account.toLowerCase()}`, JSON.stringify([...next]));
      return next;
    });
  };

  // --- STARRED FOLDERS (folders have no CID, so stars are keyed by path;
  // rename/trash/delete rewrite or remove them) ---
  const [starredFolders, setStarredFolders] = useState(new Set());
  useEffect(() => {
    if (!account) { setStarredFolders(new Set()); return; }
    try {
      const saved = JSON.parse(localStorage.getItem(`starredFolders:${account.toLowerCase()}`) || "[]");
      setStarredFolders(new Set(saved));
    } catch {
      setStarredFolders(new Set());
    }
  }, [account]);

  const persistStarredFolders = (next) => {
    if (account) localStorage.setItem(`starredFolders:${account.toLowerCase()}`, JSON.stringify([...next]));
    return next;
  };

  const toggleStarFolder = (folderPath) => {
    if (!account) return;
    setStarredFolders((prev) => {
      const next = new Set(prev);
      next.has(folderPath) ? next.delete(folderPath) : next.add(folderPath);
      return persistStarredFolders(next);
    });
  };

  // Drop stars for a folder (and its subfolders), or remap them on rename
  const remapStarredFolders = (folderPath, newPath = null) => {
    setStarredFolders((prev) => {
      const next = new Set();
      for (const p of prev) {
        if (p === folderPath || p.startsWith(folderPath + "/")) {
          if (newPath) next.add(newPath + p.slice(folderPath.length));
        } else {
          next.add(p);
        }
      }
      return persistStarredFolders(next);
    });
  };

  const disconnectWallet = async () => {
    await logout();
    setFiles([]);
    setFileTree(null);
    setCurrentPath("/");
    setSearchQuery("");
  };

  const getProvider = useCallback(async () => {
    if (!wallet) throw new Error("No wallet connected");
    return wallet.getEthereumProvider();
  }, [wallet]);

  // --- DOWNLOAD AUTH TOKEN ---
  // Downloads and thumbnails are permission-checked server-side. The wallet
  // signs a login message once (per 24h); the backend returns an HMAC token
  // tied to the address, cached in localStorage.
  const [authToken, setAuthToken] = useState(null);
  const authRequested = useRef(new Set());
  useEffect(() => {
    if (!account || !wallet) { setAuthToken(null); return; }
    const key = `authToken:${account.toLowerCase()}`;
    try {
      const cached = JSON.parse(localStorage.getItem(key));
      if (cached?.token && cached.expires * 1000 > Date.now() + 60000) {
        setAuthToken(cached.token);
        return;
      }
    } catch { /* fall through to re-sign */ }
    if (authRequested.current.has(account)) return; // one prompt per address per session
    authRequested.current.add(account);
    (async () => {
      try {
        const timestamp = Math.floor(Date.now() / 1000);
        const message = `Web3FS sign-in\nAddress: ${account.toLowerCase()}\nTimestamp: ${timestamp}`;
        const provider = await getProvider();
        const hexMessage = "0x" + Array.from(new TextEncoder().encode(message))
          .map((b) => b.toString(16).padStart(2, "0")).join("");
        const signature = await provider.request({
          method: "personal_sign",
          params: [hexMessage, account],
        });
        const res = await fetch(`${API_BASE_URL}/auth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
          body: JSON.stringify({ address: account, timestamp, signature }),
        });
        const data = await res.json();
        if (!res.ok || !data.token) throw new Error(data.error || "Token request failed");
        localStorage.setItem(key, JSON.stringify(data));
        setAuthToken(data.token);
      } catch (err) {
        console.error("Download auth failed:", err);
        toast.error("Sign-in verification failed — downloads and previews disabled");
      }
    })();
  }, [account, wallet, API_BASE_URL, getProvider]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- GAS DRIP for fresh embedded wallets ---
  const fundRequested = useRef(new Set());
  useEffect(() => {
    if (!account || wallet?.walletClientType !== "privy") return;
    if (fundRequested.current.has(account)) return; // once per address per session
    fundRequested.current.add(account);
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/fund-wallet`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
          },
          body: JSON.stringify({ address: account }),
        });
        const data = await res.json();
        if (data.funded) {
          console.log(`Wallet funded with ${data.amount_eth} SepETH:`, data.tx_hash);
        } else {
          console.log("Fund-wallet skipped:", data.reason || data.error);
        }
      } catch (err) {
        console.error("Fund-wallet request failed:", err);
      }
    })();
  }, [account, wallet, API_BASE_URL]);

  // --- DATA FETCHING ---
  const retrieveFiles = useCallback(async () => {
    if (!account) return;
    try {
      const response = await fetch(`${API_BASE_URL}/?user_address=${account}`, {
        headers: { "ngrok-skip-browser-warning": "true" }
      });
      const data = await response.json();
      const filesList = data.user_files || [];

      setFiles(filesList);
      // The tree only holds files the user owns; files shared to them are
      // shown flat in the Shared view (their folder_path is the owner's).
      // Trashed files live under /.trash and are excluded from the tree.
      setFileTree(buildFileTree(filesList.filter((f) => f.is_owner && !isTrashed(f)), emptyFolders));
    } catch (err) {
      console.error("Error retrieving files:", err);
    }
  }, [account, emptyFolders, API_BASE_URL]);

  useEffect(() => {
    if (account) retrieveFiles();
  }, [account, retrieveFiles]);

  // Chips only make sense while a search is active
  useEffect(() => {
    if (!searchQuery) { setSearchType(null); setSearchScope("all"); }
  }, [searchQuery]);

  // --- TRANSACTION SIGNING ---
  // Backend endpoints only *prepare* transactions; the user must sign and
  // broadcast via MetaMask, then the backend verifies the receipt on-chain.
  const signAndVerifyTransaction = async (transaction, tId) => {
    const provider = await getProvider();
    await ensureSepolia(provider);
    if (tId) toast.update(tId, "Waiting for signature…", "loading");
    const txHash = await provider.request({
      method: "eth_sendTransaction",
      params: [normalizeTxFields(transaction)],
    });
    if (tId) toast.update(tId, "Confirming on-chain…", "loading");

    const verifyResponse = await fetch(`${API_BASE_URL}/verify-upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({ tx_hash: txHash }),
    });
    const verifyData = await verifyResponse.json();
    if (!verifyData.success) {
      throw new Error(verifyData.error || "Transaction verification failed");
    }
    return txHash;
  };

  const reportTxError = (action, err, tId) => {
    console.error(`${action} error:`, err);
    const rejected = err?.code === 4001;
    const msg = rejected ? "Transaction rejected" : `${action} failed: ${err?.message || err?.reason || String(err)}`;
    const type = rejected ? "info" : "error";
    if (tId) toast.update(tId, msg, type);
    else pushToast(msg, type);
  };

  // --- FILE ACTIONS (SHARE, UNSHARE, MOVE & DELETE) ---
  // Resolve an email to a wallet address via the backend (Privy lookup,
  // pregenerating a wallet for unknown emails). Raw 0x input passes through.
  const resolveRecipient = async (recipient) => {
    const response = await fetch(`${API_BASE_URL}/resolve-recipient`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true"
      },
      body: JSON.stringify({ recipient })
    });
    const data = await response.json();
    if (!response.ok || !data.address) {
      throw new Error(data.error || "Could not resolve recipient");
    }
    return data;
  };

  const handleShare = async (cid, recipient, filename) => {
    if (!account) return;
    let tId;
    try {
      let toAddress = recipient.trim();
      const recipientEmail = toAddress.includes("@") ? toAddress.toLowerCase() : null;
      if (!toAddress.startsWith("0x")) {
        const resolved = await resolveRecipient(toAddress);
        const note = resolved.pregenerated
          ? "\n\nThey haven't used Web3FS yet — a wallet was reserved for this email and the file will appear when they first log in."
          : "";
        const short = `${resolved.address.slice(0, 6)}...${resolved.address.slice(-4)}`;
        if (!window.confirm(`Share with ${toAddress} (${short})?${note}`)) return;
        toAddress = resolved.address;
      }
      tId = toast.loading("Preparing share…");
      const response = await fetch(`${API_BASE_URL}/share`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({ cid, to_address: toAddress, user_address: account })
      });
      const data = await response.json();
      if (!data.transaction) {
        console.error("Share prepare failed:", data);
        toast.update(tId, "Share failed. Check console for details.", "error");
        return;
      }
      await signAndVerifyTransaction(data.transaction, tId);
      toast.update(tId, `Shared with ${recipient.trim()}`, "success");
      // Best-effort email notification once the share is on-chain
      if (recipientEmail) {
        const sharerName = user?.google?.name || user?.email?.address || `${account.slice(0, 6)}...${account.slice(-4)}`;
        fetch(`${API_BASE_URL}/notify-share`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true"
          },
          body: JSON.stringify({
            recipient_email: recipientEmail,
            filename: filename || "a file",
            sharer: sharerName
          })
        }).then(async (r) => {
          const d = await r.json().catch(() => ({}));
          if (r.ok) console.log("Share notification sent to", recipientEmail);
          else console.warn("Share notification failed:", d.error);
        }).catch((e) => console.warn("Share notification failed:", e));
      }
      retrieveFiles();
    } catch (err) {
      reportTxError("Share", err, tId);
    }
  };

  const handleUnshare = async (cid, toAddress) => {
    if (!account) return;
    let tId;
    try {
      tId = toast.loading("Revoking access…");
      const response = await fetch(`${API_BASE_URL}/unshare`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({ cid, to_address: toAddress, user_address: account })
      });
      const data = await response.json();
      if (!data.transaction) {
        console.error("Unshare prepare failed:", data);
        toast.update(tId, "Unshare failed. Check console for details.", "error");
        return;
      }
      await signAndVerifyTransaction(data.transaction, tId);
      toast.update(tId, "Access revoked", "success");
      retrieveFiles();
    } catch (err) {
      reportTxError("Unshare", err, tId);
    }
  };

  // --- FOLDER SHARE ---
  // Paths are flat on-chain, so sharing a folder grants READ+DOWNLOAD on every
  // owned file currently under it — one grantFiles tx, one signature. Files
  // uploaded into the folder later inherit the share (backend prepares extra
  // grant txs at upload time).
  const folderCidsOf = (folderPath) =>
    files
      .filter((f) => f.is_owner && !isTrashed(f) && fullPathOf(f).startsWith(folderPath + "/"))
      .map((f) => f.cid);

  // Aggregate stats for the folder details panel; covers owned folders and
  // folders shared to this user (paths are the owner's either way).
  const folderStatsOf = (folderPath) => {
    // A /.trash-prefixed path only ever matches trashed files, so the
    // isTrashed exclusion applies just to live-folder paths
    const inTrash = folderPath.startsWith(TRASH_PREFIX);
    const inFolder = files.filter((f) => (inTrash || !isTrashed(f)) && fullPathOf(f).startsWith(folderPath + "/"));
    const subfolders = new Set();
    for (const f of inFolder) {
      const rest = fullPathOf(f).slice(folderPath.length + 1);
      const slash = rest.indexOf("/");
      if (slash !== -1) subfolders.add(rest.slice(0, slash));
    }
    const timestamps = inFolder.map((f) => f.timestamp || 0).filter(Boolean);
    // Folder counts as shared with the users granted on ALL of its owned
    // files — same intersection the backend uses for share inheritance
    const ownedInFolder = inFolder.filter((f) => f.is_owner);
    let sharedWith = [];
    if (ownedInFolder.length > 0) {
      sharedWith = ownedInFolder.reduce(
        (acc, f) => acc.filter((u) => (f.shared_with || []).includes(u)),
        [...(ownedInFolder[0].shared_with || [])]
      );
    }
    return {
      sharedWith,
      fileCount: inFolder.length,
      folderCount: subfolders.size,
      size: inFolder.reduce((s, f) => s + (f.size || 0), 0),
      earliest: timestamps.length ? Math.min(...timestamps) : null,
      latest: timestamps.length ? Math.max(...timestamps) : null,
      owned: inFolder.some((f) => f.is_owner),
      owner: inFolder.find((f) => !f.is_owner)?.owner || null,
      cids: inFolder.filter((f) => f.is_owner).map((f) => f.cid),
    };
  };

  // Share many cids with one recipient — one grantFiles tx. Used by folder
  // share and multi-select share; notifyName labels the email notification
  // (e.g. 'the folder "docs"' or '3 items').
  const handleShareCids = async (cids, recipient, notifyName) => {
    if (!account) return;
    if (!cids.length) {
      toast.info("Nothing to share");
      return;
    }
    let tId;
    try {
      let toAddress = recipient.trim();
      const recipientEmail = toAddress.includes("@") ? toAddress.toLowerCase() : null;
      if (!toAddress.startsWith("0x")) {
        const resolved = await resolveRecipient(toAddress);
        const note = resolved.pregenerated
          ? "\n\nThey haven't used Web3FS yet — a wallet was reserved for this email and the files will appear when they first log in."
          : "";
        const short = `${resolved.address.slice(0, 6)}...${resolved.address.slice(-4)}`;
        if (!window.confirm(`Share with ${toAddress} (${short})?${note}`)) return;
        toAddress = resolved.address;
      }
      tId = toast.loading(`Sharing ${cids.length} file(s)…`);
      const response = await fetch(`${API_BASE_URL}/share-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({ cids, to_address: toAddress, user_address: account })
      });
      const data = await response.json();
      if (!data.transaction) {
        console.error("Batch share prepare failed:", data);
        toast.update(tId, "Share failed. Check console for details.", "error");
        return;
      }
      await signAndVerifyTransaction(data.transaction, tId);
      toast.update(tId, `Shared with ${recipient.trim()}`, "success");
      if (recipientEmail) {
        const sharerName = user?.google?.name || user?.email?.address || `${account.slice(0, 6)}...${account.slice(-4)}`;
        fetch(`${API_BASE_URL}/notify-share`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
          body: JSON.stringify({
            recipient_email: recipientEmail,
            filename: notifyName,
            sharer: sharerName
          })
        }).catch((e) => console.warn("Share notification failed:", e));
      }
      retrieveFiles();
    } catch (err) {
      reportTxError("Share", err, tId);
    }
  };

  const handleUnshareCids = async (cids, toAddress) => {
    if (!account) return;
    if (!cids.length) return;
    let tId;
    try {
      tId = toast.loading("Revoking access…");
      const response = await fetch(`${API_BASE_URL}/unshare-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({ cids, to_address: toAddress, user_address: account })
      });
      const data = await response.json();
      if (!data.transaction) {
        console.error("Folder unshare prepare failed:", data);
        toast.update(tId, "Unshare failed. Check console for details.", "error");
        return;
      }
      await signAndVerifyTransaction(data.transaction, tId);
      toast.update(tId, "Access revoked", "success");
      retrieveFiles();
    } catch (err) {
      reportTxError("Unshare", err, tId);
    }
  };

  // Prepare + sign a single move; shared by rename, drag-move, trash,
  // restore and their bulk variants. Throws on failure — callers own toasts.
  const moveTx = async (cid, newPath, tId) => {
    const response = await fetch(`${API_BASE_URL}/move`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true"
      },
      body: JSON.stringify({
        user_address: account,
        cid: cid,
        new_path: newPath
      })
    });
    const data = await response.json();
    if (!data.transaction) {
      console.error("Move prepare failed:", data);
      throw new Error("Could not prepare the move transaction");
    }
    await signAndVerifyTransaction(data.transaction, tId);
  };

  const handleMove = async (cid, newPath) => {
    if (!account) return;
    const tId = toast.loading("Moving…");
    try {
      await moveTx(cid, newPath, tId);
      toast.update(tId, "Moved", "success");
      retrieveFiles();
    } catch (err) {
      reportTxError("Move", err, tId);
    }
  };

  // Move a file into the hidden trash folder (keeps its original path under
  // /.trash so restore can put it back exactly where it was).
  const handleTrash = async (file) => {
    if (!account) return;
    const tId = toast.loading("Moving to trash…");
    try {
      await moveTx(file.cid, `${TRASH_PREFIX}${fullPathOf(file)}`, tId);
      const trashedFile = { ...file, folder_path: `${TRASH_PREFIX}${file.folder_path === "/" || !file.folder_path ? "" : file.folder_path}` };
      toast.update(tId, `"${file.filename}" moved to trash`, "success", {
        duration: 8000,
        action: { label: "Undo", onClick: () => handleRestore(trashedFile) },
      });
      retrieveFiles();
    } catch (err) {
      reportTxError("Move to trash", err, tId);
    }
  };

  const handleRestore = async (file) => {
    if (!account) return;
    const tId = toast.loading("Restoring…");
    try {
      const original = fullPathOf(file).slice(TRASH_PREFIX.length) || `/${file.filename}`;
      await moveTx(file.cid, original, tId);
      toast.update(tId, `"${file.filename}" restored`, "success");
      retrieveFiles();
    } catch (err) {
      reportTxError("Restore", err, tId);
    }
  };

  const handleDelete = async (cid) => {
    if (!window.confirm("Delete this file forever? This cannot be undone.")) return;
    const tId = toast.loading("Deleting…");
    try {
      const response = await fetch(`${API_BASE_URL}/delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({ user_address: account, cid: cid })
      });
      const data = await response.json();
      if (!data.transaction) {
        console.error("Delete prepare failed:", data);
        toast.update(tId, "Delete failed. Check console for details.", "error");
        return;
      }
      await signAndVerifyTransaction(data.transaction, tId);
      toast.update(tId, "File deleted forever", "success");
      retrieveFiles();
    } catch (err) {
      reportTxError("Delete", err, tId);
    }
  };

  // --- BULK ACTIONS (multi-select) ---
  // One moveFiles(cids, newPaths) contract call — a single signature moves
  // any number of files (bulk trash/restore, folder rename).
  const runBatchMove = async (items, label, pathFor) => {
    const tId = toast.loading(`${label} ${items.length} file(s)…`);
    try {
      const response = await fetch(`${API_BASE_URL}/move-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({
          user_address: account,
          cids: items.map((f) => f.cid),
          new_paths: items.map((f) => pathFor(f)),
        }),
      });
      const data = await response.json();
      if (!data.transaction) {
        console.error("Batch move prepare failed:", data);
        toast.update(tId, `${label} failed. Check console for details.`, "error");
        return;
      }
      await signAndVerifyTransaction(data.transaction, tId);
      toast.update(tId, `${label.replace(/ing/, "ed")} ${data.count} file(s)`, "success");
      retrieveFiles();
    } catch (err) {
      reportTxError(label, err, tId);
    }
  };

  // Bulk trash of files plus whole folders (multi-select): folders expand to
  // their owned files, everything moves in one moveFiles tx. Folder star and
  // empty-folder bookkeeping is dropped afterwards, like handleTrashFolder.
  const handleBulkTrash = async (items, folderPaths = []) => {
    const seen = new Set(items.map((f) => f.cid));
    const folderFiles = folderPaths.flatMap((p) =>
      files.filter((f) => f.is_owner && !isTrashed(f) && !seen.has(f.cid) && fullPathOf(f).startsWith(p + "/"))
    );
    folderFiles.forEach((f) => seen.add(f.cid));
    const all = [...items, ...folderFiles];

    const dropFolderEntries = () => {
      if (!folderPaths.length) return;
      setEmptyFolders((prev) => {
        const next = new Set();
        for (const p of prev) {
          if (!folderPaths.some((fp) => p === fp || p.startsWith(fp + "/"))) next.add(p);
        }
        return persistEmptyFolders(next);
      });
      folderPaths.forEach((p) => remapStarredFolders(p));
    };

    if (all.length === 0) {
      // Only empty folders selected — local bookkeeping, nothing on-chain
      dropFolderEntries();
      if (folderPaths.length) toast.success("Folder(s) deleted");
      return;
    }
    await runBatchMove(all, "Moving to trash", (f) => `${TRASH_PREFIX}${fullPathOf(f)}`);
    dropFolderEntries();
  };

  // Multi-select drag: move files plus whole folders to destFolder in one
  // moveFiles tx. Folders that are the destination or one of its ancestors
  // are skipped (moving them would nest a folder inside itself); files
  // already sitting in destFolder stay put.
  const handleBulkMove = async (items, folderPaths, destFolder) => {
    const okFolders = folderPaths.filter((p) => p !== destFolder && !destFolder.startsWith(p + "/"));
    const destBaseOf = (p) => {
      const name = p.slice(p.lastIndexOf("/") + 1);
      return destFolder === "/" ? `/${name}` : `${destFolder}/${name}`;
    };

    const looseFiles = items.filter((f) => f.is_owner && (f.folder_path || "/") !== destFolder);
    const seen = new Set(looseFiles.map((f) => f.cid));
    const moves = looseFiles.map((f) => ({
      file: f,
      to: destFolder === "/" ? `/${f.filename}` : `${destFolder}/${f.filename}`,
    }));
    for (const p of okFolders) {
      const base = destBaseOf(p);
      for (const f of files) {
        if (!f.is_owner || isTrashed(f) || seen.has(f.cid)) continue;
        if (!fullPathOf(f).startsWith(p + "/")) continue;
        seen.add(f.cid);
        moves.push({ file: f, to: base + fullPathOf(f).slice(p.length) });
      }
    }

    const rewriteLocal = () => {
      if (!okFolders.length) return;
      setEmptyFolders((prev) => {
        const next = new Set();
        for (const p0 of prev) {
          const moved = okFolders.find((fp) => p0 === fp || p0.startsWith(fp + "/"));
          if (moved) next.add(destBaseOf(moved) + p0.slice(moved.length));
          else next.add(p0);
        }
        return persistEmptyFolders(next);
      });
      okFolders.forEach((p) => remapStarredFolders(p, destBaseOf(p)));
    };

    if (moves.length === 0) {
      // Only empty folders moved — local bookkeeping, nothing on-chain
      rewriteLocal();
      if (okFolders.length) toast.success("Moved");
      return;
    }
    const pathByCid = new Map(moves.map((m) => [m.file.cid, m.to]));
    await runBatchMove(moves.map((m) => m.file), "Moving", (f) => pathByCid.get(f.cid));
    rewriteLocal();
  };

  // Files in the trash under a logical folder path (path without /.trash)
  const trashedFilesUnder = (folderPath) =>
    files.filter((f) => f.is_owner && isTrashed(f) && fullPathOf(f).startsWith(TRASH_PREFIX + folderPath + "/"));

  // items + whole trash folders expanded to their files — one moveFiles tx
  const handleBulkRestore = (items, folderPaths = []) => {
    const seen = new Set(items.map((f) => f.cid));
    const all = [...items, ...folderPaths.flatMap(trashedFilesUnder).filter((f) => !seen.has(f.cid))];
    if (!all.length) return;
    return runBatchMove(all, "Restoring", (f) => fullPathOf(f).slice(TRASH_PREFIX.length) || `/${f.filename}`);
  };

  const handleRestoreFolder = (folderPath) => handleBulkRestore([], [folderPath]);
  const handleDeleteFolderForever = (folderPath) => handleBulkDelete([], [folderPath]);

  // Bulk delete-forever is a single cleanFolder(cids) transaction; trash
  // folders expand to their files first
  const handleBulkDelete = async (items, folderPaths = []) => {
    const seen = new Set(items.map((f) => f.cid));
    const all = [...items, ...folderPaths.flatMap(trashedFilesUnder).filter((f) => !seen.has(f.cid))];
    if (!all.length) return;
    if (!window.confirm(`Permanently delete ${all.length} file(s)? This cannot be undone.`)) return;
    const tId = toast.loading(`Deleting ${all.length} file(s)…`);
    try {
      const response = await fetch(`${API_BASE_URL}/delete-batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({ user_address: account, cids: all.map((f) => f.cid) })
      });
      const data = await response.json();
      if (!data.transaction) {
        console.error("Batch delete prepare failed:", data);
        toast.update(tId, "Delete failed. Check console for details.", "error");
        return;
      }
      await signAndVerifyTransaction(data.transaction, tId);
      toast.update(tId, `Deleted ${all.length} file(s) forever`, "success");
      retrieveFiles();
    } catch (err) {
      reportTxError("Delete", err, tId);
    }
  };

  // Bulk star: if every selected file is already starred, unstar them all.
  // folderPaths lets multi-select star folders in the same gesture — the
  // all-starred check spans both sets so the toggle stays consistent.
  const toggleStarMany = (cids, folderPaths = []) => {
    if (!account) return;
    const allStarred =
      cids.every((c) => starred.has(c)) && folderPaths.every((p) => starredFolders.has(p));
    setStarred((prev) => {
      const next = new Set(prev);
      cids.forEach((c) => (allStarred ? next.delete(c) : next.add(c)));
      localStorage.setItem(`starred:${account.toLowerCase()}`, JSON.stringify([...next]));
      return next;
    });
    if (folderPaths.length) {
      setStarredFolders((prev) => {
        const next = new Set(prev);
        folderPaths.forEach((p) => (allStarred ? next.delete(p) : next.add(p)));
        return persistStarredFolders(next);
      });
    }
  };

  // --- DYNAMIC ITEM FILTERING ---
  const asFileItem = (f) => ({ ...f, type: "file", name: f.filename || f.name });
  const folderExists = (path) => {
    let node = fileTree;
    for (const part of (path || "").split("/").filter(Boolean)) {
      node = node?.children?.find((c) => c.type === "folder" && c.name === part);
      if (!node) return false;
    }
    return !!node;
  };
  const active = files.filter(f => !isTrashed(f)); // trashed files only show in the Trash view
  const displayItems = searchQuery.length > 0
    ? (() => {
        // Search: name match + optional type chip + optional current-folder scope
        const q = searchQuery.toLowerCase();
        const scopePrefix = currentPath === "/" ? "/" : currentPath + "/";
        const inScope = (fullPath) => searchScope !== "folder" || fullPath.startsWith(scopePrefix);
        const results = [];

        if (searchType !== "folder") {
          const exts = searchType ? SEARCH_TYPE_EXTS[searchType] || [] : null;
          for (const f of active) {
            const name = f.filename || f.name || "";
            if (!name.toLowerCase().includes(q)) continue;
            if (!inScope(fullPathOf(f))) continue;
            if (exts && !exts.includes(name.split(".").pop().toLowerCase())) continue;
            results.push(asFileItem(f));
          }
        }

        if (!searchType || searchType === "folder") {
          // Folder results: every distinct owned folder path plus local empty folders
          const folderPaths = new Set(emptyFolders);
          for (const f of active.filter((x) => x.is_owner)) {
            const parts = fullPathOf(f).split("/").filter(Boolean);
            let p = "";
            for (let i = 0; i < parts.length - 1; i++) { p += "/" + parts[i]; folderPaths.add(p); }
          }
          for (const p of folderPaths) {
            const name = p.slice(p.lastIndexOf("/") + 1);
            if (p === currentPath) continue; // don't list the folder being searched in
            if (!name.toLowerCase().includes(q) || !inScope(p + "/")) continue;
            results.push({ type: "folder", name, fullPath: p });
          }
        }
        return results;
      })()
    : view === "shared"
    // Shared files keep the owner's paths, so group them into folders and
    // let currentPath drive navigation just like My Drive. Folder items are
    // tagged shared:true so navigation stays in this view and owner-only
    // actions (rename, trash, share) are suppressed.
    ? (() => {
        const prefix = currentPath === "/" ? "/" : currentPath + "/";
        const folderNames = new Set();
        const fileItems = [];
        for (const f of active.filter((f) => !f.is_owner)) {
          const full = fullPathOf(f);
          if (!full.startsWith(prefix)) continue;
          const rest = full.slice(prefix.length);
          const slash = rest.indexOf("/");
          if (slash === -1) fileItems.push(asFileItem(f));
          else folderNames.add(rest.slice(0, slash));
        }
        return [
          ...[...folderNames].sort().map((n) => ({ type: "folder", name: n, shared: true, fullPath: prefix + n })),
          ...fileItems,
        ];
      })()
    : view === "recent"
    ? [...active].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 30).map(asFileItem)
    : view === "starred"
    ? [
        // starred folders that still exist; fullPath drives navigation since
        // the Starred view is flat. Folders shared to this user aren't in the
        // owned tree — detect them by path prefix and tag shared:true so
        // navigation opens them in the Shared view.
        ...[...starredFolders]
          .filter((p) => folderExists(p) || active.some((f) => !f.is_owner && fullPathOf(f).startsWith(p + "/")))
          .sort()
          .map((p) => ({ type: "folder", name: p.split("/").pop(), fullPath: p, shared: !folderExists(p) })),
        ...active.filter(f => starred.has(f.cid)).map(asFileItem),
      ]
    : view === "trash"
    // Trashed files keep their original paths under /.trash — group them
    // into folders like the Shared view, with currentPath as the position
    // inside the trash. Folder items are tagged trash:true so navigation
    // stays here and the menu offers restore/delete-forever.
    ? (() => {
        const prefix = TRASH_PREFIX + (currentPath === "/" ? "" : currentPath) + "/";
        const folderNames = new Set();
        const fileItems = [];
        for (const f of files.filter((f) => f.is_owner && isTrashed(f))) {
          const full = fullPathOf(f);
          if (!full.startsWith(prefix)) continue;
          const rest = full.slice(prefix.length);
          const slash = rest.indexOf("/");
          if (slash === -1) fileItems.push(asFileItem(f));
          else folderNames.add(rest.slice(0, slash));
        }
        return [
          ...[...folderNames].sort().map((n) => ({
            type: "folder", name: n, trash: true,
            fullPath: (currentPath === "/" ? "" : currentPath) + "/" + n,
          })),
          ...fileItems,
        ];
      })()
    : (fileTree ? (getFolderContents(fileTree, currentPath) || []) : []);

  // Storage usage: only files the user owns count against them
  const storageUsed = files.reduce((sum, f) => sum + (f.is_owner ? (f.size || 0) : 0), 0);

  // --- UPLOAD LOGIC ---
  // XHR instead of fetch: fetch can't report request-body upload progress
  const uploadWithProgress = (url, formData, onProgress) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.setRequestHeader("ngrok-skip-browser-warning", "true");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch { /* non-JSON error body */ }
        resolve({ ok: xhr.status >= 200 && xhr.status < 300, data });
      };
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.send(formData);
    });

  // Jump to where a file lives: its folder in My Drive, the Shared view for
  // files shared to us, or Trash for trashed ones. Used by conflict toasts.
  const locateFile = (f) => {
    setSearchQuery("");
    if (isTrashed(f)) {
      setView("trash");
      const logical = fullPathOf(f).slice(TRASH_PREFIX.length);
      setCurrentPath(logical.slice(0, logical.lastIndexOf("/")) || "/");
    } else {
      setView(f.is_owner ? "my-drive" : "shared");
      setCurrentPath(f.folder_path || "/");
    }
  };

  // Conflict toast for a duplicate-content upload: actionable when the
  // existing copy is visible to us, explanatory otherwise.
  const reportDuplicate = (tId, uploadName, cid, owner) => {
    const existing = files.find((f) => f.cid === cid);
    const short = (a) => `${a.slice(0, 6)}...${a.slice(-4)}`;
    if (existing) {
      const where = isTrashed(existing) ? "your trash"
        : !existing.is_owner ? "Shared with me"
        : existing.folder_path || "/";
      const renamed = existing.filename !== uploadName ? ` as "${existing.filename}"` : "";
      toast.update(tId, `"${uploadName}" already exists${renamed} in ${where} (identical content)`, "info",
        { duration: 10000, action: { label: "Locate", onClick: () => locateFile(existing) } });
    } else {
      toast.update(tId, `An identical file was already uploaded by ${short(owner)} — content-addressed storage stores it once`, "error", { duration: 10000 });
    }
  };

  // Shared by the New-menu inputs and desktop drag-and-drop
  const submitUpload = async (endpoint, formData, count, firstName, onPrepared) => {
    const label = count > 1 ? `Uploading ${count} files` : `Uploading "${firstName}"`;
    const tId = toast.loading(`${label}… 0%`, { progress: 0 });
    try {
      let lastPct = -1;
      const response = await uploadWithProgress(`${API_BASE_URL}${endpoint}`, formData, (pct) => {
        if (pct === lastPct) return; // don't re-render on every byte event
        lastPct = pct;
        if (pct < 100) toast.update(tId, `${label}… ${pct}%`, "loading", { progress: pct });
        else toast.update(tId, "Processing on IPFS…", "loading", { progress: 100 });
      });

      const data = response.data;
      // Both endpoints return one transaction: single uploadFile, or one
      // uploadFiles batch covering the whole folder
      const uploadedCount = data.uploaded_files?.length || 1;
      const skipped = data.skipped_files?.length || 0;

      if (!response.ok || !data.transaction) {
        console.error("Upload prepare failed:", data);
        if (data.reason === "file_already_exists") {
          reportDuplicate(tId, firstName, data.cid, data.owner);
        } else if (skipped > 0) {
          const names = data.skipped_files.map((s) => s.filename);
          const listed = names.slice(0, 3).join(", ") + (names.length > 3 ? ` (+${names.length - 3} more)` : "");
          const single = skipped === 1 && files.find((f) => f.cid === data.skipped_files[0].cid);
          toast.update(tId, `Nothing to upload — already exist: ${listed}`, "info",
            single ? { duration: 10000, action: { label: "Locate", onClick: () => locateFile(single) } } : { duration: 8000 });
        } else {
          toast.update(tId, "Upload failed. Check console for details.", "error");
        }
        return;
      }
      onPrepared?.();
      await signAndVerifyTransaction(data.transaction, tId);

      // Inherited folder sharing: the destination folder is shared, so the
      // backend prepared grant txs (one per recipient) for the new files
      const shareTxs = data.share_transactions || [];
      let autoShareNote = "";
      if (shareTxs.length > 0) {
        try {
          for (let i = 0; i < shareTxs.length; i++) {
            toast.update(tId, `Sharing with folder members (${i + 1}/${shareTxs.length})…`, "loading");
            await signAndVerifyTransaction(shareTxs[i], tId);
          }
          const n = data.auto_shared_with.length;
          autoShareNote = ` — shared with ${n} ${n > 1 ? "people" : "person"}`;
        } catch (err) {
          console.error("Inherited share error:", err);
          pushToast("Uploaded, but sharing with folder members failed", "error");
        }
      }

      const skippedNote = skipped > 0 ? ` (${skipped} skipped — already exist)` : "";
      toast.update(tId, (uploadedCount > 1 ? `Uploaded ${uploadedCount} files` : `Uploaded "${firstName}"`) + autoShareNote + skippedNote, "success", { duration: skipped ? 8000 : undefined });
      retrieveFiles();
    } catch (err) {
      reportTxError("Upload", err, tId);
    }
  };

  const handleUpload = async (e) => {
    const inputFiles = e.target.files;
    if (!inputFiles?.length || !account) return;

    const formData = new FormData();
    formData.append("user_address", account);

    if (uploadMode === "folder") {
      for (const file of inputFiles) {
        const relative = file.webkitRelativePath || file.name;
        const fullPath = currentPath === "/" ? `/${relative}` : `${currentPath}/${relative}`;
        formData.append("files", file);
        formData.append("paths", fullPath);
      }
    } else {
      formData.append("file", inputFiles[0]);
      formData.append("folder_path", currentPath);
    }

    const endpoint = uploadMode === "folder" ? "/upload-folder" : "/upload";
    await submitUpload(endpoint, formData, inputFiles.length, inputFiles[0].name, () => { e.target.value = null; });
  };

  // Desktop drag-and-drop: items are [{ file, rel }] where rel keeps any
  // dropped-folder structure ("docs/sub/a.txt"). A single loose file goes
  // through /upload; everything else through /upload-folder (one batch tx).
  const handleDropUpload = async (items) => {
    if (!account) { toast.info("Sign in first"); return; }
    if (!items.length) return;

    const formData = new FormData();
    formData.append("user_address", account);

    let endpoint;
    if (items.length === 1 && !items[0].rel.includes("/")) {
      endpoint = "/upload";
      formData.append("file", items[0].file);
      formData.append("folder_path", currentPath);
    } else {
      endpoint = "/upload-folder";
      for (const { file, rel } of items) {
        const fullPath = currentPath === "/" ? `/${rel}` : `${currentPath}/${rel}`;
        formData.append("files", file);
        formData.append("paths", fullPath);
      }
    }
    await submitUpload(endpoint, formData, items.length, items[0].file.name);
  };

  const handleDeleteFolder = async (folderPath) => {
    if (!account) return;
    const isTrashPurge = folderPath === TRASH_PREFIX;
    const tId = toast.loading(isTrashPurge ? "Emptying trash…" : "Deleting folder…");
    try {
      const response = await fetch(`${API_BASE_URL}/delete-folder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({ folder_path: folderPath, user_address: account })
      });
      const data = await response.json();
      if (data.error) {
        console.error("Delete folder prepare failed:", data);
        toast.update(tId, "Delete folder failed. Check console for details.", "error");
        return;
      }
      // Folders with on-chain files need a signed batch delete; empty
      // folders exist only in local state and have no transaction.
      if (data.transaction) {
        await signAndVerifyTransaction(data.transaction, tId);
      }
      toast.update(tId, isTrashPurge ? "Trash emptied" : "Folder deleted", "success");
      setEmptyFolders(prev => {
        const next = new Set();
        for (const p of prev) {
          if (p !== folderPath && !p.startsWith(folderPath + "/")) next.add(p);
        }
        return persistEmptyFolders(next);
      });
      remapStarredFolders(folderPath);
      retrieveFiles();
    } catch (err) {
      reportTxError("Delete folder", err, tId);
    }
  };

  // --- FOLDER CREATION ---
  const handleCreateFolder = (name) => {
    const newPath = currentPath === "/" ? `/${name}` : `${currentPath}/${name}`;
    setEmptyFolders(prev => persistEmptyFolders(new Set(prev).add(newPath)));
  };

  // --- FOLDER TRASH ---
  // Move every owned file under the folder to /.trash — one batch tx, one
  // signature. Restorable from the Trash view (per file or multi-select).
  const handleTrashFolder = async (folderPath) => {
    const dropEmptyEntries = () => setEmptyFolders(prev => {
      const next = new Set();
      for (const p of prev) {
        if (p !== folderPath && !p.startsWith(folderPath + "/")) next.add(p);
      }
      return persistEmptyFolders(next);
    });

    const affected = files.filter((f) =>
      f.is_owner && !isTrashed(f) && fullPathOf(f).startsWith(folderPath + "/")
    );
    if (affected.length === 0) {
      // Empty folders exist only locally — nothing on-chain to trash
      dropEmptyEntries();
      remapStarredFolders(folderPath);
      toast.success("Folder deleted");
      return;
    }
    await runBatchMove(affected, "Moving to trash", (f) => `${TRASH_PREFIX}${fullPathOf(f)}`);
    dropEmptyEntries();
    remapStarredFolders(folderPath);
  };

  // --- FOLDER RENAME & MOVE ---
  // Paths live on-chain per file, so relocating a folder moves every owned
  // file under it — one moveFiles tx, one signature. Empty folders are
  // local-only: just rewrite their paths in the set.
  const relocateFolder = async (folderPath, newPath, label, doneMsg) => {
    const rewriteEmptyFolders = () => setEmptyFolders(prev => {
      const next = new Set();
      for (const p of prev) {
        if (p === folderPath) next.add(newPath);
        else if (p.startsWith(folderPath + "/")) next.add(newPath + p.slice(folderPath.length));
        else next.add(p);
      }
      return persistEmptyFolders(next);
    });

    const affected = files.filter((f) =>
      f.is_owner && !isTrashed(f) && fullPathOf(f).startsWith(folderPath + "/")
    );
    if (affected.length === 0) {
      rewriteEmptyFolders();
      remapStarredFolders(folderPath, newPath);
      toast.success(doneMsg);
      return;
    }
    await runBatchMove(affected, label, (f) => newPath + fullPathOf(f).slice(folderPath.length));
    rewriteEmptyFolders();
    remapStarredFolders(folderPath, newPath);
  };

  const handleRenameFolder = (folderPath, newName) => {
    const parent = folderPath.slice(0, folderPath.lastIndexOf("/"));
    const newPath = `${parent}/${newName}`;
    if (newPath === folderPath) return;
    return relocateFolder(folderPath, newPath, "Renaming", "Folder renamed");
  };

  const handleMoveFolder = (folderPath, destFolder) => {
    const name = folderPath.slice(folderPath.lastIndexOf("/") + 1);
    const newPath = destFolder === "/" ? `/${name}` : `${destFolder}/${name}`;
    // No-op if already there; refuse moving a folder into itself
    if (newPath === folderPath || destFolder === folderPath || destFolder.startsWith(folderPath + "/")) return;
    return relocateFolder(folderPath, newPath, "Moving", "Folder moved");
  };

  return (
    <>
    <ToastStack toasts={toasts} dismiss={dismissToast} darkMode={darkMode} />
    <AppLayout
      account={account}
      authToken={authToken}
      connectWallet={connectWallet}
      disconnectWallet={disconnectWallet}
      displayItems={displayItems}
      currentPath={currentPath}
      setCurrentPath={setCurrentPath}
      uploadFile={handleUpload}
      handleDropUpload={handleDropUpload}
      setUploadMode={setUploadMode}
      handleCreateFolder={handleCreateFolder}
      handleRenameFolder={handleRenameFolder}
      handleMoveFolder={handleMoveFolder}
      handleBulkMove={handleBulkMove}
      handleTrashFolder={handleTrashFolder}
      handleMove={handleMove}
      handleDelete={handleDelete}
      handleTrash={handleTrash}
      handleRestore={handleRestore}
      handleDeleteFolder={handleDeleteFolder}
      handleShare={handleShare}
      folderCidsOf={folderCidsOf}
      folderStatsOf={folderStatsOf}
      handleShareCids={handleShareCids}
      handleUnshareCids={handleUnshareCids}
      handleRestoreFolder={handleRestoreFolder}
      handleDeleteFolderForever={handleDeleteFolderForever}
      handleUnshare={handleUnshare}
      fileTree={fileTree}
      API_BASE_URL={API_BASE_URL}
      view={view}
      setView={setView}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      searchType={searchType}
      setSearchType={setSearchType}
      searchScope={searchScope}
      setSearchScope={setSearchScope}
      darkMode={darkMode}
      toggleTheme={toggleTheme}
      user={user}
      starred={starred}
      starredFolders={starredFolders}
      toggleStarFolder={toggleStarFolder}
      toggleStar={toggleStar}
      toggleStarMany={toggleStarMany}
      storageUsed={storageUsed}
      toast={toast}
      handleBulkTrash={handleBulkTrash}
      handleBulkRestore={handleBulkRestore}
      handleBulkDelete={handleBulkDelete}
    />
    </>
  );
}

export default App;