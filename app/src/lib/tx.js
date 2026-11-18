import { toViemAccount } from "@privy-io/react-auth";

import { appChain } from "./chain";
import { ensureConfiguredChain, normalizeTxFields } from "../utils/helpers";

// Thrown when the backend declines to prepare a transaction. The response body
// carries a reason worth logging but nothing worth showing the user verbatim,
// so reportTxError renders these with fixed wording instead of the raw message.
export class PrepareError extends Error {}

// The on-chain plumbing every file action shares. Plain functions rather than a
// hook: there is no state here, and making it one would imply otherwise.
// `deps` is the slice of App the plumbing needs — account, api, toast, pushToast
// and getProvider.
export function makeTx({ account, api, toast, pushToast, getProvider, wallet, authToken, mode }) {
  // Backend endpoints only *prepare* transactions; the user must sign and
  // broadcast via MetaMask, then the backend verifies the receipt on-chain.
  // Signing is the only step the user has to be present for, so it is split
  // out: uploads sign and return, then verify in the background.
  //
  // Two paths, because the two wallets can do different things.
  //
  // MetaMask broadcasts for itself: it has no eth_signTransaction, so signing
  // and sending are one call, and it needs an RPC it can reach. That is the
  // metamask mode, and it only works where the node is published.
  //
  // Privy embedded wallets can sign without sending. That matters because the
  // production chain listens on the enclave host's loopback and the campus
  // perimeter refuses every inbound connection, so a browser has no RPC to
  // broadcast to. The wallet signs and /broadcast relays from inside. Trust is
  // unchanged: the signature covers every field, so the relay can only decline
  // to send a transaction, never alter one.
  const signTransaction = async (transaction, tId) => {
    if (transaction.chainId != null && BigInt(transaction.chainId) !== BigInt(appChain.id)) {
      throw new Error("The backend returned a transaction for a different network.");
    }

    if (mode === "metamask") {
      const provider = await getProvider();
      await ensureConfiguredChain(provider);
      if (tId) toast.update(tId, "Waiting for signature…", "loading");
      return provider.request({
        method: "eth_sendTransaction",
        params: [normalizeTxFields(transaction)],
      });
    }

    if (!wallet) throw new Error("No wallet connected");
    // Check before asking for a signature, not after. /broadcast needs the
    // login token, and a token that is not there yet would turn a signature
    // the user has already approved into a 401.
    if (!authToken) throw new Error("Still signing you in — try again in a moment");
    if (tId) toast.update(tId, "Waiting for signature…", "loading");
    const signer = await toViemAccount({ wallet });
    const raw = await signer.signTransaction(normalizeTxFields(transaction));

    if (tId) toast.update(tId, "Broadcasting…", "loading");
    const res = await api.post("/broadcast", { raw_transaction: raw },
                               { "x-auth-token": authToken });
    const data = await res.json();
    if (!data.tx_hash) throw new Error(data.error || "Broadcast failed");
    return data.tx_hash;
  };

  // Blocks until the transaction mines — the backend waits on the receipt, so
  // this call is as long as a block. It is also where a mined delete releases
  // the node's pins, which is why deletes verify inline and never in the
  // background: a closed tab between broadcast and verify would leave the bytes
  // pinned forever.
  const verifyTransaction = async (txHash) => {
    const verifyResponse = await api.post("/verify-upload", { tx_hash: txHash });
    const verifyData = await verifyResponse.json();
    if (!verifyData.success) {
      throw new Error(verifyData.error || "Transaction verification failed");
    }
    return txHash;
  };

  const signAndVerifyTransaction = async (transaction, tId) => {
    const txHash = await signTransaction(transaction, tId);
    if (tId) toast.update(tId, "Confirming on-chain…", "loading");
    return verifyTransaction(txHash);
  };

  // Every on-chain action is the same three steps: POST to the endpoint that
  // builds the transaction, sign it, verify the receipt on-chain. Only the
  // endpoint, the body and the toast wording differ, so they all come through
  // here. Returns the prepare response — callers read counts and follow-up
  // transactions off it. `optionalTx` is for endpoints that legitimately have
  // nothing to sign (deleting a folder that only exists in local state), where
  // an explicit error field is the only failure signal.
  const prepareAndSign = async (endpoint, body, tId, { optionalTx = false } = {}) => {
    const response = await api.post(endpoint, { user_address: account, ...body });
    const data = await response.json();
    if (optionalTx ? data.error : !data.transaction) {
      console.error(`${endpoint} prepare failed:`, data);
      throw new PrepareError();
    }
    if (data.transaction) await signAndVerifyTransaction(data.transaction, tId);
    return data;
  };

  const reportTxError = (action, err, tId) => {
    const prepare = err instanceof PrepareError;
    // A prepare failure already logged the response body where it happened;
    // anything else is a wallet or network error worth logging here.
    if (!prepare) console.error(`${action} error:`, err);
    const rejected = err?.code === 4001;
    const msg = prepare ? `${action} failed. Check console for details.`
      : rejected ? "Transaction rejected"
      : `${action} failed: ${err?.message || err?.reason || String(err)}`;
    const type = rejected ? "info" : "error";
    if (tId) toast.update(tId, msg, type);
    else pushToast(msg, type);
  };

  return { signTransaction, verifyTransaction, signAndVerifyTransaction, prepareAndSign, reportTxError };
}
