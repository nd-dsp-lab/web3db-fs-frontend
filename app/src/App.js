import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import AppLayout from "./components/AppLayout";
import ToastStack from "./components/Toast";
import { buildFileTree } from "./utils/helpers";
import { TRASH_PREFIX } from "./lib/constants";
import { isTrashed, fullPathOf } from "./lib/paths";
import { makeApi } from "./lib/api";
import { useToasts } from "./hooks/useToasts";
import { useEmptyFolders } from "./hooks/useEmptyFolders";
import { useStarred } from "./hooks/useStarred";
import { useDisplayItems } from "./hooks/useDisplayItems";
import { useFileActions } from "./hooks/useFileActions";

function App() {
  // Replace with your actual backend URL
  const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "https://64e2c4b2e6e8.ngrok-free.app";
  const api = useMemo(() => makeApi(API_BASE_URL), [API_BASE_URL]);

  // --- STATE MANAGEMENT ---
  const [files, setFiles] = useState([]);
  const [fileTree, setFileTree] = useState(null);
  const [currentPath, setCurrentPath] = useState("/");
  const [view, setView] = useState("my-drive");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState(null); // null | "folder" | key of SEARCH_TYPE_EXTS
  const [searchScope, setSearchScope] = useState("all"); // "all" | "folder" (current folder subtree)
  const [uploadMode, setUploadMode] = useState("single");

  // --- TOASTS ---
  const { toasts, dismissToast, pushToast, toast } = useToasts();

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

  const { emptyFolders, setEmptyFolders, persistEmptyFolders } = useEmptyFolders(account);
  const { starred, starredFolders, toggleStar, toggleStarFolder, toggleStarMany, remapStarredFolders } = useStarred(account);

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
        const res = await api.post("/auth/token", { address: account, timestamp, signature });
        const data = await res.json();
        if (!res.ok || !data.token) throw new Error(data.error || "Token request failed");
        localStorage.setItem(key, JSON.stringify(data));
        setAuthToken(data.token);
      } catch (err) {
        console.error("Download auth failed:", err);
        toast.error("Sign-in verification failed — downloads and previews disabled");
      }
    })();
  }, [account, wallet, api, getProvider]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- GAS DRIP for fresh embedded wallets ---
  const fundRequested = useRef(new Set());
  useEffect(() => {
    if (!account || wallet?.walletClientType !== "privy") return;
    if (fundRequested.current.has(account)) return; // once per address per session
    fundRequested.current.add(account);
    (async () => {
      try {
        const res = await api.post("/fund-wallet", { address: account });
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
  }, [account, wallet, api]);

  // --- DATA FETCHING ---
  const retrieveFiles = useCallback(async () => {
    if (!account) return;
    try {
      const response = await api.get(`/?user_address=${account}`);
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
  }, [account, emptyFolders, api]);

  useEffect(() => {
    if (account) retrieveFiles();
  }, [account, retrieveFiles]);

  // Chips only make sense while a search is active
  useEffect(() => {
    if (!searchQuery) { setSearchType(null); setSearchScope("all"); }
  }, [searchQuery]);

  // --- FILE ACTIONS (share, move, rename, trash, restore, delete, upload) ---
  const {
    handleShare, handleUnshare, handleShareCids, handleUnshareCids, handleMove, handleTrash, handleRestore, handleDelete, handleBulkTrash, handleBulkMove, handleBulkRestore, handleBulkDelete, handleRestoreFolder, handleDeleteFolderForever, handleTrashFolder, handleRenameFolder, handleMoveFolder, handleCreateFolder, handleDeleteFolder, handleUpload, handleDropUpload,
  } = useFileActions({
    account, api, toast, pushToast, user, getProvider, retrieveFiles, files, emptyFolders, setEmptyFolders, persistEmptyFolders, remapStarredFolders, currentPath, uploadMode, setView, setCurrentPath, setSearchQuery,
  });

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
      storageQuota={storageQuota}
      toast={toast}
      handleBulkTrash={handleBulkTrash}
      handleBulkRestore={handleBulkRestore}
      handleBulkDelete={handleBulkDelete}
    />
    </>
  );
}

export default App;
