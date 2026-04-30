import React, { useState, useEffect, useCallback } from "react";
import AppLayout from "./components/AppLayout";
import { buildFileTree, getFolderContents } from "./utils/helpers";

function App() {
  // Replace with your actual backend URL if different
  const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "https://64e2c4b2e6e8.ngrok-free.app";

  // --- STATE MANAGEMENT ---
  const [account, setAccount] = useState(null);
  const [files, setFiles] = useState([]);
  const [fileTree, setFileTree] = useState(null);
  const [currentPath, setCurrentPath] = useState("/");
  const [view, setView] = useState("my-drive"); 
  const [searchQuery, setSearchQuery] = useState("");
  const [emptyFolders, setEmptyFolders] = useState(new Set());
  const [uploadMode, setUploadMode] = useState("single"); // "single" or "folder"

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
      // Rebuild the visual tree whenever files or manually created empty folders change
      setFileTree(buildFileTree(filesList, emptyFolders));
    } catch (err) {
      console.error("Error retrieving files:", err);
    }
  }, [account, emptyFolders, API_BASE_URL]);

  useEffect(() => {
    if (account) retrieveFiles();
  }, [account, retrieveFiles]);

  // --- DYNAMIC ITEM FILTERING (SEARCH vs NAVIGATION) ---
  // If user is searching, filter globally across all files.
  // Otherwise, only show items in the current folder path.
  const displayItems = searchQuery.length > 0
    ? files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : (fileTree ? getFolderContents(fileTree, currentPath) : []);

  // --- UPLOAD LOGIC ---
  const handleUpload = async (e) => {
    const inputFiles = e.target.files;
    if (!inputFiles?.length || !account) return;
    
    const formData = new FormData();
    formData.append("user_address", account);

    if (uploadMode === "folder") {
      // Logic for uploading a full directory structure
      for (const file of inputFiles) {
        const relative = file.webkitRelativePath || file.name;
        const fullPath = currentPath === "/" ? `/${relative}` : `${currentPath}/${relative}`;
        formData.append("files", file);
        formData.append("paths", fullPath);
      }
    } else {
      // Logic for uploading a single file to the current folder
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
        // Reset input so same file can be re-uploaded if user chooses
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

  // --- RENDER ---
  return (
    <AppLayout 
      account={account}
      connectWallet={connectWallet}
      disconnectWallet={disconnectWallet}
      displayItems={displayItems} // The functional data for the table
      currentPath={currentPath}
      setCurrentPath={setCurrentPath}
      uploadFile={handleUpload}
      setUploadMode={setUploadMode}
      handleCreateFolder={handleCreateFolder}
      view={view}
      setView={setView}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      // System-level dark mode detection
      darkMode={window.matchMedia("(prefers-color-scheme: dark)").matches}
    />
  );
}

export default App;