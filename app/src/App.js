import React, { useState, useEffect, useCallback } from "react";
import AppLayout from "./components/AppLayout";
import { buildFileTree, getFolderContents } from "./utils/helpers";

function App() {
  // Replace with your actual backend URL
  const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "https://64e2c4b2e6e8.ngrok-free.app";

  // --- STATE MANAGEMENT ---
  const [account, setAccount] = useState(null);
  const [files, setFiles] = useState([]);
  const [fileTree, setFileTree] = useState(null);
  const [currentPath, setCurrentPath] = useState("/");
  const [view, setView] = useState("my-drive"); 
  const [searchQuery, setSearchQuery] = useState("");
  const [emptyFolders, setEmptyFolders] = useState(new Set());
  const [uploadMode, setUploadMode] = useState("single");

  // --- WALLET FUNCTIONALITY ---
  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("MetaMask not found! Please install the extension.");
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setAccount(accounts[0]);
    } catch (err) {
      console.error("Wallet connection failed:", err);
    }
  };

  const disconnectWallet = () => {
    setAccount(null);
    setFiles([]);
    setFileTree(null);
    setCurrentPath("/");
    setSearchQuery("");
  };

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

  // --- FILE ACTIONS (MOVE & DELETE) ---
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
      if (response.ok) {
        retrieveFiles();
      } else {
        alert("Move failed. Check console for details.");
      }
    } catch (err) {
      console.error("Move error:", err);
    }
  };

  const handleDelete = async (cid) => {
    if (!window.confirm("Are you sure you want to delete this file?")) return;
    try {
      await fetch(`${API_BASE_URL}/delete/${cid}?user_address=${account}`, {
        method: "DELETE",
        headers: { "ngrok-skip-browser-warning": "true" }
      });
      retrieveFiles();
    } catch (err) {
      console.error("Delete error:", err);
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

      if (response.ok) {
        e.target.value = null; 
        retrieveFiles();
      }
    } catch (err) {
      console.error("Upload failed:", err);
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
      view={view}
      setView={setView}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      darkMode={window.matchMedia("(prefers-color-scheme: dark)").matches}
    />
  );
}

export default App;