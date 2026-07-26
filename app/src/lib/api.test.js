import { makeApi, NGROK_HEADER } from "./api";

// makeApi centralizes the backend fetch boilerplate: the ngrok skip-warning
// header on every call, JSON serialization on POST, and base-URL binding.

const BASE = "https://backend.example";

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true });
});
afterEach(() => vi.restoreAllMocks());

test("url() binds the base URL to a path", () => {
  const api = makeApi(BASE);
  expect(api.url("/files")).toBe(`${BASE}/files`);
});

test("get attaches the ngrok header and merges extras", () => {
  const api = makeApi(BASE);
  api.get("/data", { "x-auth-token": "tok" });

  expect(global.fetch).toHaveBeenCalledWith(`${BASE}/data`, {
    headers: { ...NGROK_HEADER, "x-auth-token": "tok" },
  });
});

test("post serializes the body and sets JSON + ngrok headers", () => {
  const api = makeApi(BASE);
  api.post("/share", { cid: "c1" });

  expect(global.fetch).toHaveBeenCalledWith(`${BASE}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...NGROK_HEADER },
    body: JSON.stringify({ cid: "c1" }),
  });
});

test("post lets callers add headers without dropping the defaults", () => {
  const api = makeApi(BASE);
  api.post("/x", { a: 1 }, { "x-auth-token": "tok" });

  const [, opts] = global.fetch.mock.calls[0];
  expect(opts.headers).toMatchObject({
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
    "x-auth-token": "tok",
  });
});
