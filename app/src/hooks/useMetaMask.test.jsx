import { renderHook, act, waitFor } from '@testing-library/react';
import { useMetaMask } from './useMetaMask';
import { chainIdHex } from '../lib/chain';

const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';
function provider() {
  const handlers = new Map();
  return {
    isMetaMask: true,
    request: vi.fn(async ({ method }) => {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [A];
      if (method === 'eth_chainId') return chainIdHex;
      throw new Error(method);
    }),
    on: vi.fn((event, fn) => handlers.set(event, fn)),
    removeListener: vi.fn((event) => handlers.delete(event)),
    emit: (event, value) => handlers.get(event)?.(value),
  };
}
afterEach(() => { delete window.ethereum; });

test('connects, tracks account changes, and stays logged out on later wallet events', async () => {
  const p = provider(); window.ethereum = p;
  const { result, unmount } = renderHook(() => useMetaMask());
  expect(result.current.authenticated).toBe(false);
  await act(async () => { await result.current.login(); });
  expect(result.current.wallets[0].address).toBe(A);
  expect(await result.current.wallets[0].getEthereumProvider()).toBe(p);
  act(() => p.emit('accountsChanged', [B]));
  expect(result.current.wallets[0].address).toBe(B);
  await act(async () => { await result.current.logout(); });
  act(() => p.emit('accountsChanged', [A]));
  expect(result.current.authenticated).toBe(false);
  unmount();
  expect(p.removeListener).toHaveBeenCalledWith('accountsChanged', expect.any(Function));
});

test('reports missing MetaMask and never invokes Privy', async () => {
  const { result } = renderHook(() => useMetaMask());
  await expect(result.current.login()).rejects.toThrow(/MetaMask installed/);
});

test('rejected connection leaves the app signed out', async () => {
  const p = provider(); p.request.mockRejectedValue(new Error('User rejected')); window.ethereum = p;
  const { result } = renderHook(() => useMetaMask());
  await expect(result.current.login()).rejects.toThrow('User rejected');
  expect(result.current.authenticated).toBe(false);
});

test('discovers MetaMask through EIP-6963 without window.ethereum', async () => {
  const p = provider();
  const { result } = renderHook(() => useMetaMask());
  act(() => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
    detail: { info: { rdns: 'io.metamask' }, provider: p },
  })));
  await act(async () => { await result.current.login(); });
  await waitFor(() => expect(result.current.authenticated).toBe(true));
});

test('a disconnect clears the session', async () => {
  const p = provider(); window.ethereum = p;
  const { result } = renderHook(() => useMetaMask());
  await act(async () => { await result.current.login(); });
  act(() => p.emit('disconnect'));
  expect(result.current.authenticated).toBe(false);
});
