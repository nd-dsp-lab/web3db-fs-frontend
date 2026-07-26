import "@testing-library/jest-dom";
import { render, screen, cleanup } from "@testing-library/react";
import { Thumbnail } from "./Thumbnail";
import { makeApi } from "../lib/api";

// Thumbnails are fetched rather than set as <img src> because the endpoint
// needs an auth header, and cached at module level so scrolling never
// refetches. The cache
// is the delicate part: caching a *failure* is only safe when that failure is
// about the file, not about the request.

const FALLBACK = <span data-testid="fallback">icon</span>;

function renderThumb(cid, authToken = "tok") {
  return render(
    <Thumbnail cid={cid} filename="a.png" api={makeApi("http://api")} fallback={FALLBACK} authToken={authToken} />
  );
}

const imageResponse = () => ({
  ok: true,
  headers: { get: () => "image/png" },
  blob: async () => new Blob(["img"]),
});
const errorResponse = (status) => ({ ok: false, status, headers: { get: () => "application/json" } });

beforeEach(() => {
  global.URL.createObjectURL = vi.fn(() => "blob:thumb");
  global.URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

test("a served thumbnail is rendered and then reused from cache", async () => {
  global.fetch = vi.fn().mockResolvedValue(imageResponse());
  renderThumb("cid-ok");
  expect(await screen.findByRole("img")).toHaveAttribute("src", "blob:thumb");

  cleanup();
  renderThumb("cid-ok");
  expect(screen.getByRole("img")).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledTimes(1); // second mount hit the cache
});

test("no thumbnail for this file is remembered, so it is asked for once", async () => {
  global.fetch = vi.fn().mockResolvedValue(errorResponse(404));
  renderThumb("cid-none");
  expect(await screen.findByTestId("fallback")).toBeInTheDocument();

  cleanup();
  renderThumb("cid-none");
  expect(await screen.findByTestId("fallback")).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test("an auth failure is not cached, so a later render retries", async () => {
  // A stale or not-yet-valid token 401s. Caching that would leave a whole
  // grid of fallback icons for the rest of the session, even after re-auth.
  global.fetch = vi.fn().mockResolvedValue(errorResponse(401));
  renderThumb("cid-401", "stale-tok");
  expect(await screen.findByTestId("fallback")).toBeInTheDocument();

  cleanup();
  global.fetch = vi.fn().mockResolvedValue(imageResponse());
  renderThumb("cid-401", "fresh-tok");

  expect(await screen.findByRole("img")).toHaveAttribute("src", "blob:thumb");
  expect(global.fetch).toHaveBeenCalledTimes(1); // refetched with the new token
});

test("a network error is not cached either", async () => {
  global.fetch = vi.fn().mockRejectedValue(new Error("offline"));
  renderThumb("cid-net");
  expect(await screen.findByTestId("fallback")).toBeInTheDocument();

  cleanup();
  global.fetch = vi.fn().mockResolvedValue(imageResponse());
  renderThumb("cid-net");
  expect(await screen.findByRole("img")).toBeInTheDocument();
});

test("nothing is requested before the download token arrives", () => {
  global.fetch = vi.fn();
  renderThumb("cid-notoken", null);

  expect(global.fetch).not.toHaveBeenCalled();
  expect(screen.getByTestId("fallback")).toBeInTheDocument();
});
