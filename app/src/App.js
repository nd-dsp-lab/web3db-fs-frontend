import React, { useState, useEffect, useCallback } from "react";
import AppLayout from "./components/AppLayout";
import { READ, WRITE, DOWNLOAD, DELETE, SHARE, MOVE, CHANGE_OWNER, CHANGE_ROLE } from "./utils/permissions"
import { buildFileTree, getFolderContents, ensureSepolia, toHexifNumber, normalizeTxFields } from "./utils/helpers"

function App() {
  const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "https://64e2c4b2e6e8.ngrok-free.app";
  // ------ REMEMBER TO SWITCH BACK TO ABOVE URL BEFORE PUSHING TO DEVELOP ---------
  // const API_BASE_URL = "http://localhost:8090";  // for testing

  const [account, setAccount] = useState(null);
  const [files, setFiles] = useState([]);
  const [fileTree, setFileTree] = useState(null);
  const [currentPath, setCurrentPath] = useState("/");
  const [folderPath, setFolderPath] = useState("/");
  const [uploadMode, setUploadMode] = useState("single");
  const [newFolderName, setNewFolderName] = useState("");
  
  // Track empty folders (folders with no files) to persist them across retrieveFiles calls
  const [emptyFolders, setEmptyFolders] = useState(new Set());

  async function connectWallet() {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({
          method: "eth_requestAccounts",
        });
        setAccount(accounts[0]);
      } catch (err) {
        console.error("User rejected request:", err);
      }
    } else {
      alert("MetaMask not detected. Please install it!");
    }
  }

  // Functionality for preparing and sending shared transactions
  async function handleShare(cid, toAddress) {
    if (!account) {
      alert("Connect wallet first");
      return;
    }

    try {
      // request backend to prepare transaction
      const response = await fetch(`${API_BASE_URL}/share`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({ cid, to_address: toAddress, user_address: account }),
      });

      const data = await response.json();
      if (!data.transaction) {
        console.error("Share prepare failed", data);
        alert("Failed to prepare share transaction");
        return;
      }
      const txn = data.transaction;

      // Ensure we are on Sepolia network
      await ensureSepolia();

      // Ensure all transaction fields are properly formatted
      const fields = normalizeTxFields(txn);

      // Get user approval
      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [fields],
      });

      alert(`Share transaction sent: ${txHash}. Waiting for confirmation...`);

      // Verification
      console.log("Verifying share transaction:", txHash);
      const verify = await fetch(`${API_BASE_URL}/verify-upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({ tx_hash: txHash }),
      });
      const verifyData = await verify.json();
      if (verifyData.success) {
        alert("Share successful");
        retrieveFiles();
      } else {
        console.error("Share tx verifiaction failed", verifyData);
        alert("Share transaction failed");
      }
    } catch (err) {
      console.error("Share flow error", err);
      if (err?.code === 4001) {
        alert("Transaction rejected by user");
      } else {
        alert("Share failed: " + (err?.message || err?.reason || err.toString()));
      }
    }
  }

  // handler for unsharing files
  async function handleUnshare(cid, toAddress) {
    if (!account) {
      alert("Connect wallet first");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/unshare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cid, to_address: toAddress, user_address: account }),
      });

      const data = await response.json();

      if (!data.transaction) {
        console.error("Share prepare failed", data);
        alert("Failed to prepare share transaction");
        return;
      }
      const txn = data.transaction;

      // Ensure we are on Sepolia network
      await ensureSepolia();

      // Ensure all transaction fields are properly formatted
      const fields = { ...txn };
      fields.gas = toHexifNumber(fields.gas);
      fields.gasPrice = toHexifNumber(fields.gasPrice);
      fields.nonce = toHexifNumber(fields.nonce);
      fields.value = toHexifNumber(fields.value) || '0x0';
      fields.chainId = toHexifNumber(fields.chainId);

      // Get user approval
      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [fields],
      });

      alert(`Unshare transaction sent: ${txHash}. Waiting for confirmation...`);

      // Verification
      const verify = await fetch(`${API_BASE_URL}/verify-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tx_hash: txHash }),
      });
      const verifyData = await verify.json();
      if (verifyData.success) {
        alert("Unshare successful");
        retrieveFiles();
      } else {
        console.error("Unshare tx verification failed", verifyData);
        alert("Unshare transaction failed");
      }
    } catch (err) {
      console.error("Unshare flow error", err);
      if (err?.code === 4001) {
        alert("Transaction rejected by user");
      } else {
        alert("Unshare failed: " + (err?.message || err?.reason || err.toString()));
      }
    }
  }

  async function uploadFile(event) {
    event.preventDefault();

    const fileInput =
      uploadMode === "folder"
        ? document.getElementById("folderInput")
        : document.getElementById("singleFileInput");

    const files = fileInput?.files;
    if ((!files || files.length === 0) && uploadMode !== "folder") {
      alert("Please select a file first!");
      return;
    }

    let emptyFolderFlag = 0;

    if (files.length === 0 && uploadMode === "folder") {
      emptyFolderFlag = 1;
    }

    if (!account) {
      alert("Please connect your wallet first!");
      return;
    }

    try {
      const formData = new FormData();

      if (uploadMode === "folder") {
        console.log("uploading folder with files:", files);
        // For multiple files inside a folder
        for (const file of files) {
          const relativePath = file.webkitRelativePath || file.name;
          // prepend currentPath if needed
          const fullPath =
            currentPath === "/"
              ? "/" + relativePath
              : currentPath + "/" + relativePath;

          formData.append("files", file);
          formData.append("paths", fullPath);
          formData.append("user_address", account);

          console.log("Appending:", fullPath);
        }
      } else {
        // For a single file upload
        const file = files[0];
        formData.append("file", file);
        formData.append("folder_path", currentPath);
        formData.append("user_address", account);
      }

      // Upload request (works for both folder and single file)
      const response = await fetch(
        uploadMode === "folder"
          ? `${API_BASE_URL}/upload-folder`
          : `${API_BASE_URL}/upload`,
        {
          method: "POST",
          headers: { "ngrok-skip-browser-warning": "true" },
          body: formData,
        }
      );

      const data = await response.json();
      console.log("Backend response:", data);

      if (!data.transaction && !emptyFolderFlag) {
        alert(emptyFolderFlag)
        alert("Failed to prepare transaction");
        return;
      }

      console.log("Transaction data:", data.cid);
      console.log("Upload mode:", uploadMode);
      console.log("Account:", data.cid);

      if (uploadMode && data.cid) {
        alert(
          `File uploaded to IPFS! CID: ${data.cid}. Now sign the transaction to store on blockchain.`
        );
        await handleTransaction(data);
      } else {
        alert("Folder created!");
        retrieveFiles();
      }
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Upload failed: " + (error.message || "Unknown error"));
    }
  }

  async function handleTransaction(data) {
    try {
      await ensureSepolia();

      const transaction = normalizeTxFields(data.transaction);

      const txHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [transaction],
      });

      alert(`Transaction sent! Hash: ${txHash}. Waiting for confirmation...`);

      // Verify transaction was mined
      const verifyResponse = await fetch(`${API_BASE_URL}/verify-upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({ tx_hash: txHash }),
      });

      const verifyData = await verifyResponse.json();

      if (verifyData.success) {
        alert(`File successfully stored on blockchain! Transaction: ${txHash}`);
        // Refresh the files list after successful upload
        retrieveFiles();
      } else {
        const errorMessage = verifyData.error || "Transaction verification failed";
        alert(`Transaction failed: ${errorMessage}`);
      }

    } catch (error) {
      console.error("Upload failed:", error);
      if (error.code === 4001) {
        alert("Transaction rejected by user");
      } else {
        // Handle different error object structures
        const errorMessage = error.message || error.reason || error.toString() || "Unknown error";
        alert(`Upload failed: ${errorMessage}`);
      }
    }
  }

  async function handleDelete(cid) {
    if (!account) {
      alert("Connect wallet first");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cid, user_address: account }),
      });
      const data = await response.json();
      if (!data.transaction) {
        console.error("Delete prep failed", data);
        alert("Failed to prepare delete transaction");
        return;
      }
      const txn = data.transaction;

      await ensureSepolia();

      const fields = { ...txn };
      fields.gas = toHexifNumber(fields.gas);
      fields.gasPrice = toHexifNumber(fields.gasPrice);
      fields.nonce = toHexifNumber(fields.nonce);
      fields.value = toHexifNumber(fields.value) || '0x0';
      fields.chainId = toHexifNumber(fields.chainId);

      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [fields],
      });

      alert(`Delete transaction sent: ${txHash}. Waiting for confirmation...`);

      // asking backend to wait for receipt and unpin (verified)
      const verify = await fetch(`${API_BASE_URL}/verify-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tx_hash: txHash }),
      });
      const verifyData = await verify.json();
      if (verifyData.success) {
        alert("Delete successful (if delete call detected by server)");
        retrieveFiles();
      } else {
        console.error("Delete tx verification failed", verifyData);
        alert("Delete transaction failed");
      }
    } catch (err) {
      console.error("Delete error", err);
      if (err?.code === 4001) {
        alert("Transaction rejected by user");
      } else {
        alert("Delete failed: " + (err?.message || err?.reason || err.toString()));
      }
    }
  }

  // retrieveFiles
  const retrieveFiles = useCallback(async () => {
    if (!account) return;
    try {
      const response = await fetch(`${API_BASE_URL}/?user_address=${account}`, {
        headers: {
          "ngrok-skip-browser-warning": "true"
        }
      });
      const data = await response.json();
      console.log("Retrieved files data:", data);
      const filesList = data.user_files || [];

      // get the shared-user list for each file as well
      const filesWithShared = await Promise.all(
        filesList.map(async (file) => {
          try {
            const response = await fetch(`${API_BASE_URL}/shared-users?cid=${encodeURIComponent(file.cid)}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const shared_data = await response.json();

            return { ...file, shared_with: Array.isArray(shared_data.shared_with) ? shared_data.shared_with : [] };
          } catch (err) {
            console.error("Error fetching shared-with for CID", file.cid, err);
            return { ...file, shared_with: [] };
          }
        })
      );

      setFiles(filesWithShared || []);

      // Pass emptyFolders to buildFileTree to preserve empty folders
      const fileTree = buildFileTree(filesWithShared, emptyFolders);
      console.log("Built file tree:", fileTree);

      setFileTree(fileTree);

    } catch (err) {
      console.error("Error retrieving files:", err);
      setFiles([]);
    }
  }, [account, API_BASE_URL, emptyFolders]);

  // derive the tree whenever files change
  // useEffect(() => {
  //   setFileTree(buildFileTree(files));
  // }, [files]);

  useEffect(() => {
    if (account) {
      retrieveFiles();
    }
  }, [account, retrieveFiles]);

  // Persist emptyFolders to localStorage whenever it changes
  useEffect(() => {
    if (account && emptyFolders.size > 0) {
      try {
        localStorage.setItem(
          `emptyFolders_${account}`,
          JSON.stringify(Array.from(emptyFolders))
        );
      } catch (e) {
        console.error("Failed to save emptyFolders to localStorage:", e);
      }
    } else if (account && emptyFolders.size === 0) {
      // Clear localStorage if no empty folders
      try {
        localStorage.removeItem(`emptyFolders_${account}`);
      } catch (e) {
        console.error("Failed to clear emptyFolders from localStorage:", e);
      }
    }
  }, [emptyFolders, account]);

  // Load emptyFolders from localStorage when account changes
  useEffect(() => {
    if (account) {
      try {
        const stored = localStorage.getItem(`emptyFolders_${account}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          setEmptyFolders(new Set(parsed));
        } else {
          setEmptyFolders(new Set());
        }
      } catch (e) {
        console.error("Failed to load emptyFolders from localStorage:", e);
        setEmptyFolders(new Set());
      }
    } else {
      setEmptyFolders(new Set());
    }
  }, [account]);

  // Remove folders from emptyFolders when files are added to them
  useEffect(() => {
    if (files.length > 0 && emptyFolders.size > 0) {
      setEmptyFolders(prev => {
        const updated = new Set(prev);
        let changed = false;

        // For each file, check if its folder path is in emptyFolders
        files.forEach(file => {
          const folderPath = file.folder_path === "/" ? "/" : file.folder_path;
          
          // Remove the exact folder path and all parent paths from emptyFolders
          // (since they now contain files)
          const parts = folderPath.split("/").filter(Boolean);
          let currentPath = "";
          
          for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
            if (updated.has(currentPath)) {
              updated.delete(currentPath);
              changed = true;
            }
          }
        });

        return changed ? updated : prev;
      });
    }
  }, [files]);

  // Presentational components are moved to AppLayout

  function handleCreateFolder() {
    if (!newFolderName.trim()) return;

    const cleanName = newFolderName.trim();
    setUploadMode("folder");

    // Calculate full path of new folder
    const fullPath = currentPath === "/"
      ? `/${cleanName}`
      : `${currentPath}/${cleanName}`;

    // Add to empty folders set
    setEmptyFolders(prev => {
      const updated = new Set(prev);
      updated.add(fullPath);
      return updated;
    });

    setFileTree((prevTree) => {
      if (!prevTree) {
        // If no tree exists, create root
        const root = { name: "/", type: "folder", children: [] };
        if (currentPath === "/") {
          root.children.push({
            name: cleanName,
            type: "folder",
            children: [],
          });
        }
        return root;
      }

      const newTree = structuredClone(prevTree); // safe deep copy

      // Navigate to the correct node based on currentPath
      const parts = currentPath === "/"
        ? []
        : currentPath.split("/").filter(Boolean);

      let node = newTree;

      for (const p of parts) {
        node = node.children.find(
          (c) => c.type === "folder" && c.name === p
        );

        if (!node) return prevTree; // safety: don't crash
      }

      // Check if folder already exists
      const folderExists = node.children.some(
        c => c.type === "folder" && c.name === cleanName
      );

      if (!folderExists) {
        // Create the new folder (ONLY FRONTEND)
        node.children.push({
          name: cleanName,
          type: "folder",
          children: [],
        });
      }

      return newTree;
    });

    setNewFolderName("");
  }

  return (
    <AppLayout
      account={account}
      connectWallet={connectWallet}
      fileTree={fileTree}
      currentPath={currentPath}
      setCurrentPath={setCurrentPath}
      getFolderContents={getFolderContents}
      API_BASE_URL={API_BASE_URL}
      uploadFile={uploadFile}
      setUploadMode={setUploadMode}
      newFolderName={newFolderName}
      setNewFolderName={setNewFolderName}
      handleCreateFolder={handleCreateFolder}
      handleShare={handleShare}
      handleUnshare={handleUnshare}
      handleDelete={handleDelete}
    />
  );
}

export default App;