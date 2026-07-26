import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// CRA/Jest unmounted the tree between tests automatically; under Vitest we
// register the same cleanup explicitly.
afterEach(() => cleanup());

// Node 22+ defines a global `localStorage` whose methods only work when the
// process is started with --localstorage-file. It wins over the jsdom one, so
// on a newer Node than .nvmrc pins, every test touching storage dies with
// "localStorage.clear is not a function". Swap in a working Storage when that
// happens; on Node 20 jsdom's own object is intact and this does nothing.
if (typeof globalThis.localStorage?.clear !== "function") {
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
    setItem: (k, v) => store.set(String(k), String(v)),
    removeItem: (k) => store.delete(String(k)),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: storage, configurable: true, writable: true,
  });
}
