import React from "react";
import { DOWNLOAD } from "../utils/permissions"

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
}) {
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
                  let sharedList = file.shared_with;
                  if (!Array.isArray(sharedList)) sharedList = [];
                  if (sharedList.length > 0 && typeof sharedList[0] === "object") {
                    sharedList = sharedList.map(
                      (s) => s.address || s.to || s.owner || JSON.stringify(s)
                    );
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
                          <div
                            style={{ fontSize: "0.8em", color: "#444", marginTop: "6px" }}
                          >
                            Shared with: {sharedList.join(", ")}
                          </div>
                        )}
                      </div>

                      {/* Button container */}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                          alignItems: "flex-end",
                        }}
                      >
                        {/* Top row: Download + Share */}
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          {/* DOWNLOAD — only if user has DOWNLOAD permission */}
                          {(file.permissions & DOWNLOAD) !== 0 && (
                            <a
                              href={`${API_BASE_URL}/download/${file.cid}/${encodeURIComponent(
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
                          )}

                          {/* SHARE — only if user is owner */}
                          {file.is_owner && (
                            <button
                              onClick={async () => {
                                const to = window.prompt(
                                  "Enter recipient Ethereum address (0x...)"
                                );
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
                                  const ok = window.confirm(
                                    `Unshare file "${file.filename}" with ${sharedList[0]}?`
                                  );
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
                                const ok = window.confirm(
                                  `Delete file "${file.filename}" (CID: ${file.cid})?`
                                );
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
    </div>
  );
}
