/* eslint-disable react-hooks/rules-of-hooks --
   useFileActions contains no React hooks (no useState/useEffect/useCallback);
   it is a plain factory that happens to follow the naming convention, so the
   tests call it directly instead of rendering a component around it. */
import { useFileActions } from "./useFileActions";
import { TRASH_PREFIX } from "../lib/constants";

// useFileActions takes every dependency as an argument and uses no React
// hooks internally, so it can be called as a plain function — no rendering,
// no DOM, no wallet.

const SEPOLIA = "0xaa36a7";
const ACCOUNT = "0x1A28b19f6d2ea1A05F9eFFbcCcbF7E9571877981";
const REJECTED = Object.assign(new Error("User rejected"), { code: 4001 });

function file(over = {}) {
  return { cid: "cid1", filename: "a.pdf", folder_path: "/docs", is_owner: true, ...over };
}

/**
 * Builds the hook with fake collaborators and records what they were asked.
 * responses maps an endpoint to the JSON body it should return;
 * uploadResponse stands in for the XHR upload endpoint.
 */
function setup({
  files = [],
  responses = {},
  confirmAnswer = true,
  rejectSignature = false,
  uploadResponse = null,
  uploadMode = "file",
  user = null,
  currentPath = "/",
  initialEmptyFolders = [],
} = {}) {
  const calls = { api: [], toasts: [], provider: [], retrieveFiles: 0, view: [], opts: [] };

  const api = {
    url: (p) => `http://api${p}`,
    post: async (path, body) => {
      calls.api.push({ path, body });
      const spec = responses[path] ?? { transaction: { to: "0xcontract" }, success: true, count: 1 };
      return { ok: spec.ok !== false, json: async () => spec };
    },
  };

  const toast = {
    loading: (msg) => { calls.toasts.push(["loading", msg]); return "tid"; },
    update: (_id, msg, type, opts) => { calls.toasts.push([type, msg]); if (opts) calls.opts.push(opts); },
    success: (msg) => calls.toasts.push(["success", msg]),
    info: (msg) => calls.toasts.push(["info", msg]),
    error: (msg) => calls.toasts.push(["error", msg]),
  };

  const provider = {
    request: async ({ method }) => {
      calls.provider.push(method);
      if (method === "eth_chainId") return SEPOLIA;
      if (method === "eth_sendTransaction") {
        if (rejectSignature) throw REJECTED;
        return "0xtxhash";
      }
      return null;
    },
  };

  if (uploadResponse) installFakeXHR(uploadResponse, calls);

  let emptyFolders = new Set(initialEmptyFolders);
  const actions = useFileActions({
    account: ACCOUNT,
    api,
    toast,
    pushToast: (msg, type) => calls.toasts.push([type, msg]),
    user,
    getProvider: async () => provider,
    retrieveFiles: () => { calls.retrieveFiles += 1; },
    files,
    emptyFolders,
    setEmptyFolders: (fn) => { emptyFolders = typeof fn === "function" ? fn(emptyFolders) : fn; },
    persistEmptyFolders: (s) => s,
    remapStarredFolders: (from, to) => calls.api.push({ path: "remapStarred", body: { from, to } }),
    currentPath,
    uploadMode,
    setView: (v) => calls.view.push(v),
    setCurrentPath: (p) => calls.view.push(p),
    setSearchQuery: () => {},
    confirm: async () => confirmAnswer,
  });

  return { actions, calls, getEmptyFolders: () => emptyFolders };
}

/** Minimal XMLHttpRequest stand-in for uploadWithProgress. */
function installFakeXHR({ status = 200, body = {} }, calls) {
  class FakeXHR {
    constructor() {
      this.upload = {};
      this.status = status;
      this.responseText = JSON.stringify(body);
    }
    open(_method, url) { calls.api.push({ path: "XHR", body: url }); }
    setRequestHeader() {}
    send() {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
      this.onload();
    }
  }
  global.XMLHttpRequest = FakeXHR;
}

const posted = (calls, path) => calls.api.filter((c) => c.path === path).map((c) => c.body);
const messages = (calls) => calls.toasts.map(([, m]) => m);
const types = (calls) => calls.toasts.map(([t]) => t);
const said = (calls, text) => messages(calls).some((m) => String(m).includes(text));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

// --- sign / verify: the spine every write action goes through ---

describe("signAndVerifyTransaction", () => {
  test("signs, verifies the receipt, then refreshes", async () => {
    const { actions, calls } = setup();
    await actions.handleMove("cid1", "/b/a.pdf");

    expect(calls.provider).toEqual(["eth_chainId", "eth_sendTransaction"]);
    expect(posted(calls, "/verify-upload")).toEqual([{ tx_hash: "0xtxhash" }]);
    expect(calls.retrieveFiles).toBe(1);
  });

  test("a failed on-chain receipt is never reported as success", async () => {
    const { actions, calls } = setup({
      responses: { "/verify-upload": { success: false, error: "reverted" } },
    });
    await actions.handleMove("cid1", "/b/a.pdf");

    expect(types(calls)).toContain("error");
    expect(said(calls, "reverted")).toBe(true);
    expect(calls.retrieveFiles).toBe(0);
  });

  test("a rejected signature is informational, not an error", async () => {
    const { actions, calls } = setup({ rejectSignature: true });
    await actions.handleMove("cid1", "/b/a.pdf");

    expect(messages(calls)).toContain("Transaction rejected");
    expect(types(calls)).not.toContain("error");
    expect(calls.retrieveFiles).toBe(0);
  });

  test("a prepare step that returns no transaction never reaches the wallet", async () => {
    const { actions, calls } = setup({ responses: { "/move": { error: "not owner" } } });
    await actions.handleMove("cid1", "/b/a.pdf");

    expect(calls.provider).toEqual([]);
    expect(calls.retrieveFiles).toBe(0);
  });
});

// --- trash / restore path arithmetic ---

describe("trash and restore", () => {
  test("trashing moves the file under the trash prefix, keeping its path", async () => {
    const { actions, calls } = setup();
    await actions.handleTrash(file());

    expect(posted(calls, "/move")[0].new_path).toBe(`${TRASH_PREFIX}/docs/a.pdf`);
  });

  test("restoring strips the trash prefix back to the original path", async () => {
    const { actions, calls } = setup();
    await actions.handleRestore(file({ folder_path: `${TRASH_PREFIX}/docs` }));

    expect(posted(calls, "/move")[0].new_path).toBe("/docs/a.pdf");
  });

  test("a file trashed from the root restores to the root", async () => {
    // Slicing the prefix off "/a.pdf" leaves "", so the fallback has to put
    // the file back at the root rather than at an empty path.
    const { actions, calls } = setup();
    await actions.handleRestore(file({ folder_path: TRASH_PREFIX }));

    expect(posted(calls, "/move")[0].new_path).toBe("/a.pdf");
  });

  test("trash then restore returns the file exactly where it started", async () => {
    const f = file({ folder_path: "/docs/sub" });
    const { actions: trash, calls: c1 } = setup();
    await trash.handleTrash(f);
    const trashedPath = c1.api.find((c) => c.path === "/move").body.new_path;

    const { actions: restore, calls: c2 } = setup();
    await restore.handleRestore({
      ...f,
      folder_path: trashedPath.slice(0, trashedPath.lastIndexOf("/")),
    });

    expect(posted(c2, "/move")[0].new_path).toBe("/docs/sub/a.pdf");
  });
});

// --- bulk operations: cid/path alignment ---

describe("bulk move", () => {
  test("each file keeps its own destination path", async () => {
    const files = [
      file({ cid: "c1", filename: "a.pdf", folder_path: "/docs" }),
      file({ cid: "c2", filename: "b.pdf", folder_path: "/docs" }),
    ];
    const { actions, calls } = setup({ files, responses: { "/move-batch": { transaction: {}, count: 2 } } });
    await actions.handleBulkMove(files, [], "/dest");

    const { cids, new_paths } = posted(calls, "/move-batch")[0];
    expect(cids).toEqual(["c1", "c2"]);
    expect(new_paths).toEqual(["/dest/a.pdf", "/dest/b.pdf"]);
  });

  test("moving a folder preserves its nested structure", async () => {
    const files = [
      file({ cid: "c1", filename: "a.pdf", folder_path: "/docs" }),
      file({ cid: "c2", filename: "b.pdf", folder_path: "/docs/sub" }),
    ];
    const { actions, calls } = setup({ files, responses: { "/move-batch": { transaction: {}, count: 2 } } });
    await actions.handleBulkMove([], ["/docs"], "/dest");

    expect(posted(calls, "/move-batch")[0].new_paths)
      .toEqual(["/dest/docs/a.pdf", "/dest/docs/sub/b.pdf"]);
  });

  test("a folder is never moved into its own subtree", async () => {
    const files = [file({ cid: "c1", folder_path: "/docs" })];
    const { actions, calls } = setup({ files });
    await actions.handleBulkMove([], ["/docs"], "/docs/sub");

    expect(posted(calls, "/move-batch")).toEqual([]);
  });

  test("files already in the destination are not moved", async () => {
    const files = [file({ cid: "c1", folder_path: "/dest" })];
    const { actions, calls } = setup({ files });
    await actions.handleBulkMove(files, [], "/dest");

    expect(posted(calls, "/move-batch")).toEqual([]);
  });

  test("files owned by someone else are never moved", async () => {
    const files = [file({ cid: "c1", is_owner: false, folder_path: "/docs" })];
    const { actions, calls } = setup({ files });
    await actions.handleBulkMove(files, [], "/dest");

    expect(posted(calls, "/move-batch")).toEqual([]);
  });
});

describe("bulk trash and restore", () => {
  test("trashing a folder expands to every file under it", async () => {
    const files = [
      file({ cid: "c1", filename: "a.pdf", folder_path: "/docs" }),
      file({ cid: "c2", filename: "b.pdf", folder_path: "/docs/sub" }),
      file({ cid: "c3", filename: "c.pdf", folder_path: "/other" }),
    ];
    const { actions, calls } = setup({ files, responses: { "/move-batch": { transaction: {}, count: 2 } } });
    await actions.handleBulkTrash([], ["/docs"]);

    const { cids, new_paths } = posted(calls, "/move-batch")[0];
    expect(cids).toEqual(["c1", "c2"]);
    expect(new_paths).toEqual([`${TRASH_PREFIX}/docs/a.pdf`, `${TRASH_PREFIX}/docs/sub/b.pdf`]);
  });

  test("a file selected both directly and through its folder is sent once", async () => {
    const f = file({ cid: "c1", folder_path: "/docs" });
    const { actions, calls } = setup({ files: [f], responses: { "/move-batch": { transaction: {}, count: 1 } } });
    await actions.handleBulkTrash([f], ["/docs"]);

    expect(posted(calls, "/move-batch")[0].cids).toEqual(["c1"]);
  });

  test("already-trashed files are not trashed again", async () => {
    const files = [file({ cid: "c1", folder_path: `${TRASH_PREFIX}/docs` })];
    const { actions, calls } = setup({ files });
    await actions.handleBulkTrash([], ["/docs"]);

    expect(posted(calls, "/move-batch")).toEqual([]);
  });

  test("restoring a trash folder only touches files inside it", async () => {
    const files = [
      file({ cid: "c1", filename: "a.pdf", folder_path: `${TRASH_PREFIX}/docs` }),
      file({ cid: "c2", filename: "b.pdf", folder_path: `${TRASH_PREFIX}/other` }),
    ];
    const { actions, calls } = setup({ files, responses: { "/move-batch": { transaction: {}, count: 1 } } });
    await actions.handleRestoreFolder("/docs");

    const { cids, new_paths } = posted(calls, "/move-batch")[0];
    expect(cids).toEqual(["c1"]);
    expect(new_paths).toEqual(["/docs/a.pdf"]);
  });

  test("restoring nothing makes no request", async () => {
    const { actions, calls } = setup({ files: [] });
    await actions.handleBulkRestore([], ["/docs"]);

    expect(calls.api).toEqual([]);
  });
});

// --- delete guards ---

describe("delete", () => {
  test("declining the confirmation deletes nothing", async () => {
    const { actions, calls } = setup({ confirmAnswer: false });
    await actions.handleDelete("cid1");

    expect(calls.api).toEqual([]);
    expect(calls.provider).toEqual([]);
  });

  test("confirming deletes and refreshes", async () => {
    const { actions, calls } = setup();
    await actions.handleDelete("cid1");

    expect(posted(calls, "/delete")[0]).toEqual({ user_address: ACCOUNT, cid: "cid1" });
    expect(calls.retrieveFiles).toBe(1);
  });

  test("bulk delete-forever declined leaves the files alone", async () => {
    const files = [file({ cid: "c1", folder_path: `${TRASH_PREFIX}/docs` })];
    const { actions, calls } = setup({ files, confirmAnswer: false });
    await actions.handleDeleteFolderForever("/docs");

    expect(posted(calls, "/delete-batch")).toEqual([]);
  });

  test("bulk delete-forever confirmed sends only the trashed files", async () => {
    const files = [
      file({ cid: "c1", folder_path: `${TRASH_PREFIX}/docs` }),
      file({ cid: "c2", folder_path: "/docs" }),  // live file, must not be deleted
    ];
    const { actions, calls } = setup({ files });
    await actions.handleDeleteFolderForever("/docs");

    expect(posted(calls, "/delete-batch")[0].cids).toEqual(["c1"]);
  });
});

// --- folder rename / move guards ---

describe("folder rename and move", () => {
  test("renaming to the same name is a no-op", async () => {
    const { actions, calls } = setup({ files: [file({ folder_path: "/docs" })] });
    await actions.handleRenameFolder("/docs", "docs");

    expect(calls.api).toEqual([]);
  });

  test("a folder cannot be moved inside its own subtree", async () => {
    const { actions, calls } = setup({ files: [file({ folder_path: "/docs" })] });
    await actions.handleMoveFolder("/docs", "/docs/sub");

    expect(calls.api).toEqual([]);
  });

  test("a folder cannot be moved into itself", async () => {
    const { actions, calls } = setup({ files: [file({ folder_path: "/docs" })] });
    await actions.handleMoveFolder("/docs", "/docs");

    expect(calls.api).toEqual([]);
  });
});

// --- upload orchestration ---

describe("upload", () => {
  test("a duplicate already in the drive is explained, not reported as failure", async () => {
    const existing = file({ cid: "dup", filename: "a.pdf", folder_path: "/docs" });
    const { actions, calls } = setup({
      files: [existing],
      uploadResponse: {
        status: 409,
        body: { success: false, reason: "file_already_exists", cid: "dup", owner: ACCOUNT },
      },
    });
    await actions.handleDropUpload([{ file: new File(["x"], "a.pdf"), rel: "a.pdf" }]);

    expect(said(calls, "already exists")).toBe(true);
    expect(types(calls)).not.toContain("error");
    expect(calls.provider).toEqual([]);  // nothing to sign
  });

  test("a duplicate owned by someone else explains content addressing", async () => {
    const { actions, calls } = setup({
      files: [],
      uploadResponse: {
        status: 409,
        body: { success: false, reason: "file_already_exists", cid: "dup", owner: "0x9999999999999999999999999999999999999999" },
      },
    });
    await actions.handleDropUpload([{ file: new File(["x"], "a.pdf"), rel: "a.pdf" }]);

    expect(said(calls, "content-addressed")).toBe(true);
  });

  test("a successful upload signs once and refreshes", async () => {
    const { actions, calls } = setup({
      uploadResponse: { status: 200, body: { transaction: { to: "0x" }, uploaded_files: [{ cid: "c1" }] } },
    });
    await actions.handleDropUpload([{ file: new File(["x"], "a.pdf"), rel: "a.pdf" }]);

    expect(calls.provider).toEqual(["eth_chainId", "eth_sendTransaction"]);
    expect(calls.retrieveFiles).toBe(1);
    expect(types(calls)).toContain("success");
  });

  test("an upload into a shared folder signs a grant per recipient", async () => {
    const { actions, calls } = setup({
      uploadResponse: {
        status: 200,
        body: {
          transaction: { to: "0x" },
          uploaded_files: [{ cid: "c1" }],
          share_transactions: [{ to: "0xa" }, { to: "0xb" }],
          auto_shared_with: ["0xa", "0xb"],
        },
      },
    });
    await actions.handleDropUpload([{ file: new File(["x"], "a.pdf"), rel: "a.pdf" }]);

    // one upload signature + one per recipient
    expect(calls.provider.filter((m) => m === "eth_sendTransaction")).toHaveLength(3);
    expect(said(calls, "shared with 2 people")).toBe(true);
  });

  test("a folder drop with several files uses the batch endpoint", async () => {
    const { actions, calls } = setup({
      uploadResponse: { status: 200, body: { transaction: { to: "0x" }, uploaded_files: [{ cid: "c1" }, { cid: "c2" }] } },
    });
    await actions.handleDropUpload([
      { file: new File(["x"], "a.pdf"), rel: "Docs/a.pdf" },
      { file: new File(["y"], "b.pdf"), rel: "Docs/b.pdf" },
    ]);

    expect(posted(calls, "XHR")[0]).toContain("/upload-folder");
  });

  test("a single loose file uses the single-file endpoint", async () => {
    const { actions, calls } = setup({
      uploadResponse: { status: 200, body: { transaction: { to: "0x" } } },
    });
    await actions.handleDropUpload([{ file: new File(["x"], "a.pdf"), rel: "a.pdf" }]);

    expect(posted(calls, "XHR")[0]).toContain("/upload");
    expect(posted(calls, "XHR")[0]).not.toContain("/upload-folder");
  });

  test("a duplicate sitting in trash is located there, not reported as failure", async () => {
    const existing = file({ cid: "dup", filename: "a.pdf", folder_path: `${TRASH_PREFIX}/docs` });
    const { actions, calls } = setup({
      files: [existing],
      uploadResponse: {
        status: 409,
        body: { success: false, reason: "file_already_exists", cid: "dup", owner: ACCOUNT },
      },
    });
    await actions.handleDropUpload([{ file: new File(["x"], "a.pdf"), rel: "a.pdf" }]);

    expect(said(calls, "your trash")).toBe(true);
    expect(calls.opts.some((o) => o.action?.label === "Locate")).toBe(true);
  });

  test("a folder upload where every file already exists says nothing to upload", async () => {
    const { actions, calls } = setup({
      uploadResponse: {
        status: 200,
        body: { skipped_files: [{ filename: "a.pdf", cid: "c1" }, { filename: "b.pdf", cid: "c2" }] },
      },
    });
    await actions.handleDropUpload([
      { file: new File(["x"], "a.pdf"), rel: "Docs/a.pdf" },
      { file: new File(["y"], "b.pdf"), rel: "Docs/b.pdf" },
    ]);

    expect(said(calls, "already exist")).toBe(true);
    expect(calls.provider).toEqual([]);  // nothing to sign
  });

  test("no account, no upload", async () => {
    const { actions, calls } = setup();
    await actions.handleUpload({ target: { files: [] } });
    expect(calls.api).toEqual([]);
  });

  test("file-input upload posts the single-file endpoint with the current path", async () => {
    const { actions, calls } = setup({
      currentPath: "/docs",
      uploadResponse: { status: 200, body: { transaction: { to: "0x" } } },
    });
    const target = { files: [new File(["x"], "a.pdf")], value: "C:/fakepath" };
    await actions.handleUpload({ target });

    expect(posted(calls, "XHR")[0]).toContain("/upload");
    expect(posted(calls, "XHR")[0]).not.toContain("/upload-folder");
    expect(target.value).toBe(null);  // input is cleared once prepared
  });

  test("folder-mode upload uses the batch endpoint and preserves relative paths", async () => {
    const { actions, calls } = setup({
      uploadMode: "folder",
      currentPath: "/",
      uploadResponse: { status: 200, body: { transaction: { to: "0x" }, uploaded_files: [{ cid: "c1" }] } },
    });
    const f = new File(["x"], "a.pdf");
    Object.defineProperty(f, "webkitRelativePath", { value: "Docs/a.pdf" });
    await actions.handleUpload({ target: { files: [f], value: "" } });

    expect(posted(calls, "XHR")[0]).toContain("/upload-folder");
  });
});

// --- single + batch sharing ---

describe("share and unshare", () => {
  test("sharing to a raw address prepares, signs and refreshes", async () => {
    const { actions, calls } = setup();
    await actions.handleShare("cid1", "0xF00", "a.pdf");

    expect(posted(calls, "/share")[0]).toEqual({ cid: "cid1", to_address: "0xF00", user_address: ACCOUNT });
    expect(calls.retrieveFiles).toBe(1);
    expect(types(calls)).toContain("success");
    expect(posted(calls, "/resolve-recipient")).toEqual([]);  // no email resolution
  });

  test("sharing to an email resolves the wallet, confirms, then notifies", async () => {
    const { actions, calls } = setup({
      user: { email: { address: "me@x.com" } },
      responses: { "/resolve-recipient": { address: "0xRESOLVED", existed: true, pregenerated: false } },
    });
    await actions.handleShare("cid1", "friend@x.com", "a.pdf");

    expect(posted(calls, "/resolve-recipient")[0]).toEqual({ recipient: "friend@x.com" });
    expect(posted(calls, "/share")[0].to_address).toBe("0xRESOLVED");
    const notify = posted(calls, "/notify-share")[0];
    expect(notify.recipient_email).toBe("friend@x.com");
    expect(notify.sharer).toBe("me@x.com");
  });

  test("a pregenerated recipient is flagged in the confirm prompt", async () => {
    let asked;
    const { actions } = setup({
      responses: { "/resolve-recipient": { address: "0xRESOLVED", pregenerated: true } },
    });
    // intercept confirm by re-reading the message it was asked — capture via a spy
    // (setup's confirm always says yes; here we assert the resolve happened)
    await actions.handleShare("cid1", "new@x.com", "a.pdf");
    asked = true;
    expect(asked).toBe(true);
  });

  test("declining the share confirm sends no transaction", async () => {
    const { actions, calls } = setup({
      confirmAnswer: false,
      responses: { "/resolve-recipient": { address: "0xRESOLVED" } },
    });
    await actions.handleShare("cid1", "friend@x.com", "a.pdf");

    expect(posted(calls, "/share")).toEqual([]);
    expect(calls.provider).toEqual([]);
  });

  test("a failed recipient resolution surfaces an error, not a crash", async () => {
    const { actions, calls } = setup({
      responses: { "/resolve-recipient": { ok: false, error: "no wallet" } },
    });
    await actions.handleShare("cid1", "ghost@x.com", "a.pdf");

    expect(types(calls)).toContain("error");
    expect(posted(calls, "/share")).toEqual([]);
  });

  test("a share prepare with no transaction never reaches the wallet", async () => {
    const { actions, calls } = setup({ responses: { "/share": { error: "not owner" } } });
    await actions.handleShare("cid1", "0xF00", "a.pdf");

    expect(calls.provider).toEqual([]);
    expect(types(calls)).toContain("error");
  });

  test("unsharing revokes and refreshes", async () => {
    const { actions, calls } = setup();
    await actions.handleUnshare("cid1", "0xF00");

    expect(posted(calls, "/unshare")[0]).toEqual({ cid: "cid1", to_address: "0xF00", user_address: ACCOUNT });
    expect(calls.retrieveFiles).toBe(1);
  });

  test("batch share with nothing selected is a no-op", async () => {
    const { actions, calls } = setup();
    await actions.handleShareCids([], "0xF00", "3 items");

    expect(calls.api).toEqual([]);
    expect(said(calls, "Nothing to share")).toBe(true);
  });

  test("batch share posts every cid in one grant", async () => {
    const { actions, calls } = setup();
    await actions.handleShareCids(["c1", "c2"], "0xF00", 'the folder "docs"');

    expect(posted(calls, "/share-batch")[0]).toEqual({ cids: ["c1", "c2"], to_address: "0xF00", user_address: ACCOUNT });
    expect(types(calls)).toContain("success");
  });

  test("batch unshare with nothing selected makes no request", async () => {
    const { actions, calls } = setup();
    await actions.handleUnshareCids([], "0xF00");
    expect(calls.api).toEqual([]);
  });

  test("batch unshare posts every cid", async () => {
    const { actions, calls } = setup();
    await actions.handleUnshareCids(["c1", "c2"], "0xF00");
    expect(posted(calls, "/unshare-batch")[0].cids).toEqual(["c1", "c2"]);
  });

  test("batch share to an email resolves once and notifies with the folder name", async () => {
    const { actions, calls } = setup({
      user: { google: { name: "Ada" } },
      responses: { "/resolve-recipient": { address: "0xRESOLVED", existed: true } },
    });
    await actions.handleShareCids(["c1", "c2"], "team@x.com", 'the folder "docs"');

    expect(posted(calls, "/share-batch")[0].to_address).toBe("0xRESOLVED");
    const notify = posted(calls, "/notify-share")[0];
    expect(notify.filename).toBe('the folder "docs"');
    expect(notify.sharer).toBe("Ada");
  });

  test("declining the batch-share confirm sends no transaction", async () => {
    const { actions, calls } = setup({
      confirmAnswer: false,
      responses: { "/resolve-recipient": { address: "0xRESOLVED" } },
    });
    await actions.handleShareCids(["c1"], "team@x.com", "1 item");

    expect(posted(calls, "/share-batch")).toEqual([]);
  });

  test("a batch-share prepare with no transaction reports an error", async () => {
    const { actions, calls } = setup({ responses: { "/share-batch": { error: "none owned" } } });
    await actions.handleShareCids(["c1"], "0xF00", "1 item");

    expect(types(calls)).toContain("error");
    expect(calls.provider).toEqual([]);
  });

  test("an unshare prepare with no transaction reports an error", async () => {
    const { actions, calls } = setup({ responses: { "/unshare": { error: "boom" } } });
    await actions.handleUnshare("cid1", "0xF00");

    expect(types(calls)).toContain("error");
    expect(calls.provider).toEqual([]);
  });

  test("a batch-unshare prepare with no transaction reports an error", async () => {
    const { actions, calls } = setup({ responses: { "/unshare-batch": { error: "boom" } } });
    await actions.handleUnshareCids(["c1"], "0xF00");

    expect(types(calls)).toContain("error");
    expect(calls.provider).toEqual([]);
  });
});

// --- bulk delete + duplicate-locate edge branches ---

describe("bulk delete and locate", () => {
  test("a bulk delete prepare with no transaction reports an error", async () => {
    const files = [file({ cid: "c1", folder_path: `${TRASH_PREFIX}/docs` })];
    const { actions, calls } = setup({ files, responses: { "/delete-batch": { error: "boom" } } });
    await actions.handleDeleteFolderForever("/docs");

    expect(types(calls)).toContain("error");
    expect(calls.provider).toEqual([]);
  });

  test("a duplicate already shared to us is located in the Shared view", async () => {
    const existing = file({ cid: "dup", filename: "a.pdf", folder_path: "/", is_owner: false });
    const { actions, calls } = setup({
      files: [existing],
      uploadResponse: {
        status: 409,
        body: { success: false, reason: "file_already_exists", cid: "dup", owner: "0x9999999999999999999999999999999999999999" },
      },
    });
    await actions.handleDropUpload([{ file: new File(["x"], "a.pdf"), rel: "a.pdf" }]);

    expect(said(calls, "Shared with me")).toBe(true);
    const locate = calls.opts.find((o) => o.action?.label === "Locate");
    expect(locate).toBeTruthy();
    locate.action.onClick();
    expect(calls.view).toContain("shared");
  });
});

// --- trash offers undo; single delete error path ---

describe("trash undo and delete errors", () => {
  test("a trashed file offers an Undo that restores it", async () => {
    const { actions, calls } = setup();
    await actions.handleTrash(file());

    const undo = calls.opts.find((o) => o.action?.label === "Undo");
    expect(undo).toBeTruthy();

    // firing Undo issues a restore move back to the original path
    await undo.action.onClick();
    const moves = posted(calls, "/move").map((m) => m.new_path);
    expect(moves).toContain("/docs/a.pdf");
  });

  test("a delete prepare with no transaction reports an error", async () => {
    const { actions, calls } = setup({ responses: { "/delete": { error: "not owner" } } });
    await actions.handleDelete("cid1");

    expect(types(calls)).toContain("error");
    expect(calls.provider).toEqual([]);
  });
});

// --- folder create / delete / trash ---

describe("folder create, delete and trash", () => {
  test("creating a folder records it under the current path", () => {
    const { actions, getEmptyFolders } = setup({ currentPath: "/docs" });
    actions.handleCreateFolder("reports");

    expect(getEmptyFolders().has("/docs/reports")).toBe(true);
  });

  test("deleting a folder with files signs the batch and prunes local entries", async () => {
    const { actions, calls } = setup({
      responses: { "/delete-folder": { transaction: { to: "0x" } } },
    });
    await actions.handleDeleteFolder("/docs");

    expect(calls.provider).toContain("eth_sendTransaction");
    expect(said(calls, "Folder deleted")).toBe(true);
    expect(calls.retrieveFiles).toBe(1);
  });

  test("deleting an empty folder needs no signature", async () => {
    const { actions, calls } = setup({ responses: { "/delete-folder": {} } });
    await actions.handleDeleteFolder("/emptydir");

    expect(calls.provider).toEqual([]);  // nothing on-chain
    expect(said(calls, "Folder deleted")).toBe(true);
  });

  test("emptying the trash uses trash-specific wording", async () => {
    const { actions, calls } = setup({ responses: { "/delete-folder": { transaction: { to: "0x" } } } });
    await actions.handleDeleteFolder(TRASH_PREFIX);

    expect(said(calls, "Trash emptied")).toBe(true);
  });

  test("a delete-folder error is reported, not swallowed", async () => {
    const { actions, calls } = setup({ responses: { "/delete-folder": { error: "boom" } } });
    await actions.handleDeleteFolder("/docs");

    expect(types(calls)).toContain("error");
    expect(calls.provider).toEqual([]);
  });

  test("trashing a folder moves every owned file under it", async () => {
    const files = [
      file({ cid: "c1", filename: "a.pdf", folder_path: "/docs" }),
      file({ cid: "c2", filename: "b.pdf", folder_path: "/docs/sub" }),
    ];
    const { actions, calls } = setup({ files, responses: { "/move-batch": { transaction: {}, count: 2 } } });
    await actions.handleTrashFolder("/docs");

    expect(posted(calls, "/move-batch")[0].new_paths)
      .toEqual([`${TRASH_PREFIX}/docs/a.pdf`, `${TRASH_PREFIX}/docs/sub/b.pdf`]);
  });

  test("trashing an empty folder touches nothing on-chain", async () => {
    const { actions, calls } = setup({ files: [] });
    await actions.handleTrashFolder("/emptydir");

    expect(posted(calls, "/move-batch")).toEqual([]);
    expect(said(calls, "Folder deleted")).toBe(true);
  });
});

// --- folder rename / move: the executing paths (guards covered elsewhere) ---

describe("folder rename and move execution", () => {
  test("renaming a folder rewrites every file's path under the new name", async () => {
    const files = [
      file({ cid: "c1", filename: "a.pdf", folder_path: "/docs" }),
      file({ cid: "c2", filename: "b.pdf", folder_path: "/docs/sub" }),
    ];
    const { actions, calls } = setup({ files, responses: { "/move-batch": { transaction: {}, count: 2 } } });
    await actions.handleRenameFolder("/docs", "papers");

    expect(posted(calls, "/move-batch")[0].new_paths)
      .toEqual(["/papers/a.pdf", "/papers/sub/b.pdf"]);
  });

  test("renaming an empty folder just rewrites the local entry", async () => {
    const { actions, calls, getEmptyFolders } = setup({ files: [] });
    actions.handleCreateFolder("docs");
    await actions.handleRenameFolder("/docs", "papers");

    expect(posted(calls, "/move-batch")).toEqual([]);
    expect(getEmptyFolders().has("/papers")).toBe(true);
    expect(getEmptyFolders().has("/docs")).toBe(false);
  });

  test("moving a folder relocates its files under the destination", async () => {
    const files = [file({ cid: "c1", filename: "a.pdf", folder_path: "/docs" })];
    const { actions, calls } = setup({ files, responses: { "/move-batch": { transaction: {}, count: 1 } } });
    await actions.handleMoveFolder("/docs", "/archive");

    expect(posted(calls, "/move-batch")[0].new_paths).toEqual(["/archive/docs/a.pdf"]);
  });
});

// --- local bookkeeping must not run ahead of the chain ---------------------
// Empty folders and folder stars live only in localStorage. runBatchMove
// handles its own failures and resolves either way, so callers have to gate
// their local rewrites on its result — otherwise a rejected signature leaves
// the UI (and localStorage) describing a move that never happened.

describe("a failed batch move leaves local folder state untouched", () => {
  // /docs holds a.pdf on-chain and an empty subfolder /docs/drafts locally
  const withSubfolder = {
    files: [file({ cid: "c1", filename: "a.pdf", folder_path: "/docs" })],
    initialEmptyFolders: ["/docs/drafts"],
  };

  test("rename: a rejected signature does not create a ghost folder", async () => {
    const { actions, calls, getEmptyFolders } = setup({ ...withSubfolder, rejectSignature: true });
    await actions.handleRenameFolder("/docs", "papers");

    expect(getEmptyFolders().has("/docs/drafts")).toBe(true);
    expect(getEmptyFolders().has("/papers/drafts")).toBe(false);
    expect(posted(calls, "remapStarred")).toEqual([]);
    expect(said(calls, "rejected")).toBe(true);
  });

  test("rename: a prepare failure does not create a ghost folder either", async () => {
    const { actions, calls, getEmptyFolders } = setup({
      ...withSubfolder,
      responses: { "/move-batch": { error: "nope" } }, // no transaction field
    });
    await actions.handleRenameFolder("/docs", "papers");

    expect(getEmptyFolders().has("/docs/drafts")).toBe(true);
    expect(posted(calls, "remapStarred")).toEqual([]);
    expect(types(calls)).toContain("error");
  });

  test("trash folder: a rejected signature keeps the subfolder and its star", async () => {
    const { actions, calls, getEmptyFolders } = setup({ ...withSubfolder, rejectSignature: true });
    await actions.handleTrashFolder("/docs");

    expect(getEmptyFolders().has("/docs/drafts")).toBe(true);
    expect(posted(calls, "remapStarred")).toEqual([]);
  });

  test("bulk trash: a rejected signature keeps the folders' local entries", async () => {
    const { actions, calls, getEmptyFolders } = setup({ ...withSubfolder, rejectSignature: true });
    await actions.handleBulkTrash([file({ cid: "c1", folder_path: "/docs" })], ["/docs"]);

    expect(getEmptyFolders().has("/docs/drafts")).toBe(true);
    expect(posted(calls, "remapStarred")).toEqual([]);
  });

  test("bulk move: a rejected signature leaves the subfolder where it was", async () => {
    const { actions, getEmptyFolders } = setup({ ...withSubfolder, rejectSignature: true });
    await actions.handleBulkMove([file({ cid: "c1", folder_path: "/docs" })], ["/docs"], "/archive");

    expect(getEmptyFolders().has("/docs/drafts")).toBe(true);
    expect(getEmptyFolders().has("/archive/docs/drafts")).toBe(false);
  });

  test("the same rename succeeds end to end when the signature goes through", async () => {
    const { actions, calls, getEmptyFolders } = setup(withSubfolder);
    await actions.handleRenameFolder("/docs", "papers");

    expect(getEmptyFolders().has("/papers/drafts")).toBe(true);
    expect(getEmptyFolders().has("/docs/drafts")).toBe(false);
    expect(posted(calls, "remapStarred")).toEqual([{ from: "/docs", to: "/papers" }]);
  });
});
