import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ensureConfiguredChain } from '../utils/helpers';

export function useMetaMask() {
  const [provider, setProvider] = useState(null);
  const [address, setAddress] = useState(null);
  const active = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    // Prefer MetaMask's EIP-6963 announcement when several wallets are installed.
    const announced = ({ detail }) => {
      if (detail?.info?.rdns === 'io.metamask') setProvider(detail.provider);
    };
    window.addEventListener('eip6963:announceProvider', announced);
    const injected = window.ethereum;
    const fallback = injected?.providers?.find((p) => p.isMetaMask) ||
      (injected?.isMetaMask ? injected : null);
    if (fallback) setProvider(fallback);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    return () => window.removeEventListener('eip6963:announceProvider', announced);
  }, []);

  useEffect(() => {
    if (!provider) return;
    const accountsChanged = (accounts) => {
      if (active.current) setAddress(accounts[0] || null);
      if (!accounts.length) active.current = false;
    };
    const disconnected = () => {
      generation.current += 1;
      active.current = false;
      setAddress(null);
    };
    provider.on?.('accountsChanged', accountsChanged);
    provider.on?.('disconnect', disconnected);
    return () => {
      provider.removeListener?.('accountsChanged', accountsChanged);
      provider.removeListener?.('disconnect', disconnected);
    };
  }, [provider]);

  const login = useCallback(async () => {
    if (!provider) throw new Error('Open this page in a browser with MetaMask installed, then reload.');
    const attempt = ++generation.current;
    await provider.request({ method: 'eth_requestAccounts' });
    await ensureConfiguredChain(provider);
    const accounts = await provider.request({ method: 'eth_accounts' });
    if (!accounts[0]) throw new Error('Select an account in MetaMask.');
    if (attempt !== generation.current) return;
    active.current = true;
    setAddress(accounts[0]);
  }, [provider]);

  const logout = useCallback(async () => {
    generation.current += 1;
    active.current = false;
    setAddress(null);
  }, []);

  const wallets = useMemo(() => address && provider ? [{
    address,
    walletClientType: 'metamask',
    getEthereumProvider: async () => provider,
  }] : [], [address, provider]);

  // This is wallet connection state; the backend still verifies personal_sign
  // before issuing its download/auth token. Reloading requires Connect again.
  return { ready: true, authenticated: !!address, user: null, wallets, login, logout, mode: 'metamask' };
}
