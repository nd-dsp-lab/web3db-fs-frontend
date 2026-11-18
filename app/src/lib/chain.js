import { sepolia } from 'viem/chains';

const env = import.meta.env;
export const walletMode = env.VITE_WALLET_MODE || 'privy';
const id = Number(env.VITE_CHAIN_ID || (walletMode === 'metamask' ? 20260928 : sepolia.id));
if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid VITE_CHAIN_ID');
// In metamask mode the wallet broadcasts for itself and needs an RPC it can
// actually reach. In privy mode it never dials one -- transactions are signed
// locally and relayed by the backend -- so the fallback is a dead port rather
// than a plausible one. 127.0.0.1:8545 as a default would succeed on a
// developer's machine, where a node or a forwarded port is listening, and fail
// for every real user; port 1 fails the same way everywhere.
const rpcUrl = env.VITE_RPC_URL || env.VITE_SEPOLIA_RPC_URL ||
  (id === sepolia.id ? sepolia.rpcUrls.default.http[0]
    : walletMode === 'metamask' ? 'http://127.0.0.1:8545'
    : 'http://127.0.0.1:1');

export const appChain = {
  ...(id === sepolia.id ? sepolia : {}),
  id,
  name: env.VITE_CHAIN_NAME || (id === sepolia.id ? 'Sepolia' : 'DSP Besu Local'),
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  testnet: true,
};
export const chainIdHex = `0x${id.toString(16)}`;
