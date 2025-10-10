import React, { useState, useEffect, useCallback } from "react";

function App() {
  const [account, setAccount] = useState(null);
  const [files, setFiles] = useState([]);

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

  async function uploadFile(event) {
    event.preventDefault();
    const fileInput = event.target.querySelector('input[type="file"]');
    const file = fileInput?.files[0];
    if (!file) {
      alert("Please select a file first!");
      return;
    }
    if (!account) {
      alert("Please connect your wallet first!");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("user_address", account);

    const response = await fetch("http://localhost:8000/upload", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    alert(`File uploaded! CID: ${data.cid}, and txn_hash: ${data.txn_hash}`);
    
    // Refresh the files list after upload
    retrieveFiles();
  }

  const retrieveFiles = useCallback(async () => {
    if (!account) return;
    try {
      const response = await fetch(`http://localhost:8000/`);
      const data = await response.json();
      console.log("Retrieved files data:", data);
      setFiles(data.user_files || []);
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

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h1>Connect your Metamask wallet</h1>
      <button onClick={connectWallet}>
        <p>{account ? `Connected: ${account}` : "Connect MetaMask"}</p>
      </button>

      <div style={{ marginTop: "20px" }}>
        <h2>Files:</h2>
        {!files || files.length === 0 ? (
          <p>No files found.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {files.map((file, index) => (
              <li key={index}>{file}</li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={uploadFile} style={{ marginTop: "20px" }}>
        <input type="file" />
        <button type="submit">Upload</button>
      </form>
    </div>
  );
}

export default App;
