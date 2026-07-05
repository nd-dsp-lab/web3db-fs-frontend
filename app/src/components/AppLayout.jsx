import React, { useState, useCallback } from "react";
import FileContextMenu from "./FileContextMenu";

export default function AppLayout({
  account, connectWallet, disconnectWallet, displayItems, currentPath, setCurrentPath,
  uploadFile, setUploadMode, handleCreateFolder, handleDelete, handleMove,
  handleShare, handleUnshare, fileTree, API_BASE_URL,
  view, setView, searchQuery, setSearchQuery, darkMode
}) {
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [draggedFile, setDraggedFile] = useState(null);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, file }

  const downloadFile = async (file) => {
    if (!account) {
      alert("Connect wallet first");
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE_URL}/download/${file.cid}/${encodeURIComponent(file.filename)}?user_address=${encodeURIComponent(account)}`,
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

  const theme = {
    bg: darkMode ? "#121212" : "#F7F9FC",
    card: darkMode ? "#1E1E1E" : "white",
    text: darkMode ? "#E8EAED" : "#3c4043",
    border: darkMode ? "#3C4043" : "#ddd",
    searchBg: darkMode ? "#2D2E30" : "#f1f3f4"
  };

  // --- DRAG AND DROP LOGIC ---
  const onFileDragStart = (file) => {
    setDraggedFile({ cid: file.cid, name: file.name, fromPath: currentPath });
  };

  const onFolderDrop = async (e, targetFolderName) => {
    e.preventDefault();
    if (!draggedFile) return;
    
    const targetPath = currentPath === "/" ? `/${targetFolderName}` : `${currentPath}/${targetFolderName}`;
    const destination = `${targetPath}/${draggedFile.name}`;
    
    await handleMove(draggedFile.cid, destination);
    setDraggedFile(null);
  };

  const triggerUpload = (mode) => {
    setUploadMode(mode);
    setIsNewMenuOpen(false);
    setTimeout(() => {
      const id = mode === "folder" ? "folderIn" : "fileIn";
      document.getElementById(id)?.click();
    }, 10);
  };

  return (
    <div style={{ display: "flex", height: "100vh", backgroundColor: theme.bg, fontFamily: "sans-serif" }}>
      {/* SIDEBAR */}
      <aside style={{ width: "250px", padding: "16px" }}>
        <div 
          style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "30px", cursor: "pointer" }} 
          onClick={() => { setView("my-drive"); setCurrentPath("/"); setSearchQuery(""); }}
        >
          <div style={{ backgroundColor: "#4285F4", color: "white", padding: "4px 8px", borderRadius: "4px", fontWeight: "bold" }}>Δ</div>
          <span style={{ fontSize: "22px", color: theme.text }}>Drive</span>
        </div>

        <div style={{ position: "relative" }}>
          <button 
            style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 24px", borderRadius: "24px", border: "1px solid " + theme.border, cursor: "pointer", backgroundColor: theme.card, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}
            onClick={() => setIsNewMenuOpen(!isNewMenuOpen)}
          >
            <span style={{ color: "#4285F4", fontSize: "24px" }}>+</span> <span style={{color: theme.text, fontWeight: "500"}}>New</span>
          </button>

          {isNewMenuOpen && (
            <div style={{ position: "absolute", top: "55px", left: "0", width: "180px", backgroundColor: theme.card, border: "1px solid " + theme.border, borderRadius: "8px", zIndex: 100, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", padding: "8px 0" }}>
              <div style={{ padding: "10px 20px", cursor: "pointer", color: theme.text }} onClick={() => { const n = prompt("Folder name"); if(n) handleCreateFolder(n); setIsNewMenuOpen(false); }}>📁 New folder</div>
              <hr style={{ border: "0", borderTop: "1px solid " + theme.border }} />
              <div style={{ padding: "10px 20px", cursor: "pointer", color: theme.text }} onClick={() => triggerUpload("single")}>📄 File upload</div>
              <div style={{ padding: "10px 20px", cursor: "pointer", color: theme.text }} onClick={() => triggerUpload("folder")}>📂 Folder upload</div>
            </div>
          )}
        </div>
        
        <nav style={{ marginTop: "20px" }}>
            <div style={{ padding: "10px 20px", cursor: "pointer", borderRadius: "0 20px 20px 0", backgroundColor: view === "my-drive" ? "#E2EEFF" : "transparent", color: view === "my-drive" ? "#1a73e8" : theme.text, fontWeight: "500" }} onClick={() => {setView("my-drive"); setSearchQuery("");}}>🏠 My Drive</div>
            <div style={{ padding: "10px 20px", cursor: "pointer", borderRadius: "0 20px 20px 0", backgroundColor: view === "shared" ? "#E2EEFF" : "transparent", color: view === "shared" ? "#1a73e8" : theme.text, fontWeight: "500" }} onClick={() => {setView("shared"); setSearchQuery("");}}>👥 Shared</div>
        </nav>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main style={{ flex: 1, margin: "8px", backgroundColor: theme.card, borderRadius: "16px", border: "1px solid " + theme.border, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <header style={{ height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", borderBottom: "1px solid " + theme.border }}>
          <input 
            type="text" 
            placeholder="Search in Drive" 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: "60%", padding: "12px 20px", borderRadius: "24px", border: "none", backgroundColor: theme.searchBg, color: theme.text, outline: "none" }}
          />
          <button onClick={account ? disconnectWallet : connectWallet} style={{ backgroundColor: "#1a73e8", color: "white", border: "none", padding: "10px 20px", borderRadius: "24px", cursor: "pointer", fontWeight: "500" }}>
            {account ? `${account.slice(0,6)}...${account.slice(-4)}` : "Connect Wallet"}
          </button>
        </header>

        <div style={{ padding: "16px 24px", flex: 1, overflowY: "auto" }}>
          <h2 style={{ fontSize: "18px", color: theme.text, marginBottom: "20px" }}>
            {searchQuery ? `Results for "${searchQuery}"` : currentPath === "/" ? "My Drive" : `My Drive > ${currentPath}`}
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid " + theme.border, textAlign: "left", color: "#5f6368", fontSize: "13px" }}>
                <th style={{ padding: "10px", fontWeight: "500" }}>Name</th>
                <th style={{ fontWeight: "500" }}>Type</th>
                <th style={{ textAlign: "right", fontWeight: "500", paddingRight: "20px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayItems && displayItems.length > 0 ? displayItems.map((item, i) => (
                <tr 
                  key={i} 
                  draggable={item.type === 'file'}
                  onDragStart={() => item.type === 'file' && onFileDragStart(item)}
                  onDragOver={(e) => { if(item.type === 'folder') e.preventDefault(); }}
                  onDrop={(e) => item.type === 'folder' && onFolderDrop(e, item.name)}
                  style={{ 
                    borderBottom: "1px solid " + theme.border, 
                    // KEY CURSOR LOGIC HERE
                    cursor: item.type === 'folder' ? "pointer" : "context-menu" 
                  }} 
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = darkMode ? "#2d2e30" : "#f8f9fa"} 
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                >
                  <td 
                    style={{ padding: "12px 10px", color: theme.text, display: "flex", alignItems: "center", gap: "12px" }} 
                    onClick={() => item.type === 'folder' && setCurrentPath(currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`)}
                  >
                    <span style={{ fontSize: "20px" }}>{item.type === 'folder' ? "📁" : "📄"}</span> {item.name}
                  </td>
                  <td style={{ fontSize: "13px", color: "#5f6368" }}>{item.type}</td>
                  <td style={{ textAlign: "right", paddingRight: "20px" }}>
                    {item.type === 'file' && (
                      <button
                        onClick={(e) => setContextMenu({ x: e.clientX, y: e.clientY, file: item })}
                        style={{ background: "none", border: "none", color: "#5f6368", fontSize: "18px", cursor: "pointer" }}
                      >⋮</button>
                    )}
                  </td>
                </tr>
              )) : (
                <tr>
                    <td colSpan="3" style={{ textAlign: "center", padding: "40px", color: "#5f6368" }}>
                        {searchQuery ? "No matching files found." : "Nothing to show here"}
                    </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      <input type="file" id="fileIn" style={{ display: "none" }} onChange={uploadFile} />
      <input type="file" id="folderIn" webkitdirectory="true" directory="" multiple style={{ display: "none" }} onChange={uploadFile} />

      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          file={contextMenu.file}
          fileTree={fileTree}
          currentPath={currentPath}
          onClose={() => setContextMenu(null)}
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