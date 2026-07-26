import { makeApi } from "./api";

// makeApi centralizes the backend fetch boilerplate: JSON serialization on
// POST and base-URL binding.

const BASE = "https://backend.example";

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true });
});
afterEach(() => vi.restoreAllMocks());

test("url() binds the base URL to a path", () => {
  const api = makeApi(BASE);
  expect(api.url("/files")).toBe(`${BASE}/files`);
});

test("get passes per-call headers straight through", () => {
  const api = makeApi(BASE);
  api.get("/data", { "x-auth-token": "tok" });

  expect(global.fetch).toHaveBeenCalledWith(`${BASE}/data`, {
    headers: { "x-auth-token": "tok" },
  });
});

test("post serializes the body and sets the JSON content type", () => {
  const api = makeApi(BASE);
  api.post("/share", { cid: "c1" });

  expect(global.fetch).toHaveBeenCalledWith(`${BASE}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cid: "c1" }),
  });
});

test("post lets callers add headers without dropping the content type", () => {
  const api = makeApi(BASE);
  api.post("/x", { a: 1 }, { "x-auth-token": "tok" });

  const [, opts] = global.fetch.mock.calls[0];
  expect(opts.headers).toEqual({
    "Content-Type": "application/json",
    "x-auth-token": "tok",
  });
});

// The backend is reached through an EC2 reverse proxy at proxy.web3db.org.
// It used to be an ngrok tunnel, which required a skip-warning header on
// every request; nothing serves that role now, so nothing should send it.
test("no tunnel-era headers are sent", () => {
  const api = makeApi(BASE);
  api.get("/data", { "x-auth-token": "tok" });
  api.post("/x", { a: 1 });

  for (const [, opts] of global.fetch.mock.calls) {
    expect(Object.keys(opts.headers)).not.toContain("ngrok-skip-browser-warning");
  }
});

describe("sharedUsers", () => {
  const withResponse = (body) => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
  };

  test("a single file asks by cid, authenticated", async () => {
    withResponse({ shared_with: ["0xA", "0xB"] });
    const list = await makeApi(BASE).sharedUsers({ cid: "c1" }, "tok");

    expect(global.fetch).toHaveBeenCalledWith(`${BASE}/shared-users?cid=c1`, {
      headers: { "x-auth-token": "tok" },
    });
    expect(list).toEqual(["0xA", "0xB"]);
  });

  test("cids that need escaping survive the query string", async () => {
    withResponse({});
    await makeApi(BASE).sharedUsers({ cid: "a/b+c" }, "tok");

    expect(global.fetch.mock.calls[0][0]).toBe(`${BASE}/shared-users?cid=a%2Fb%2Bc`);
  });

  // A folder has no on-chain identity, so its answer is the union across the
  // cids it holds — a POST only because that list won't fit in a query string.
  test("a folder posts its cid list instead", async () => {
    withResponse({ shared_with: ["0xA"] });
    await makeApi(BASE).sharedUsers({ cids: ["c1", "c2"] }, "tok");

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe(`${BASE}/shared-users-batch`);
    expect(opts.method).toBe("POST");
    expect(opts.headers["x-auth-token"]).toBe("tok");
    const body = JSON.parse(opts.body);
    expect(body.cids).toEqual(["c1", "c2"]);
    // Identity comes from the token; sending an address would invite a
    // backend that trusts it.
    expect(body).not.toHaveProperty("user_address");
  });

  // An unshared file comes back without the key rather than with an empty
  // list; callers render the result directly, so it has to be an array.
  test("a response with no shared_with is an empty list, not undefined", async () => {
    withResponse({});
    expect(await makeApi(BASE).sharedUsers({ cid: "c1" }, "tok")).toEqual([]);
  });
});
