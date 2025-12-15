import React, { useState, useEffect, useCallback } from "react";

// Bitmasks for permissions
const READ = 1 << 0
const WRITE = 1 << 1
const DOWNLOAD = 1<< 2
const DELETE = 1 << 3
const SHARE = 1 << 4
const MOVE = 1 << 5
const CHANGE_OWNER = 1 << 6
const CHANGE_ROLE = 1 << 7 

function App() {
  // const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "https://64e2c4b2e6e8.ngrok-free.app";
  // ------ REMEMBER TO SWITCH THIS BACK BEFORE PUSHING ---------
  const API_BASE_URL = "http://localhost:8090";  // for testing

  const [account, setAccount] = useState(null);
  const [files, setFiles] = useState([]);
  const [fileTree, setFileTree] = useState(null);
  const [currentPath, setCurrentPath] = useState("/");
  const [folderPath, setFolderPath] = useState("/");
  const [uploadMode, setUploadMode] = useState("single");
  const [newFolderName, setNewFolderName] = useState("");

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

  // // Build a tree from files array
  // function buildFileTree(files) {
  //   const root = { name: "/", type: "folder", children: [] };

  //   for (const file of files) {
  //     const path = file.folder_path || "/";
  //     const parts = path.split("/").filter(Boolean); // split by "/" and remove empty strings

  //     // 1) File is in root -> no folder parts needed
  //     if (parts.length === 0) {
  //       root.children.push({
  //         ...file,
  //         type: "file",
  //         name: file.filename,
  //       });
  //       continue;
  //     }

  //     // OR 2) File is inside subfolders
  //     let currentNode = root;

  //     for (let i = 0; i < parts.length; i++) {
  //       const part = parts[i];

  //       // Check if this is the last part and contains a file (has a dot)
  //       const isLast = i === parts.length - 1;
  //       const isFile = isLast && file.filename.includes(".");

  //       if (isFile) {
  //         currentNode.children.push({
  //           ...file,
  //           type: "file",
  //           name: file.filename,
  //         });
  //       } else {
  //         // Look for existing folder node
  //         let folderNode = currentNode.children.find(
  //           (c) => c.type === "folder" && c.name === part
  //         );
  //         if (!folderNode) {
  //           folderNode = { name: part, type: "folder", children: [] };
  //           currentNode.children.push(folderNode);
  //         }
  //         currentNode = folderNode;
  //       }
  //     }
  //   }
  //   return root;
  // }

   // Build a tree from files array
  function buildFileTree(files) {
    const root = { name: "/", type: "folder", children: [] };

    for (const file of files) {
      const path = file.folder_path || "/";
      // Clean the path: remove leading/trailing slashes, then split and filter
      const cleanPath = path.replace(/^\/+|\/+$/g, '');
      const parts = cleanPath ? cleanPath.split("/").filter(Boolean) : [];

      // 1) File is in root -> no folder parts needed
      if (parts.length === 0) {
        root.children.push({
          ...file,
          type: "file",
          name: file.filename,
        });
        continue;
      }

      // 2) File is inside subfolders - navigate/create the folder structure
      let currentNode = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];

        // Look for existing folder node
        let folderNode = currentNode.children.find(
          (c) => c.type === "folder" && c.name === part
        );
        if (!folderNode) {
          folderNode = { name: part, type: "folder", children: [] };
          currentNode.children.push(folderNode);
        }
        currentNode = folderNode;
      }

      // After navigating through all folders, add the file
      currentNode.children.push({
        ...file,
        type: "file",
        name: file.filename,
      });
    }
    return root;
  }

  // Get folder contents (files + subfolders)
  function getFolderContents(tree, path) {
    if (!tree) return [];

    if (path === "/" || path === "") {
      return tree.children;
    }

    const parts = path.split("/").filter(Boolean);
    let node = tree;
    for (const part of parts) {
      node = node?.children.find((c) => c.type === "folder" && c.name === part);
      if (!node) return [];
    }

    return node.children || [];
  }

  async function ensureSepolia() {
    const SEPOLIA_CHAIN_ID = '0xaa36a7'; // 11155111 in hex

    try {
      const currentChainId = await window.ethereum.request({ method: "eth_chainId" });
      if (currentChainId !== SEPOLIA_CHAIN_ID) {
        try {
          // try to switch to sepolia
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: SEPOLIA_CHAIN_ID }],
          });
          console.log("Swithched to Sepolia");
        } catch (switchError) {
          // sepolia isn't added to metamask
          console.error("Cannot find Sepolia in wallet", switchError);
          // ADD CODE TO TRY AND ADD SEPOLIA TO METAMASK HERE
        }
      } else {
        console.log("Already on Sepolia");
      }
    } catch (err) {
      console.error("Couldn't ensure Sepolia network:", err);
    }
  }

  // need to be able to convert numeric txn fields to hex for MetaMask
  function toHexifNumber(input) {
    if (input === undefined || input === null) return input;
    if (typeof input === "string" && input.startsWith("0x")) return input;
    const n = typeof input === "number" ? input : parseInt(input.toString(), 10);
    if (Number.isNaN(n)) return input;
    return "0x" + n.toString(16);
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
      const fields = {...txn};
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
      if(err?.code === 4001) {
        alert("Transaction rejected by user");
      } else {
        alert("Share failed: " + (err?.message || err?.reason || err.toString()) );
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
      const fields = {...txn};
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
      if(err?.code === 4001) {
        alert("Transaction rejected by user");
      } else {
        alert("Unshare failed: " + (err?.message || err?.reason || err.toString()) );
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
    if (!files || files.length === 0) {
      alert("Please select a file or folder first!");
      return;
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

      if (!data.transaction) {
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
        alert("Upload successful!");
        retrieveFiles();
      }
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Upload failed: " + (error.message || "Unknown error"));
    }
  }  // <-- Close uploadFile function here (remove the extra closing braces above)

  async function handleTransaction(data) {
    try {
      await ensureSepolia();

      const transaction = {
        ...data.transaction,
        gas: data.transaction.gas
          ? `0x${data.transaction.gas.toString(16)}`
          : data.transaction.gas,
        gasPrice: data.transaction.gasPrice
          ? `0x${data.transaction.gasPrice.toString(16)}`
          : data.transaction.gasPrice,
        nonce: data.transaction.nonce
          ? `0x${data.transaction.nonce.toString(16)}`
          : data.transaction.nonce,
        value: data.transaction.value || "0x0",
      };

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

      const fields = {...txn};
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
      if(err?.code === 4001) {
        alert("Transaction rejected by user");
      } else {
        alert("Delete failed: " + (err?.message || err?.reason || err.toString()) );
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

      const fileTree = buildFileTree(filesWithShared);
      console.log("Built file tree:", fileTree);

      setFileTree(fileTree);

    } catch (err) {
      console.error("Error retrieving files:", err);
      setFiles([]);
    }
  }, [account, API_BASE_URL]);

  // derive the tree whenever files change
  // useEffect(() => {
  //   setFileTree(buildFileTree(files));
  // }, [files]);

    useEffect(() => {
      if (account) {
        retrieveFiles();
      }
    }, [account, retrieveFiles]);
    
    function FolderNode({ node, parentPath, currentPath, setCurrentPath }) {
      const fullPath = `${parentPath}/${node.name}`;
      return (
        <div style={{ marginLeft: "10px" }}>
          <div
            onClick={() => setCurrentPath(fullPath)}
            style={{
              padding: "4px 6px",
              border: "1px solid #ddd",
              borderRadius: "4px",
              background: currentPath === fullPath ? "#f0f0f0" : "#fff",
              cursor: "pointer",
              marginBottom: "2px",
            }}
          >
            {node.name}
          </div>
          {node.children
            .filter((c) => c.type === "folder")
            .map((child) => (
              <FolderNode
                key={child.name}
                node={child}
                parentPath={fullPath}
                currentPath={currentPath}
                setCurrentPath={setCurrentPath}
              />
            ))}
        </div>
      );
    }

  function handleCreateFolder() {
    if (!newFolderName.trim()) return;

    const cleanName = newFolderName.trim();

    setFileTree((prevTree) => {
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

      // Create the new folder (ONLY FRONTEND)
      node.children.push({
        name: cleanName,
        type: "folder",
        children: [],
      });

      return newTree;
    });

    setNewFolderName("");
  }

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          minHeight: "100vh",
          padding: "40px 20px",
          backgroundColor: "#fafafa",
        }}
      >
        <h1 style={{ marginBottom: "20px" }}>Connect your Metamask wallet</h1>

      <button onClick={connectWallet} style={{ marginBottom: "20px" }}>
        <p>{account ? `Connected: ${account}` : "Connect MetaMask"}</p>
      </button>

      <div style={{ width: "100%", maxWidth: "1000px" }}>

        {fileTree ? (
          <div
            style={{
              display: "flex",
              gap: "30px",
              alignItems: "flex-start",
              justifyContent: "center",
              textAlign: "left",
              marginTop: "10px",
            }}
          >
            {/* LEFT PANEL — Folders */}
            <div>
              <h3>Folders</h3>
              <div
                onClick={() => setCurrentPath("/")}
                style={{
                  padding: "6px 8px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  background: currentPath === "/" ? "#f0f0f0" : "#fff",
                  cursor: "pointer",
                  marginBottom: "5px",
                }}
              >
                /
              </div>

              {fileTree.children
                .filter((c) => c.type === "folder")
                .map((folder) => (
                  <FolderNode
                    key={folder.name}
                    node={folder}
                    parentPath=""
                    currentPath={currentPath}
                    setCurrentPath={setCurrentPath}
                  />
                ))}
            </div>

            {/* RIGHT COLUMN — Files */}
            <div style={{ flex: "1", minHeight: "400px" }}>
              <h3>Files in {currentPath}</h3>
              {getFolderContents(fileTree, currentPath)
                .filter((item) => item.type === "file")
                .map((file, index) => {
                  
                  let sharedList = file.shared_with
                  if (!Array.isArray(sharedList)) sharedList = [];
                  if (sharedList.length > 0 && typeof sharedList[0] === "object") {
                    sharedList = sharedList.map(s => s.address || s.to || s.owner || JSON.stringify(s));
                  }
                  const hasShared = Array.isArray(sharedList) && sharedList.length > 0;

                  return (
                    <div
                      key={index}
                      style={{
                        border: "1px solid #e0e0e0",
                        borderRadius: "6px",
                        padding: "10px",
                        marginBottom: "10px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <strong>{file.name}</strong>
                        <div style={{ fontSize: "0.85em", color: "#666" }}>
                          CID: {file.cid}
                        </div>
                        {hasShared && (
                          <div style={{ fontSize: "0.8em", color: "#444", marginTop: "6px" }}>
                            Shared with: {sharedList.join(", ")}
                          </div>
                        )}
                      </div>

                      {/* Button container */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" }}>
                        {/* Top row: Download + Share */}
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>

                          {/* DOWNLOAD — only if user has DOWNLOAD permission */}
                          {(file.permissions & DOWNLOAD) !== 0 && (
                            <a
                              href={`${API_BASE_URL}/download/${file.cid}/${encodeURIComponent(file.filename)}`}
                              download={file.filename}
                              style={{
                                color: "#0066cc",
                                textDecoration: "none",
                                border: "1px solid #0066cc",
                                borderRadius: "4px",
                                padding: "4px 8px",
                                fontSize: "0.85em",
                              }}
                            >
                              Download
                            </a>
                          )}

                          {/* SHARE — only if user is owner */}
                          {file.is_owner && (
                            <button
                              onClick={async () => {
                                const to = window.prompt("Enter recipient Ethereum address (0x...)");
                                if (!to) return;
                                await handleShare(file.cid, to);
                              }}
                              style={{
                                background: "#00a86b",
                                color: "#fff",
                                border: "none",
                                borderRadius: "4px",
                                padding: "6px 10px",
                                cursor: "pointer",
                                fontSize: "0.85em",
                              }}
                            >
                              Share
                            </button>
                          )}
                        </div>

                        {/* Bottom row: Unshare + Delete */}
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>

                          {/* UNSHARE — only if shared_with is non-empty AND user is owner */}
                          {file.is_owner && hasShared && (
                            <button
                              onClick={async () => {
                                let addrToUnshare = null;
                                if (sharedList.length === 1) {
                                  const ok = window.confirm(`Unshare file "${file.filename}" with ${sharedList[0]}?`);
                                  if (!ok) return;
                                  addrToUnshare = sharedList[0];
                                } else {
                                  const listText = sharedList.join(", ");
                                  const promptMsg = `File "${file.filename}" is shared with: ${listText}\n\nEnter the address to unshare:`;
                                  const chosen = window.prompt(promptMsg);
                                  if (!chosen) return;
                                  addrToUnshare = chosen.trim();
                                }
                                await handleUnshare(file.cid, addrToUnshare);
                              }}
                              style={{
                                background: "#ff9800",
                                color: "#fff",
                                border: "none",
                                borderRadius: "4px",
                                padding: "6px 10px",
                                cursor: "pointer",
                                fontSize: "0.85em",
                              }}
                            >
                              Unshare
                            </button>
                          )}

                          {/* DELETE — only if owner */}
                          {file.is_owner && (
                            <button
                              onClick={async () => {
                                const ok = window.confirm(`Delete file "${file.filename}" (CID: ${file.cid})?`);
                                if (!ok) return;
                                await handleDelete(file.cid);
                              }}
                              style={{
                                background: "#d9534f",
                                color: "#fff",
                                border: "none",
                                borderRadius: "4px",
                                padding: "6px 10px",
                                cursor: "pointer",
                                fontSize: "0.85em",
                              }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ) : (
          <p>No files found.</p>
        )}
      </div>

      {/* Upload form centered below everything */}
      <form onSubmit={uploadFile} style={{ marginTop: "30px", textAlign: "center" }}>
      {/* Single file upload */}
      <div style={{ marginBottom: "10px" }}>
        <input
          id="singleFileInput"
          type="file"
          style={{ marginRight: "10px" }}
          onChange={(e) => setUploadMode("single")}
        />
        <button type="submit">Upload File</button>
      </div>

        {/* Folder upload */}
        <div style={{ marginBottom: "10px" }}>
          <input
            id="folderInput"
            type="file"
            webkitdirectory="true"
            directory=""
            multiple
            style={{ marginRight: "10px" }}
            onChange={(e) => setUploadMode("folder")}
          />
          <button type="submit">Upload Folder</button>
        </div>

        <div className="create-folder" style={{ marginBottom: "10px" }}>
          <input
            value={newFolderName}
            style={{ marginRight: "100px" }}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="New folder name"
          />
          <button onClick={handleCreateFolder}>Create Folder</button>
        </div>
      </form>
    </div>
  );
}

export default App;