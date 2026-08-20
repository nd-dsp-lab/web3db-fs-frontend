import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { PrivyProvider } from '@privy-io/react-auth';
import { sepolia } from 'viem/chains';

// Dedicated RPC for wallet preflight (VITE_SEPOLIA_RPC_URL). Unset falls
// back to viem's public endpoint — works, but rate-limited and slow.
const rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL;
const sepoliaChain = rpcUrl
  ? { ...sepolia, rpcUrls: { default: { http: [rpcUrl] } } }
  : sepolia;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID}
      config={{
        loginMethods: ['email', 'google', 'wallet'],
        embeddedWallets: {
          ethereum: { createOnLogin: 'users-without-wallets' },
        },
        defaultChain: sepoliaChain,
        supportedChains: [sepoliaChain],
        appearance: { theme: 'dark' },
      }}
    >
      <App />
    </PrivyProvider>
  </React.StrictMode>
);
