import { sepolia } from 'viem/chains';

const env = import.meta.env;
export const walletMode = env.VITE_WALLET_MODE || 'privy';
const id = Number(env.VITE_CHAIN_ID || (walletMode === 'metamask' ? 20260928 : sepolia.id));
if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid VITE_CHAIN_ID');
const rpcUrl = env.VITE_RPC_URL || env.VITE_SEPOLIA_RPC_URL ||
  (id === sepolia.id ? sepolia.rpcUrls.default.http[0] : 'http://127.0.0.1:8545');

export const appChain = {
  ...(id === sepolia.id ? sepolia : {}),
  id,
  name: env.VITE_CHAIN_NAME || (id === sepolia.id ? 'Sepolia' : 'DSP Besu Local'),
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  testnet: true,
};
export const chainIdHex = `0x${id.toString(16)}`;
