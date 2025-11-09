import React, { useState, useEffect, useCallback } from "react";

function App() {
  const [account, setAccount] = useState(null);
  const [files, setFiles] = useState([]);
  const [fileTree, setFileTree] = useState(null);
  const [currentPath, setCurrentPath] = useState("/");
  const [folderPath, setFolderPath] = useState("/");
  const [uploadMode, setUploadMode] = useState("single");

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

  // function buildFileTree(files) {
  // const root = { name: "/", type: "folder", children: [] };

  // for (const file of files) {
  //   const fullPath = file.folder_path || "/";
  //   const parts = fullPath.split("/").filter(Boolean); // ["web3Example", "Copy of Assignment 3 - Answer Sheet.pdf"]
  //   let currentNode = root;

  //   parts.forEach((part, index) => {
  //     const isFile = index === parts.length - 1 && part.includes("."); // last part with a dot is a file
  //     if (isFile) {
  //       currentNode.children.push({
  //         ...file,
  //         type: "file",
  //         name: part,
  //       });
  //     } else {
  //       // folder
  //       let folderNode = currentNode.children.find(
  //         (c) => c.type === "folder" && c.name === part
  //       );
  //       if (!folderNode) {
  //         folderNode = { name: part, type: "folder", children: [] };
  //         currentNode.children.push(folderNode);
  //       }
  //       currentNode = folderNode;
  //     }
  //   });
  // }
  //   return root;
  // }

  // function getFolderContents(tree, path) {
  //   if (!tree) return [];

  //   if (path === "/" || path === "") {
  //     return tree.children.filter(item => item.type === "file");
  //   }

  //   const parts = path.split("/").filter(Boolean);
  //   let node = tree;
  //   for (const part of parts) {
  //     node = node?.children.find(c => c.name === part && c.type === "folder");
  //     if (!node) return [];
  //   }
  //   return node.children || [];
  // }

  // Build a tree from files array
function buildFileTree(files) {
  const root = { name: "/", type: "folder", children: [] };

  for (const file of files) {
    const path = file.folder_path || "/";
    const parts = path.split("/").filter(Boolean); // split by "/" and remove empty strings

    let currentNode = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      // Check if this is the last part and contains a file (has a dot)
      const isFile = i === parts.length - 1 && file.filename.includes(".");

      if (isFile) {
        currentNode.children.push({
          ...file,
          type: "file",
          name: file.filename,
        });
      } else {
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
    }
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
    formData.append("user_address", account);

    if (uploadMode === "folder") {
      // For multiple files inside a folder
      for (const file of files) {
        const relativePath = file.webkitRelativePath || file.name; // e.g. "web3Example/file.pdf"
        console.log("Relative Path:", relativePath);
        const pathParts = relativePath.split("/"); 
        console.log("Path Parts:", pathParts);
        const folderPath = "/" + pathParts.slice(0, -1).join("/"); // e.g. "/web3Example"
        console.log("Folder Path:", folderPath);
        formData.append("files", file);
        formData.append("paths", folderPath);
      }
    } else {
      // For a single file upload
      const file = files[0];
      formData.append("file", file);
      formData.append("folder_path", "/"); // or currentPath if you track that
    }

    const endpoint =
      uploadMode === "folder"
        ? "http://localhost:8000/upload-folder"
        : "http://localhost:8000/upload";

    const response = await fetch(endpoint, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();
    console.log("Backend response:", data);

    if (!data.success && !data.transaction) {
      alert("Upload failed");
      return;
    }

    console.log("Transaction data:", data.cid);
    if (uploadMode  && data.cid) {
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

    const verifyResponse = await fetch("http://localhost:8000/verify-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tx_hash: txHash }),
    });

    const verifyData = await verifyResponse.json();
    if (verifyData.success) {
      alert(`File successfully stored on blockchain! Transaction: ${txHash}`);
      retrieveFiles();
    } else {
      alert(`Transaction failed: ${verifyData.error || "Unknown error"}`);
    }
  } catch (error) {
    console.error("Transaction error:", error);
    if (error.code === 4001) {
      alert("Transaction rejected by user");
    } else {
      alert(`Upload failed: ${error.message || "Unknown error"}`);
    }
  }
  } 

  const retrieveFiles = useCallback(async () => {
    if (!account) return;
    try {
      const response = await fetch(`http://localhost:8000/?user_address=${account}`);
      const data = await response.json();
      console.log("Retrieved files data:", data);
      setFiles(data.user_files || []);
      setFileTree(buildFileTree(data.user_files || []));
    } catch (err) {
      console.error("Error retrieving files:", err);
      setFiles([]);
    }
    }, [account]);

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
                .map((file, index) => (
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
                    </div>

                    <a
                      href={`http://localhost:8000/download/${file.cid}/${encodeURIComponent(
                        file.filename
                      )}`}
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
                  </div>
                ))}
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
        <div>
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
      </form>
    </div>
  );
}

export default App;
