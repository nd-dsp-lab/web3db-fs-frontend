# Web3FS — Frontend

Google-Drive-style UI for Web3FS: files encrypted on IPFS, ownership and
sharing on an Ethereum smart contract, every mutation signed by the user's
wallet in the browser. Live at [fs.web3db.org](https://fs.web3db.org).

```bash
cd app
nvm use && npm install
npm run dev     # vite on :3000, expects the backend on :8090
npm test        # vitest
```


## Local Besu and MetaMask

From `app/`, install with `npm ci`, copy `.env.example` to `.env.local`, then run `npm run dev`. Open http://localhost:3000 in the browser with MetaMask. Connect the genesis-funded account, select DSP Besu Local, and approve the backend sign-in message. The backend must be running at the configured API URL.

`VITE_WALLET_MODE=metamask` connects directly to the browser extension and needs no Privy app ID. Reconnect after a page reload. In this mode, email/Google login is unavailable; share by wallet address. `VITE_WALLET_MODE=privy` retains the existing Privy flow and requires `VITE_PRIVY_APP_ID`. Email recipient resolution still requires backend Privy credentials.

The transaction signer validates the configured chain before broadcasting. Contract addresses come from backend-prepared transactions. Vite embeds the public environment settings at build time: restart the dev server after editing `.env.local`, or rebuild for Ubuntu/ngrok URLs. Never place wallet private keys or backend secrets in VITE variables.

The ngrok routes and Ubuntu deployment are not configured by these changes. `localhost` is for same-machine testing only.
