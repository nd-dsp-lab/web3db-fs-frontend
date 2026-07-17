import React, { useState, useEffect, useCallback, useRef } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import AppLayout from "./components/AppLayout";
import { buildFileTree, getFolderContents, ensureSepolia, normalizeTxFields } from "./utils/helpers";

// Trash is a hidden path prefix: "deleting" a file moves it under /.trash
// (one on-chain move tx), restoring moves it back. No contract changes.
const TRASH_PREFIX = "/.trash";
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
  const [emptyFolders, setEmptyFolders] = useState(new Set());
  const [uploadMode, setUploadMode] = useState("single");
  const [starred, setStarred] = useState(new Set());

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

  // --- TRANSACTION SIGNING ---
  // Backend endpoints only *prepare* transactions; the user must sign and
  // broadcast via MetaMask, then the backend verifies the receipt on-chain.
  const signAndVerifyTransaction = async (transaction) => {
    const provider = await getProvider();
    await ensureSepolia(provider);
    const txHash = await provider.request({
      method: "eth_sendTransaction",
      params: [normalizeTxFields(transaction)],
    });

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

  const reportTxError = (action, err) => {
    console.error(`${action} error:`, err);
    if (err?.code === 4001) {
      alert("Transaction rejected by user");
    } else {
      alert(`${action} failed: ` + (err?.message || err?.reason || String(err)));
    }
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
        alert("Share failed. Check console for details.");
        return;
      }
      await signAndVerifyTransaction(data.transaction);
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
      reportTxError("Share", err);
    }
  };

  const handleUnshare = async (cid, toAddress) => {
    if (!account) return;
    try {
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
        alert("Unshare failed. Check console for details.");
        return;
      }
      await signAndVerifyTransaction(data.transaction);
      retrieveFiles();
    } catch (err) {
      reportTxError("Unshare", err);
    }
  };

  const handleMove = async (cid, newPath) => {
    if (!account) return;
    try {
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
        alert("Move failed. Check console for details.");
        return;
      }
      await signAndVerifyTransaction(data.transaction);
      retrieveFiles();
    } catch (err) {
      reportTxError("Move", err);
    }
  };

  // Move a file into the hidden trash folder (keeps its original path under
  // /.trash so restore can put it back exactly where it was).
  const handleTrash = async (file) => {
    await handleMove(file.cid, `${TRASH_PREFIX}${fullPathOf(file)}`);
  };

  const handleRestore = async (file) => {
    const original = fullPathOf(file).slice(TRASH_PREFIX.length) || `/${file.filename}`;
    await handleMove(file.cid, original);
  };

  const handleDelete = async (cid) => {
    if (!window.confirm("Delete this file forever? This cannot be undone.")) return;
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
        alert("Delete failed. Check console for details.");
        return;
      }
      await signAndVerifyTransaction(data.transaction);
      retrieveFiles();
    } catch (err) {
      reportTxError("Delete", err);
    }
  };

  // --- DYNAMIC ITEM FILTERING ---
  const asFileItem = (f) => ({ ...f, type: "file", name: f.filename || f.name });
  const active = files.filter(f => !isTrashed(f)); // trashed files only show in the Trash view
  const displayItems = searchQuery.length > 0
    ? active
        .filter(f => (f.filename || f.name || "").toLowerCase().includes(searchQuery.toLowerCase()))
        .map(asFileItem)
    : view === "shared"
    ? active.filter(f => !f.is_owner).map(asFileItem)
    : view === "recent"
    ? [...active].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 30).map(asFileItem)
    : view === "starred"
    ? active.filter(f => starred.has(f.cid)).map(asFileItem)
    : view === "trash"
    ? files.filter(f => f.is_owner && isTrashed(f)).map(asFileItem)
    : (fileTree ? (getFolderContents(fileTree, currentPath) || []) : []);

  // Storage usage: only files the user owns count against them
  const storageUsed = files.reduce((sum, f) => sum + (f.is_owner ? (f.size || 0) : 0), 0);

  // --- UPLOAD LOGIC ---
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
    
    try {
      const endpoint = uploadMode === "folder" ? "/upload-folder" : "/upload";
      const response = await fetch(`${API_BASE_URL}${endpoint}`, { 
        method: "POST", 
        body: formData, 
        headers: { "ngrok-skip-browser-warning": "true" } 
      });

      const data = await response.json();
      if (!response.ok || !data.transaction) {
        console.error("Upload prepare failed:", data);
        if (data.reason === "file_already_exists") {
          alert("This exact file already exists in the system (identical content). It is owned by " + data.owner);
        } else {
          alert("Upload failed. Check console for details.");
        }
        return;
      }
      e.target.value = null;
      await signAndVerifyTransaction(data.transaction);
      retrieveFiles();
    } catch (err) {
      reportTxError("Upload", err);
    }
  };

  const handleDeleteFolder = async (folderPath) => {
    if (!account) return;
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
        alert("Delete folder failed. Check console for details.");
        return;
      }
      // Folders with on-chain files need a signed batch delete; empty
      // folders exist only in local state and have no transaction.
      if (data.transaction) {
        await signAndVerifyTransaction(data.transaction);
      }
      setEmptyFolders(prev => {
        const next = new Set();
        for (const p of prev) {
          if (p !== folderPath && !p.startsWith(folderPath + "/")) next.add(p);
        }
        return next;
      });
      retrieveFiles();
    } catch (err) {
      reportTxError("Delete folder", err);
    }
  };

  // --- FOLDER CREATION ---
  const handleCreateFolder = (name) => {
    const newPath = currentPath === "/" ? `/${name}` : `${currentPath}/${name}`;
    setEmptyFolders(prev => new Set(prev).add(newPath));
  };

  return (
    <AppLayout 
      account={account}
      connectWallet={connectWallet}
      disconnectWallet={disconnectWallet}
      displayItems={displayItems}
      currentPath={currentPath}
      setCurrentPath={setCurrentPath}
      uploadFile={handleUpload}
      setUploadMode={setUploadMode}
      handleCreateFolder={handleCreateFolder}
      handleMove={handleMove}
      handleDelete={handleDelete}
      handleTrash={handleTrash}
      handleRestore={handleRestore}
      handleDeleteFolder={handleDeleteFolder}
      handleShare={handleShare}
      handleUnshare={handleUnshare}
      fileTree={fileTree}
      API_BASE_URL={API_BASE_URL}
      view={view}
      setView={setView}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      darkMode={darkMode}
      toggleTheme={toggleTheme}
      user={user}
      starred={starred}
      toggleStar={toggleStar}
      storageUsed={storageUsed}
    />
  );
}

export default App;