// Helper function to merge empty folders into the tree structure
export function mergeEmptyFoldersIntoTree(tree, emptyFoldersSet) {
    if (!emptyFoldersSet || emptyFoldersSet.size === 0) {
      return tree;
    }

    // For each empty folder path, ensure it exists in the tree
    emptyFoldersSet.forEach(folderPath => {
      // Skip root
      if (folderPath === "/" || !folderPath) return;

      // Parse path: "/documents/projects" -> ["documents", "projects"]
      const parts = folderPath.split("/").filter(Boolean);
      if (parts.length === 0) return;

      let currentNode = tree;

      // Navigate/create folder structure
      for (const part of parts) {
        let folderNode = currentNode.children.find(
          c => c.type === "folder" && c.name === part
        );

        // Create folder if it doesn't exist
        if (!folderNode) {
          folderNode = { name: part, type: "folder", children: [] };
          currentNode.children.push(folderNode);
        }

        currentNode = folderNode;
      }
    });

    return tree;
}

// Build a tree from files array and merge empty folders
export function buildFileTree(files, emptyFoldersSet = new Set()) {
    const root = { name: "/", type: "folder", children: [] };

    // Build tree from files
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

    // Merge empty folders into the tree
    return mergeEmptyFoldersIntoTree(root, emptyFoldersSet);
}

// Get folder contents (files + subfolders)
export function getFolderContents(tree, path) {
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

// Web3 helpers

// need to be able to convert numeric txn fields to hex for MetaMask
export function toHexifNumber(input) {
    if (input === undefined || input === null) return input;
    if (typeof input === "string" && input.startsWith("0x")) return input;
    const n = typeof input === "number" ? input : parseInt(input.toString(), 10);
    if (Number.isNaN(n)) return input;
    return "0x" + n.toString(16);
}

// make sure we are on the sepolia testnet
export async function ensureSepolia() {
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

// Ensure all transaction fields are properly formatted
export function normalizeTxFields(txn) {
    const fields = { ...txn };
    fields.gas = toHexifNumber(fields.gas);
    fields.gasPrice = toHexifNumber(fields.gasPrice);
    fields.nonce = toHexifNumber(fields.nonce);
    fields.value = toHexifNumber(fields.value) || '0x0';
    fields.chainId = toHexifNumber(fields.chainId);
    return fields
}