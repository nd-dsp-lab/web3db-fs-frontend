import React from 'react';
import App from './App';
import { useMetaMask } from './hooks/useMetaMask';

export default function MetaMaskApp() {
  const session = useMetaMask();
  // Reset account-specific UI and in-flight auth state when the account changes.
  return <App key={session.wallets[0]?.address || 'signed-out'} walletSession={session} />;
}
