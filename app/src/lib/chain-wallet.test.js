import { appChain, chainIdHex } from './chain';
import { ensureConfiguredChain } from '../utils/helpers';
import { makeTx } from './tx';

test('adds a missing chain with the configured RPC and verifies the switch', async () => {
  let chain = '0x1'; let added = false;
  const provider = { request: vi.fn(async ({ method }) => {
    if (method === 'eth_chainId') return chain;
    if (method === 'wallet_addEthereumChain') { added = true; return null; }
    if (!added) throw Object.assign(new Error('Unknown chain'), { code: 4902 });
    chain = chainIdHex;
    return null;
  }) };
  await ensureConfiguredChain(provider);
  expect(provider.request).toHaveBeenCalledWith({ method: 'wallet_addEthereumChain', params: [{
    chainId: chainIdHex, chainName: appChain.name, nativeCurrency: appChain.nativeCurrency,
    rpcUrls: appChain.rpcUrls.default.http,
  }] });
  expect(chain).toBe(chainIdHex);
});

test('refuses backend transactions for a different chain before asking for a signature', async () => {
  const getProvider = vi.fn();
  const tx = makeTx({ getProvider });
  await expect(tx.signTransaction({ chainId: 1 })).rejects.toThrow('different network');
  expect(getProvider).not.toHaveBeenCalled();
});
