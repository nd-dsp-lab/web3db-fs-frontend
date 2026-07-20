// Central fetch helpers. Every request to the backend needs the ngrok
// skip-warning header, and almost every write is a JSON POST — this keeps
// that boilerplate in one place. `makeApi(baseUrl)` binds the backend URL.

export const NGROK_HEADER = { "ngrok-skip-browser-warning": "true" };

export function makeApi(baseUrl) {
  const url = (path) => `${baseUrl}${path}`;
  return {
    url,
    // GET with the ngrok header (plus any extra, e.g. x-auth-token)
    get: (path, headers = {}) =>
      fetch(url(path), { headers: { ...NGROK_HEADER, ...headers } }),
    // JSON POST — body is serialized, Content-Type + ngrok header attached
    post: (path, body, headers = {}) =>
      fetch(url(path), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...NGROK_HEADER, ...headers },
        body: JSON.stringify(body),
      }),
  };
}
