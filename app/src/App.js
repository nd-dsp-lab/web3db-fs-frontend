import React, { useState, useEffect, useCallback, useRef } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import AppLayout from "./components/AppLayout";
import { buildFileTree, getFolderContents, ensureSepolia, normalizeTxFields } from "./utils/helpers";

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

  // --- WALLET FUNCTIONALITY (Privy: email / Google / external wallet) ---
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0] || null; // active wallet: embedded or external
  const account = ready && authenticated && wallet ? wallet.address : null;

  const connectWallet = () => login();

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
      setFileTree(buildFileTree(filesList, emptyFolders));
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
  const handleShare = async (cid, toAddress) => {
    if (!account) return;
    try {
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

  const handleDelete = async (cid) => {
    if (!window.confirm("Are you sure you want to delete this file?")) return;
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
  const displayItems = searchQuery.length > 0
    ? files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : (fileTree ? (getFolderContents(fileTree, currentPath) || []) : []);

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
      handleShare={handleShare}
      handleUnshare={handleUnshare}
      fileTree={fileTree}
      API_BASE_URL={API_BASE_URL}
      view={view}
      setView={setView}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      darkMode={window.matchMedia("(prefers-color-scheme: dark)").matches}
    />
  );
}

export default App;