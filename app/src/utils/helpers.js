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

// Make sure we are on the Sepolia testnet. Throws if we are not: the caller
// signs a transaction straight after, and on the wrong chain that transaction
// goes to the Sepolia contract address on mainnet — real ETH spent on a no-op.
export async function ensureSepolia(provider = window.ethereum) {
    const SEPOLIA_CHAIN_ID = '0xaa36a7'; // 11155111 in hex

    const currentChainId = await provider.request({ method: "eth_chainId" });
    if (currentChainId === SEPOLIA_CHAIN_ID) return;

    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID }],
      });
    } catch (switchError) {
      // Sepolia isn't added to the wallet, or the user declined the switch
      throw new Error("Please switch your wallet to the Sepolia test network", { cause: switchError });
    }

    // A wallet may resolve the switch request without actually switching
    const chainId = await provider.request({ method: "eth_chainId" });
    if (chainId !== SEPOLIA_CHAIN_ID) throw new Error("Please switch your wallet to the Sepolia test network");
}

// Ensure all transaction fields are properly formatted
export function normalizeTxFields(txn) {
    const fields = { ...txn };
    // Numeric fields for both legacy (gasPrice) and EIP-1559
    // (maxFeePerGas/maxPriorityFeePerGas) transactions
    for (const key of ["gas", "gasPrice", "maxFeePerGas", "maxPriorityFeePerGas", "nonce", "chainId"]) {
        if (fields[key] !== undefined) fields[key] = toHexifNumber(fields[key]);
    }
    fields.value = toHexifNumber(fields.value) || '0x0';
    return fields
}