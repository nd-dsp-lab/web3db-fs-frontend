import "@testing-library/jest-dom";
import { render, act, waitFor, screen } from "@testing-library/react";
import App from "./App";

// App is the orchestrator: it wires Privy auth, the API, theme, and every
// file-action hook, then hands a large prop bundle to AppLayout. We mock the
// three seams it can't run headless (Privy, the API, matchMedia) and stub
// AppLayout to a prop-capturing sink, so the assertions target App's own
// logic rather than the whole component tree.

// Vitest hoists vi.mock() above these declarations, so the holders the mock
// factories reference must be created with vi.hoisted (Vitest's equivalent of
// Jest's mock-prefixed-variable exemption).
const { mockPrivy, mockWallets, mockApi, mockCapture } = vi.hoisted(() => ({
  mockPrivy: { value: {} },
  mockWallets: { value: [] },
  mockApi: { get: vi.fn(), post: vi.fn() },
  mockCapture: { props: null },
}));

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => mockPrivy.value,
  useWallets: () => ({ wallets: mockWallets.value }),
}));

vi.mock("./lib/api", () => ({
  makeApi: () => ({
    get: (...a) => mockApi.get(...a),
    post: (...a) => mockApi.post(...a),
    url: (p) => `http://api${p}`,
  }),
}));

// App hands the bundle down through WorkspaceContext, so the sink reads the
// context value instead of props — same assertions, one layer over.
vi.mock("./components/AppLayout", async () => {
  const { useWorkspace } = await import("./contexts/WorkspaceContext");
  return {
    default: function AppLayoutStub() {
      mockCapture.props = useWorkspace();
      return <div data-testid="app-layout" />;
    },
  };
});

// App swaps in the landing page when there is no session. It reads the same
// context, so the sink captures either branch and the signed-out tests below
// still see the bundle.
vi.mock("./components/Landing", async () => {
  const { useWorkspace } = await import("./contexts/WorkspaceContext");
  return {
    default: function LandingStub() {
      mockCapture.props = useWorkspace();
      return <div data-testid="landing" />;
    },
  };
});

const ADDR = "0x1A28b19f6d2ea1A05F9eFFbcCcbF7E9571877981";

function embeddedWallet() {
  return {
    address: ADDR,
    walletClientType: "privy",
    getEthereumProvider: async () => ({
      request: async ({ method }) => (method === "personal_sign" ? "0xsig" : null),
    }),
  };
}

// Files fixture: two owned files under /docs (one shared with 0xAAA), one
// file owned by someone else, plus a trashed file.
const FILES = [
  { cid: "c1", filename: "a.pdf", folder_path: "/docs", is_owner: true, size: 100, shared_with: ["0xAAA"], timestamp: 10 },
  { cid: "c2", filename: "b.pdf", folder_path: "/docs", is_owner: true, size: 200, shared_with: ["0xAAA", "0xBBB"], timestamp: 20 },
  { cid: "c3", filename: "c.pdf", folder_path: "/", is_owner: false, size: 999, owner: "0xOWNER" },
];

function stubApi() {
  mockApi.get.mockImplementation((path) => {
    if (path.startsWith("/storage-stats")) return Promise.resolve({ json: async () => ({ disk_free: 1000 }) });
    if (path.startsWith("/?user_address")) return Promise.resolve({ json: async () => ({ user_files: FILES }) });
    return Promise.resolve({ json: async () => ({}) });
  });
  mockApi.post.mockResolvedValue({ ok: true, json: async () => ({ token: "tok", expires: 9_999_999_999 }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCapture.props = null;
  localStorage.clear();
  window.matchMedia = (q) => ({
    matches: false, media: q,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  stubApi();
});
afterEach(() => vi.restoreAllMocks());

function renderApp() {
  // render auto-wraps in act; async mount effects (auth token, fund, file /
  // storage fetches) are awaited per-test via waitFor where their result matters.
  render(<App />);
}

describe("authentication → account", () => {
  test("signed-out: no account and no file fetch", async () => {
    mockPrivy.value = { ready: true, authenticated: false, login: vi.fn(), logout: vi.fn(), user: null };
    mockWallets.value = [];
    await renderApp();

    expect(mockCapture.props.account).toBeNull();
    expect(mockApi.get).not.toHaveBeenCalledWith(expect.stringContaining("/?user_address"));
  });

  test("social login uses the Privy embedded wallet as the account", async () => {
    mockPrivy.value = { ready: true, authenticated: true, login: vi.fn(), logout: vi.fn(), user: { google: { name: "Ada" } } };
    // useWallets can list a stale MetaMask first — the embedded one must win
    mockWallets.value = [
      { address: "0xEXTERNAL", walletClientType: "metamask", getEthereumProvider: async () => ({ request: async () => null }) },
      embeddedWallet(),
    ];
    await renderApp();

    await waitFor(() => expect(mockCapture.props.account).toBe(ADDR));
    expect(mockApi.get).toHaveBeenCalledWith(`/?user_address=${ADDR}`);
  });
});

describe("storage math", () => {
  test("storageUsed counts only owned files; quota adds disk_free", async () => {
    mockPrivy.value = { ready: true, authenticated: true, login: vi.fn(), logout: vi.fn(), user: { google: { name: "Ada" } } };
    mockWallets.value = [embeddedWallet()];
    await renderApp();

    await waitFor(() => expect(mockCapture.props.storageUsed).toBe(300)); // 100 + 200, not the 999 shared-in file
    await waitFor(() => expect(mockCapture.props.storageQuota).toBe(1300)); // used + disk_free
  });
});

describe("folder helpers derived from the file list", () => {
  async function renderAuthed() {
    mockPrivy.value = { ready: true, authenticated: true, login: vi.fn(), logout: vi.fn(), user: { google: { name: "Ada" } } };
    mockWallets.value = [embeddedWallet()];
    renderApp();
    // wait until the file list has actually loaded (folder helpers read it)
    await waitFor(() => expect(mockCapture.props.storageUsed).toBe(300));
  }

  test("folderCidsOf returns the owned cids under a folder", async () => {
    await renderAuthed();
    expect(mockCapture.props.folderCidsOf("/docs").sort()).toEqual(["c1", "c2"]);
  });

  test("folderStatsOf aggregates count, size and the shared-with intersection", async () => {
    await renderAuthed();
    const stats = mockCapture.props.folderStatsOf("/docs");
    expect(stats.fileCount).toBe(2);
    expect(stats.size).toBe(300);
    // shared-with is the intersection across every owned file in the folder
    expect(stats.sharedWith).toEqual(["0xAAA"]);
    expect(stats.owned).toBe(true);
  });
});

describe("session lifecycle", () => {
  test("disconnect logs out and clears the session", async () => {
    const logout = vi.fn().mockResolvedValue();
    mockPrivy.value = { ready: true, authenticated: true, login: vi.fn(), logout, user: { google: { name: "Ada" } } };
    mockWallets.value = [embeddedWallet()];
    await renderApp();
    await waitFor(() => expect(mockCapture.props.account).toBe(ADDR));

    await act(async () => { await mockCapture.props.disconnectWallet(); });
    expect(logout).toHaveBeenCalled();
  });

  test("disconnect also drops the cached download token", async () => {
    // The token is a 24h bearer credential the backend cannot revoke, so
    // logging out has to remove it rather than just clearing React state.
    const key = `authToken:${ADDR.toLowerCase()}`;
    localStorage.setItem(key, JSON.stringify({ token: "cached-tok", expires: 9_999_999_999 }));
    mockPrivy.value = { ready: true, authenticated: true, login: vi.fn(), logout: vi.fn().mockResolvedValue(), user: { google: { name: "Ada" } } };
    mockWallets.value = [embeddedWallet()];
    await renderApp();
    await waitFor(() => expect(mockCapture.props.authToken).toBe("cached-tok"));

    await act(async () => { await mockCapture.props.disconnectWallet(); });

    expect(localStorage.getItem(key)).toBeNull();
    expect(mockCapture.props.authToken).toBeNull();
  });

  test("a cached, unexpired auth token is reused without re-signing", async () => {
    localStorage.setItem(
      `authToken:${ADDR.toLowerCase()}`,
      JSON.stringify({ token: "cached-tok", expires: 9_999_999_999 })
    );
    mockPrivy.value = { ready: true, authenticated: true, login: vi.fn(), logout: vi.fn(), user: { google: { name: "Ada" } } };
    mockWallets.value = [embeddedWallet()];
    await renderApp();

    await waitFor(() => expect(mockCapture.props.authToken).toBe("cached-tok"));
    // reused from cache — never posted to /auth/token
    expect(mockApi.post).not.toHaveBeenCalledWith("/auth/token", expect.anything());
  });
});

describe("signed-out landing", () => {
  test("no session shows the landing page, not the empty drive", async () => {
    mockPrivy.value = { ready: true, authenticated: false, login: vi.fn(), logout: vi.fn(), user: null };
    mockWallets.value = [];
    await renderApp();

    expect(screen.getByTestId("landing")).toBeInTheDocument();
    expect(screen.queryByTestId("app-layout")).not.toBeInTheDocument();
  });

  test("a restored session shows the drive before the wallet arrives", async () => {
    // Privy reports `authenticated` a tick ahead of useWallets(), so gating on
    // the address would flash the landing page at a signed-in user.
    mockPrivy.value = { ready: true, authenticated: true, login: vi.fn(), logout: vi.fn(), user: { google: { name: "Ada" } } };
    mockWallets.value = [];
    await renderApp();

    expect(screen.getByTestId("app-layout")).toBeInTheDocument();
    expect(mockCapture.props.account).toBeNull();
  });

  test("neither renders until Privy is ready", async () => {
    mockPrivy.value = { ready: false, authenticated: false, login: vi.fn(), logout: vi.fn(), user: null };
    mockWallets.value = [];
    await renderApp();

    expect(screen.queryByTestId("landing")).not.toBeInTheDocument();
    expect(screen.queryByTestId("app-layout")).not.toBeInTheDocument();
  });
});

describe("theme", () => {
  test("toggleTheme flips dark mode and persists the choice", async () => {
    mockPrivy.value = { ready: true, authenticated: false, login: vi.fn(), logout: vi.fn(), user: null };
    mockWallets.value = [];
    await renderApp();

    expect(mockCapture.props.darkMode).toBe(false); // matchMedia reports light
    await act(async () => { mockCapture.props.toggleTheme(); });

    expect(mockCapture.props.darkMode).toBe(true);
    expect(localStorage.getItem("themePref")).toBe("dark");
  });
});

// --- concurrent refreshes and auth retries -------------------------------
// retrieveFiles depends on emptyFolders, so creating a folder (a purely local
// operation) triggers a second refresh. That is the real path by which two
// file fetches end up in flight at once.

describe("retrieveFiles ordering", () => {
  test("a slow earlier refresh cannot overwrite a newer file list", async () => {
    const older = [{ cid: "old", filename: "old.pdf", folder_path: "/", is_owner: true, size: 1 }];
    const newer = [{ cid: "new", filename: "new.pdf", folder_path: "/", is_owner: true, size: 2 }];
    let releaseFirst;
    let call = 0;
    mockApi.get.mockImplementation((path) => {
      if (path.startsWith("/storage-stats")) return Promise.resolve({ json: async () => ({ disk_free: 1000 }) });
      if (!path.startsWith("/?user_address")) return Promise.resolve({ json: async () => ({}) });
      call += 1;
      // Mount fires more than one refresh on its own (loading emptyFolders
      // changes retrieveFiles), so defer whichever lands first and let every
      // later one resolve immediately with the newer list.
      if (call === 1) return new Promise((res) => { releaseFirst = () => res({ json: async () => ({ user_files: older }) }); });
      return Promise.resolve({ json: async () => ({ user_files: newer }) });
    });

    mockPrivy.value = { ready: true, authenticated: true, login: vi.fn(), logout: vi.fn(), user: { google: { name: "Ada" } } };
    mockWallets.value = [embeddedWallet()];
    renderApp();
    await waitFor(() => expect(mockCapture.props.account).toBe(ADDR));

    // a later refresh resolves right away with the newer list
    await act(async () => { mockCapture.props.handleCreateFolder("docs"); });
    await waitFor(() => expect(mockCapture.props.displayItems.some((f) => f.cid === "new")).toBe(true));

    // now the stale first response finally lands — it must be discarded
    await act(async () => { releaseFirst(); });

    const cids = mockCapture.props.displayItems.filter((i) => i.type !== "folder").map((f) => f.cid);
    expect(cids).toContain("new");
    expect(cids).not.toContain("old");
  });

  test("a failed refresh tells the user instead of failing silently", async () => {
    mockApi.get.mockImplementation((path) => {
      if (path.startsWith("/storage-stats")) return Promise.resolve({ json: async () => ({ disk_free: 1000 }) });
      if (path.startsWith("/?user_address")) return Promise.reject(new Error("network down"));
      return Promise.resolve({ json: async () => ({}) });
    });
    mockPrivy.value = { ready: true, authenticated: true, login: vi.fn(), logout: vi.fn(), user: { google: { name: "Ada" } } };
    mockWallets.value = [embeddedWallet()];
    renderApp();

    expect(await screen.findByText(/Couldn't load your files/i)).toBeInTheDocument();
  });
});

describe("download auth token", () => {
  test("a transient failure is retried rather than disabling downloads all session", async () => {
    // The address is latched in authRequested to keep it to one prompt per
    // session; if a failure left it latched, downloads stayed dead until a
    // full page reload.
    // Path-aware: /fund-wallet also posts on mount and would otherwise eat
    // the one-shot rejection meant for /auth/token.
    let authAttempts = 0;
    mockApi.post.mockImplementation((path) => {
      if (path !== "/auth/token") return Promise.resolve({ ok: true, json: async () => ({}) });
      authAttempts += 1;
      if (authAttempts === 1) return Promise.reject(new Error("backend hiccup"));
      return Promise.resolve({ ok: true, json: async () => ({ token: "tok2", expires: 9_999_999_999 }) });
    });

    mockPrivy.value = { ready: true, authenticated: true, login: vi.fn(), logout: vi.fn(), user: { google: { name: "Ada" } } };
    mockWallets.value = [embeddedWallet()];
    const { rerender } = render(<App />);

    expect(await screen.findByText(/Sign-in verification failed/i)).toBeInTheDocument();
    expect(mockCapture.props.authToken).toBeNull();

    // a new wallet object re-runs the effect for the same account
    mockWallets.value = [embeddedWallet()];
    rerender(<App />);

    await waitFor(() => expect(mockCapture.props.authToken).toBe("tok2"));
  });
});
