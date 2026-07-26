// Central fetch helpers. Almost every write is a JSON POST and every call
// needs the backend's base URL bound to it — this keeps that boilerplate in
// one place. `makeApi(baseUrl)` binds the backend URL.

export function makeApi(baseUrl) {
  const url = (path) => `${baseUrl}${path}`;
  return {
    url,
    // GET; headers is for per-call additions, e.g. x-auth-token
    get: (path, headers = {}) => fetch(url(path), { headers }),
    // JSON POST — body is serialized, Content-Type attached
    post: (path, body, headers = {}) =>
      fetch(url(path), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      }),
  };
}
