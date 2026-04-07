import React, { useState, useCallback } from "react";
import { DOWNLOAD } from "../utils/permissions";
import FileContextMenu from "./FileContextMenu";

function FolderNode({
  node,
  parentPath,
  currentPath,
  setCurrentPath,
  dragOverPath,
  setDragOverPath,
  onFolderDrop,
}) {
  const fullPath = `${parentPath}/${node.name}`;
  const isDragOver = dragOverPath === fullPath;

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOverPath(fullPath);
  };

  const handleDragLeave = () => {
    if (dragOverPath === fullPath) {
      setDragOverPath(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOverPath(null);
    onFolderDrop(fullPath);
  };

  return (
    <div style={{ marginLeft: "10px" }}>
      <div
        onClick={() => setCurrentPath(fullPath)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          padding: "4px 6px",
          border: `1px solid ${isDragOver ? "#4a90e2" : "#ddd"}`,
          borderRadius: "4px",
          background: isDragOver
            ? "#eaf3ff"
            : currentPath === fullPath
            ? "#f0f0f0"
            : "#fff",
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
            dragOverPath={dragOverPath}
            setDragOverPath={setDragOverPath}
            onFolderDrop={onFolderDrop}
          />
        ))}
    </div>
  );
}

export default function AppLayout({
  account,
  connectWallet,
  disconnectWallet,
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
  handleDeleteFolder,
}) {
  const [contextMenu, setContextMenu] = useState(null);
  const [draggedFile, setDraggedFile] = useState(null);
  const [dragOverPath, setDragOverPath] = useState(null);

  const openContextMenu = useCallback((e, file) => {
    e.preventDefault();
    setContextMenu({x: e.clientX, y: e.clientY, file});
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const onFileDragStart = useCallback((file) => {
    const filename = file.filename || file.name;
    if (!filename || !file.cid) return;
    setDraggedFile({ cid: file.cid, filename, fromPath: currentPath });
  }, [currentPath]);

  const onFileDragEnd = useCallback(() => {
    setDraggedFile(null);
    setDragOverPath(null);
  }, []);

  const onFolderDrop = useCallback(async (targetPath) => {
    if (!draggedFile?.cid || !draggedFile?.filename) return;

    const normalizedTargetPath = targetPath || "/";
    const nextPath =
      normalizedTargetPath === "/"
        ? `/${draggedFile.filename}`
        : `${normalizedTargetPath}/${draggedFile.filename}`;

    const currentFilePath =
      draggedFile.fromPath === "/"
        ? `/${draggedFile.filename}`
        : `${draggedFile.fromPath}/${draggedFile.filename}`;

    if (nextPath === currentFilePath) {
      setDraggedFile(null);
      setDragOverPath(null);
      return;
    }

    await handleMove(draggedFile.cid, nextPath);
    setDraggedFile(null);
    setDragOverPath(null);
  }, [draggedFile, handleMove]);

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
      <div>

      { account ? 
        <>
          <button style={{ margin: "20px" }}>  
            <p>
              {`Connected: ${account}`}
            </p>
          </button>
          <button onClick={disconnectWallet} style={{ margin: "20px" }}>
            <p>Disconnect Wallet</p>
          </button>
        </>
        :
        <>
          <button onClick={()=>connectWallet("MetaMask")} style={{ margin: "20px" }}>
            <p>Connect MetaMask</p>
          </button>
          <button onClick={()=>connectWallet("Coinbase")} style={{ margin: "20px" }}>
            <p>Connect Coinbase</p>
          </button>
        </>
      }
      </div>

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
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverPath("/");
                }}
                onDragLeave={() => {
                  if (dragOverPath === "/") setDragOverPath(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverPath(null);
                  onFolderDrop("/");
                }}
                style={{
                  padding: "6px 8px",
                  border: `1px solid ${dragOverPath === "/" ? "#4a90e2" : "#ddd"}`,
                  borderRadius: "4px",
                  background:
                    dragOverPath === "/"
                      ? "#eaf3ff"
                      : currentPath === "/"
                      ? "#f0f0f0"
                      : "#fff",
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
                    dragOverPath={dragOverPath}
                    setDragOverPath={setDragOverPath}
                    onFolderDrop={onFolderDrop}
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
                      draggable={true}
                      onDragStart={() => onFileDragStart(file)}
                      onDragEnd={onFileDragEnd}
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
                        opacity: draggedFile?.cid === file.cid ? 0.6 : 1,
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
        {/*Folder deletion*/ }
        <div className="delete-folder" style={{ marginBottom: "5px" }}>
          <button 
            type="button" 
            onClick={async (e) => {
              e.preventDefault(); // This stops the 'upload' from firing
              const ok = window.confirm(`Delete current folder "${currentPath}"? This will delete all files inside.`);
              if (!ok) return;
              await handleDeleteFolder(currentPath);
            }}
          >
            Delete Current Folder
          </button>
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