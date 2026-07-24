# CRA → Vite migration — verify & cutover checklist

This branch (`vite-migration`) replaces Create React App / react-scripts with
Vite (build/dev) and Vitest (tests). It was authored in an environment where
`npm install` could not complete the `node_modules` link step, so **it has not
been run locally** — the steps below must be run on a machine where npm works
before this is merged.

## 1. Install (locally, where npm works)

```bash
cd web3db-fs-frontend/app
rm -rf node_modules
npm ci        # installs from the lockfile that ships on this branch
```

If `npm ci` complains that the lockfile is out of sync, run `npm install` once
and commit the updated `package-lock.json`.

## 2. Verify everything is green

```bash
npm run test:coverage      # Vitest — expect 223 passed, thresholds 77/66/68/82
npm run lint               # eslint (react-app config) — expect 0 warnings
npm run build              # vite build — expect output in app/dist/
npm run dev                # sanity: app boots at http://localhost:3000
```

Watch for these migration-specific risks when running the above:
- **JSX in `.js` files** — handled by the esbuild `jsx` loader in
  `vite.config.js`. If a `.js` file fails to parse, that config is why.
- **`App.test.js` mocks** — converted to `vi.mock` + `vi.hoisted`. This is the
  single most likely file to need a tweak; if the Privy/api/AppLayout mocks
  don't apply, check the `vi.hoisted` block.
- **Env vars** — code now reads `import.meta.env.VITE_*`. Local values live in
  `app/.env.local` (already renamed on this branch).
- **Lint** — `vi`/`vitest` are declared as globals in the `eslintConfig` block
  (react-app/jest only knows Jest's globals). If eslint errors on `import.meta`,
  the react-app parser needs a modern `ecmaVersion` — bump it in `eslintConfig`.

## 3. AWS Amplify console changes (REQUIRED before/at merge)

The Amplify build settings are **not** in the repo — update them in the console.
CD will break without these:

| Setting | Old (CRA) | New (Vite) |
| --- | --- | --- |
| Build output / `baseDirectory` | `build` | **`dist`** |
| Env var | `REACT_APP_API_BASE_URL` | **`VITE_API_BASE_URL`** (same value) |
| Env var | `REACT_APP_PRIVY_APP_ID` | **`VITE_PRIVY_APP_ID`** (same value) |
| Build command | `react-scripts build` / `npm run build` | `npm run build` (now runs `vite build`) |
| Node version | (default) | **≥ 18** |

You can pre-add the two `VITE_*` env vars now (alongside the old ones) with no
effect on the current CRA build. The `baseDirectory` flip to `dist` must happen
in the same window as the merge, since the current build still emits `build/`.

Safe cutover:
1. Pre-add `VITE_*` env vars in Amplify.
2. (Optional) Connect this branch as a temporary Amplify branch deployment with
   `dist` + `VITE_*` to prove the deploy in isolation.
3. At merge to `develop`: flip `baseDirectory` → `dist` **and** merge together.

## 4. Rollback

Everything is on the `vite-migration` branch; `develop` is untouched. To abandon,
just don't merge. If merged and the deploy misbehaves, revert the merge commit
and restore the Amplify settings (`build`, `REACT_APP_*`).
