import React, { useState, useCallback } from "react";
import { DOWNLOAD } from "../utils/permissions";
import FileContextMenu from "./FileContextMenu";

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

export default function AppLayout({
  account,
  connectWallet,
  fileTree,
  currentPath,
  setCurrentPath,
  getFolderContents,
  API_BASE_URL,
  uploadFile,
  setUploadMode,
  newFolderName,
  setNewFolderName,
  handleCreateFolder,
  handleShare,
  handleUnshare,
  handleDelete,
  handleMove
}) {
  const [contextMenu, setContextMenu] = useState(null);

  const openContextMenu = useCallback((e, file) => {
    e.preventDefault();
    setContextMenu({x: e.clientX, y: e.clientY, file});
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const downloadFile = async (file) => {
    if (!account) {
      alert("Connect wallet first");
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE_URL}/download/${file.cid}/${encodeURIComponent(
          file.filename
        )}?user_address=${encodeURIComponent(account)}`,
        { headers: { "ngrok-skip-browser-warning": "true" } }
      );
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || "Download failed");
    }
  };

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
              <p style={{ fontSize: "0.8em", color: "#999", marginTop: "-8px", marginBottom: "12px" }}>
                Right-click a file for options
              </p>
              {getFolderContents(fileTree, currentPath)
                .filter((item) => item.type === "file")
                .map((file, index) => {
                  let sharedList = file.shared_with;
                  if (!Array.isArray(sharedList)) sharedList = [];
                  if (sharedList.length > 0 && typeof sharedList[0] === "object") {
                    sharedList = sharedList.map(
                      (s) => s.address || s.to || s.owner || JSON.stringify(s)
                    );
                  }
                  const hasShared = Array.isArray(sharedList) && sharedList.length > 0;
                  const ownerAddress =
                    file.shared_by ||
                    file.owner_address ||
                    file.owner ||
                    file.ownerAddress ||
                    file.ownerAccount;

                  const isSelected = contextMenu?.file?.cid === file.cid;
                  return (
                    <div
                      key={index}
                      onContextMenu={(e) => openContextMenu(e, file)}
                      style={{
                        border: `1px solid ${isSelected ? "#aac4f5" : "#e0e0e0"}`,
                        borderRadius: "6px",
                        padding: "10px",
                        marginBottom: "10px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: isSelected ? "#f0f5ff" : "#fff",
                        cursor: "context-menu",
                        userSelect: "none",
                      }}
                    >
                      <div>
                        <strong>{file.name}</strong>
                        <div style={{ fontSize: "0.85em", color: "#666" }}>
                          CID: {file.cid}
                        </div>
                        {hasShared && file.is_owner && (
                          <div
                            style={{ fontSize: "0.8em", color: "#444", marginTop: "6px" }}
                          >
                            Shared with: {sharedList.join(", ")}
                          </div>
                        )}
                        {!file.is_owner && ownerAddress && (
                          <div
                            style={{ fontSize: "0.8em", color: "#444", marginTop: "6px" }}
                          >
                            Shared by: {ownerAddress}
                          </div>
                        )}
                      </div>
                    <div style={{ color: "#ccc", fontSize: "1.2em", paddingRight: "4px" }}>
                       ⋮
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
            onChange={() => setUploadMode("single")}
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
            onChange={() => setUploadMode("folder")}
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
      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          file={contextMenu.file}
          fileTree={fileTree}
          currentPath={currentPath}
          onClose={closeContextMenu}
          onDownload={downloadFile}
          onShare={handleShare}
          onUnshare={handleUnshare}
          onDelete={handleDelete}
          onMove={handleMove}
        />
      )}
    </div> 
  );
}
