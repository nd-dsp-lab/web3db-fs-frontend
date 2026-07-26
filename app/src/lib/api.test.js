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
