import { makeApi } from "../lib/api";

// Downloads: single file, a sequence of files behind one progress toast, and
// a whole folder zipped server-side. Split out of AppLayout, which owned them
// only because that is where the toolbar and menus happened to live.
//
// Every download is authenticated with the short-lived download token, so all
// three share the same "signed in yet?" guards and the same save-a-blob dance.

// Blob -> file on disk. The object URL is revoked immediately; the browser has
// already taken its own reference by the time click() returns.
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function useDownloads({ API_BASE_URL, account, authToken, toast }) {
  const api = makeApi(API_BASE_URL);
  const auth = () => ({ "x-auth-token": authToken });

  // The token arrives a moment after the wallet does, so "not signed in" and
  // "signature still in flight" are different messages: only one is the
  // user's problem.
  const ready = (needsAccount) => {
    if (needsAccount && !account) {
      toast.info("Sign in first");
      return false;
    }
    if (!authToken) {
      toast.info("Verifying sign-in — try again in a moment");
      return false;
    }
    return true;
  };

  const downloadFile = async (file) => {
    if (!ready(true)) return;
    try {
      const res = await api.get(`/download/${file.cid}/${encodeURIComponent(file.filename)}`, auth());
      if (!res.ok) throw new Error("Download failed");
      saveBlob(await res.blob(), file.filename);
    } catch (err) {
      toast.error(err.message || "Download failed");
    }
  };

  // Sequential bulk download with a single progress toast
  const downloadMany = async (items) => {
    const tId = toast.loading(`Downloading 0/${items.length}…`);
    let done = 0;
    for (const f of items) {
      toast.update(tId, `Downloading ${done + 1}/${items.length}…`, "loading");
      await downloadFile(f); // errors toast individually inside
      done++;
    }
    toast.update(tId, `Downloaded ${done} file(s)`, "success");
  };

  // The backend walks the folder and streams back a zip
  const downloadFolder = async (folderName, folderPath) => {
    if (!ready(false)) return;
    const tId = toast.loading(`Zipping "${folderName}"…`);
    try {
      const res = await api.get(`/download-folder?path=${encodeURIComponent(folderPath)}`, auth());
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Download failed");
      }
      saveBlob(await res.blob(), `${folderName}.zip`);
      toast.update(tId, `Downloaded "${folderName}.zip"`, "success");
    } catch (err) {
      toast.update(tId, err.message || "Download failed", "error");
    }
  };

  return { downloadFile, downloadMany, downloadFolder };
}
