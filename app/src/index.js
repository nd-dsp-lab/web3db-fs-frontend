import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { PrivyProvider } from '@privy-io/react-auth';
import { sepolia } from 'viem/chains';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <PrivyProvider
      appId={process.env.REACT_APP_PRIVY_APP_ID}
      config={{
        loginMethods: ['email', 'google', 'wallet'],
        embeddedWallets: {
          ethereum: { createOnLogin: 'users-without-wallets' },
        },
        defaultChain: sepolia,
        supportedChains: [sepolia],
        appearance: { theme: 'dark' },
      }}
    >
      <App />
    </PrivyProvider>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
