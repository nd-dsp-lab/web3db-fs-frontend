/* eslint-disable react-hooks/rules-of-hooks --
   useDownloads uses no React hooks; like useFileActions it is a plain factory
   that follows the naming convention, so the tests call it directly. */
import { useDownloads } from "./useDownloads";

// Downloads used to live in AppLayout and could only be exercised by rendering
// the whole shell and spying on global fetch. Here they are driven directly.

const ACCOUNT = "0x1A28b19f6d2ea1A05F9eFFbcCcbF7E9571877981";
const BASE = "http://api";

function setup({ account = ACCOUNT, authToken = "tok", responses = {} } = {}) {
  const calls = { fetches: [], toasts: [], saved: [], revoked: 0 };

  global.fetch = vi.fn(async (url, init) => {
    calls.fetches.push({ url, headers: init?.headers || {} });
    const spec = Object.entries(responses).find(([path]) => url.includes(path))?.[1] ?? { ok: true };
    return {
      ok: spec.ok !== false,
      blob: async () => spec.blob ?? new Blob(["x"]),
      json: async () => { if (spec.badJson) throw new Error("not json"); return spec.body ?? {}; },
    };
  });

  global.URL.createObjectURL = vi.fn(() => "blob:fake");
  global.URL.revokeObjectURL = vi.fn(() => { calls.revoked += 1; });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click() {
    calls.saved.push({ href: this.href, name: this.download });
  });

  const toast = {
    loading: (msg) => { calls.toasts.push(["loading", msg]); return "tid"; },
    update: (_id, msg, type) => calls.toasts.push([type, msg]),
    success: (msg) => calls.toasts.push(["success", msg]),
    info: (msg) => calls.toasts.push(["info", msg]),
    error: (msg) => calls.toasts.push(["error", msg]),
  };

  const downloads = useDownloads({ API_BASE_URL: BASE, account, authToken, toast });
  return { downloads, calls };
}

const file = (over = {}) => ({ cid: "c1", filename: "report.txt", ...over });
const messages = (calls) => calls.toasts.map(([, m]) => m);

afterEach(() => vi.restoreAllMocks());

describe("sign-in guards", () => {
  test("no wallet is a different message from no token yet", async () => {
    const a = setup({ account: null });
    await a.downloads.downloadFile(file());
    expect(messages(a.calls)).toEqual(["Sign in first"]);

    const b = setup({ authToken: null });
    await b.downloads.downloadFile(file());
    expect(messages(b.calls)).toEqual(["Verifying sign-in — try again in a moment"]);
  });

  test("neither case reaches the network", async () => {
    const { downloads, calls } = setup({ authToken: null });
    await downloads.downloadFile(file());
    await downloads.downloadFolder("Docs", "/Docs");

    expect(calls.fetches).toEqual([]);
  });

  // A folder zip is served to anyone the folder is shared with, so it is
  // gated on the token alone — there is no account-specific path to build.
  test("a folder download needs the token but not a connected wallet", async () => {
    const { downloads, calls } = setup({ account: null });
    await downloads.downloadFolder("Docs", "/Docs");

    expect(calls.fetches).toHaveLength(1);
  });
});

describe("downloadFile", () => {
  test("authenticates with the download token and nothing else", async () => {
    const { downloads, calls } = setup();
    await downloads.downloadFile(file());

    const [req] = calls.fetches;
    expect(req.url).toBe(`${BASE}/download/c1/report.txt`);
    expect(req.headers).toEqual({ "x-auth-token": "tok" });
  });

  test("filenames are escaped into the path", async () => {
    const { downloads, calls } = setup();
    await downloads.downloadFile(file({ filename: "my report #1.txt" }));

    expect(calls.fetches[0].url).toBe(`${BASE}/download/c1/my%20report%20%231.txt`);
  });

  test("saves the blob under the original filename and releases the URL", async () => {
    const { downloads, calls } = setup();
    await downloads.downloadFile(file());

    expect(calls.saved).toEqual([{ href: "blob:fake", name: "report.txt" }]);
    expect(calls.revoked).toBe(1);
  });

  test("a rejected request is reported and saves nothing", async () => {
    const { downloads, calls } = setup({ responses: { "/download/": { ok: false } } });
    await downloads.downloadFile(file());

    expect(calls.toasts).toEqual([["error", "Download failed"]]);
    expect(calls.saved).toEqual([]);
  });
});

describe("downloadMany", () => {
  test("downloads in sequence behind one progress toast", async () => {
    const { downloads, calls } = setup();
    await downloads.downloadMany([file({ cid: "c1" }), file({ cid: "c2", filename: "b.txt" })]);

    expect(calls.saved.map((s) => s.name)).toEqual(["report.txt", "b.txt"]);
    expect(messages(calls)).toEqual([
      "Downloading 0/2…", "Downloading 1/2…", "Downloading 2/2…", "Downloaded 2 file(s)",
    ]);
  });

  // One unreadable file in a selection of twenty should not abandon the rest.
  test("a failure part-way through does not stop the remaining files", async () => {
    const { downloads, calls } = setup({ responses: { "/download/c2/": { ok: false } } });
    await downloads.downloadMany([file({ cid: "c1" }), file({ cid: "c2" }), file({ cid: "c3" })]);

    expect(calls.fetches).toHaveLength(3);
    expect(messages(calls)).toContain("Download failed");
    expect(messages(calls)).toContain("Downloaded 3 file(s)");
  });
});

describe("downloadFolder", () => {
  test("asks the backend to zip the path and saves it under the folder name", async () => {
    const { downloads, calls } = setup();
    await downloads.downloadFolder("Docs", "/a/Docs");

    expect(calls.fetches[0].url).toBe(`${BASE}/download-folder?path=%2Fa%2FDocs`);
    expect(calls.saved).toEqual([{ href: "blob:fake", name: "Docs.zip" }]);
    expect(messages(calls)).toContain('Downloaded "Docs.zip"');
  });

  test("the backend's reason replaces the generic failure message", async () => {
    const { downloads, calls } = setup({
      responses: { "/download-folder": { ok: false, body: { error: "Folder is empty" } } },
    });
    await downloads.downloadFolder("Docs", "/Docs");

    expect(calls.toasts).toContainEqual(["error", "Folder is empty"]);
    expect(calls.saved).toEqual([]);
  });

  test("an error body that is not JSON still reports a failure", async () => {
    const { downloads, calls } = setup({
      responses: { "/download-folder": { ok: false, badJson: true } },
    });
    await downloads.downloadFolder("Docs", "/Docs");

    expect(calls.toasts).toContainEqual(["error", "Download failed"]);
  });
});
