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
        loginMethods: ['email', 'google', 'wallet'],
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
