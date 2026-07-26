// Grant and revoke access, single file or batch, plus the recipient plumbing
// that turns whatever the user typed into an address to grant.
export function useSharingActions({
  account, api, toast, user, confirm, retrieveFiles, tx,
}) {
  const { prepareAndSign, reportTxError } = tx;

  // Resolve an email to a wallet address via the backend (Privy lookup,
  // pregenerating a wallet for unknown emails). Raw 0x input passes through.
  const resolveRecipient = async (recipient) => {
    const response = await api.post("/resolve-recipient", { recipient });
    const data = await response.json();
    if (!response.ok || !data.address) {
      throw new Error(data.error || "Could not resolve recipient");
    }
    return data;
  };

  // Turn whatever the user typed into an address to grant. An email has to be
  // resolved and then confirmed: the user named a mailbox, so they need to see
  // which wallet it maps to before signing. Returns null if they decline; the
  // email is carried alongside so the caller can send the notification.
  const confirmRecipient = async (recipient, plural) => {
    const typed = recipient.trim();
    const email = typed.includes("@") ? typed.toLowerCase() : null;
    if (typed.startsWith("0x")) return { address: typed, email };

    const resolved = await resolveRecipient(typed);
    const note = resolved.pregenerated
      ? `\n\nThey haven't used Web3FS yet — a wallet was reserved for this email and the ${plural ? "files" : "file"} will appear when they first log in.`
      : "";
    const short = `${resolved.address.slice(0, 6)}...${resolved.address.slice(-4)}`;
    const ok = await confirm({ title: "Share file", message: `Share with ${typed} (${short})?${note}`, confirmLabel: "Share" });
    return ok ? { address: resolved.address, email } : null;
  };

  // Best-effort email notification once a share is on-chain — never awaited,
  // and a failure here doesn't undo the share the user already paid for.
  const notifyShare = (email, filename) => {
    if (!email) return;
    const sharer = user?.google?.name || user?.email?.address || `${account.slice(0, 6)}...${account.slice(-4)}`;
    api.post("/notify-share", { recipient_email: email, filename, sharer })
      .then(async (r) => {
        if (r.ok) { console.log("Share notification sent to", email); return; }
        const d = await r.json().catch(() => ({}));
        console.warn("Share notification failed:", d.error);
      })
      .catch((e) => console.warn("Share notification failed:", e));
  };

  const handleShare = async (cid, recipient, filename) => {
    if (!account) return;
    let tId;
    try {
      const to = await confirmRecipient(recipient, false);
      if (!to) return;
      tId = toast.loading("Preparing share…");
      await prepareAndSign("/share", { cid, to_address: to.address }, tId);
      toast.update(tId, `Shared with ${recipient.trim()}`, "success");
      notifyShare(to.email, filename || "a file");
      retrieveFiles();
    } catch (err) {
      reportTxError("Share", err, tId);
    }
  };

  const handleUnshare = async (cid, toAddress) => {
    if (!account) return;
    let tId;
    try {
      tId = toast.loading("Revoking access…");
      await prepareAndSign("/unshare", { cid, to_address: toAddress }, tId);
      toast.update(tId, "Access revoked", "success");
      retrieveFiles();
    } catch (err) {
      reportTxError("Unshare", err, tId);
    }
  };

  // Share many cids with one recipient — one grantFiles tx. Used by folder
  // share and multi-select share; notifyName labels the email notification
  // (e.g. 'the folder "docs"' or '3 items').
  const handleShareCids = async (cids, recipient, notifyName) => {
    if (!account) return;
    if (!cids.length) {
      toast.info("Nothing to share");
      return;
    }
    let tId;
    try {
      const to = await confirmRecipient(recipient, true);
      if (!to) return;
      tId = toast.loading(`Sharing ${cids.length} file(s)…`);
      await prepareAndSign("/share-batch", { cids, to_address: to.address }, tId);
      toast.update(tId, `Shared with ${recipient.trim()}`, "success");
      notifyShare(to.email, notifyName);
      retrieveFiles();
    } catch (err) {
      reportTxError("Share", err, tId);
    }
  };

  const handleUnshareCids = async (cids, toAddress) => {
    if (!account) return;
    if (!cids.length) return;
    let tId;
    try {
      tId = toast.loading("Revoking access…");
      await prepareAndSign("/unshare-batch", { cids, to_address: toAddress }, tId);
      toast.update(tId, "Access revoked", "success");
      retrieveFiles();
    } catch (err) {
      reportTxError("Unshare", err, tId);
    }
  };

  return { handleShare, handleUnshare, handleShareCids, handleUnshareCids };
}
