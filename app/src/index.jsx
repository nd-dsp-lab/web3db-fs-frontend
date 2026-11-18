import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { PrivyProvider } from '@privy-io/react-auth';
import MetaMaskApp from './MetaMaskApp';
import { appChain, walletMode } from './lib/chain';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {walletMode === 'metamask' ? <MetaMaskApp /> : <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID}
      config={{
        // Email and Google only. Both create a Privy embedded wallet, which
        // can sign without reaching a chain -- the thing this path depends on.
        // An external wallet connected here could not: MetaMask has no
        // eth_signTransaction and can only sign by broadcasting. MetaMask has
        // its own mode (VITE_WALLET_MODE=metamask), which requires a published
        // RPC; it is not something to re-add to this list.
        loginMethods: ['email', 'google'],
        embeddedWallets: {
          ethereum: { createOnLogin: 'users-without-wallets' },
        },
        defaultChain: appChain,
        supportedChains: [appChain],
        appearance: { theme: 'dark' },
      }}
    >
      <App />
    </PrivyProvider>}
  </React.StrictMode>
);
