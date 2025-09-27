import React, { useState } from "react";

function App() {
  const [account, setAccount] = useState("");
  const [cid, setCid] = useState("");

  async function connectWallet() {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({
          method: "eth_requestAccounts",
        });
        setAccount(accounts[0]); // first account
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
    setCid(data.cid);
    alert(`File uploaded! CID: ${data.cid}`);
  }

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h1>Connect your Metamask wallet</h1>

      <button onClick={connectWallet}>
        <p> {account ? `Connected: ${account}` : "Connect MetaMask" } </p>
      </button>

      <form onSubmit={uploadFile} style={{ marginTop: "20px" }}>
        <input type="file" />
        <button type="submit">Upload</button>
      </form>
      
    </div>
  );
}

export default App;

