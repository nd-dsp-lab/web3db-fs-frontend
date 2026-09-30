import { useState, useEffect, useRef, useCallback } from "react";

// The owner's incoming "please extend my access" requests, for the Shared
// with others view. One call, answered by a single getPendingRequests read on
// the contract — the owner is identified by the auth token, never by an
// address in the query.
//
// Fetched when the tab is opened and after a request is resolved, never on a
// timer: a poll would put steady eth_call load on the node for a page that
// changes a few times a week. Live updates, if ever wanted, belong on an
// AccessRequested subscription rather than an interval.
export function useShareRequests({ api, account, authToken, view }) {
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  // Approving refetches while the previous fetch may still be in flight, so
  // the same sequence guard the file list uses applies here.
  const seq = useRef(0);

  const refreshRequests = useCallback(async () => {
    if (!account || !authToken) return;
    const n = ++seq.current;
    setLoadingRequests(true);
    try {
      const res = await api.get("/share-requests", { "x-auth-token": authToken });
      const data = await res.json();
      if (n === seq.current) setRequests(data.requests || []);
    } catch (err) {
      console.error("Couldn't load share requests:", err);
      if (n === seq.current) setRequests([]);
    } finally {
      if (n === seq.current) setLoadingRequests(false);
    }
  }, [api, account, authToken]);

  useEffect(() => {
    if (view === "shared-by-me") refreshRequests();
  }, [view, refreshRequests]);

  return { requests, loadingRequests, refreshRequests };
}
