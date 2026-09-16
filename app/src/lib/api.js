// Central fetch helpers. Almost every write is a JSON POST and every call
// needs the backend's base URL bound to it — this keeps that boilerplate in
// one place. `makeApi(baseUrl)` binds the backend URL.

export function makeApi(baseUrl) {
  const url = (path) => `${baseUrl.replace(/\/$/, "")}${path}`;
  const get = (path, headers = {}) => fetch(url(path), { headers });
  const post = (path, body, headers = {}) =>
    fetch(url(path), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  return {
    url,
    // GET; headers is for per-call additions, e.g. x-auth-token
    get,
    // JSON POST — body is serialized, Content-Type attached
    post,

    // Who a file is shared with. A folder has no identity on-chain, so its
    // answer is the union across the cids it contains — a POST only because
    // that list doesn't fit in a query string, not because it changes
    // anything. Both callers want the same thing: a plain list of addresses.
    //
    // The backend identifies the requester from the token, so neither form
    // sends an address — a claimed one would be ignored anyway.
    sharedUsers: async ({ cid, cids }, authToken) => {
      const auth = { "x-auth-token": authToken };
      const res = cids
        ? await post("/shared-users-batch", { cids }, auth)
        : await get(`/shared-users?cid=${encodeURIComponent(cid)}`, auth);
      const data = await res.json();
      return data.shared_with || [];
    },
  };
}
