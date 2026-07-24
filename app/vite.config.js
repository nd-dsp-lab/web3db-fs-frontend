import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Migrated from Create React App. Two CRA-isms need handling:
//  1. JSX lives in .js files (App.js, index.js, *.test.js), so esbuild must
//     use the jsx loader for .js — not just .jsx.
//  2. Tests were written for Jest with globals (describe/test/expect) and no
//     per-file imports, so Vitest runs with globals + a jsdom environment and
//     a setup file that wires jest-dom matchers and RTL cleanup.
export default defineConfig({
  plugins: [react()],
  esbuild: { loader: "jsx", include: /src\/.*\.jsx?$/ },
  optimizeDeps: {
    esbuildOptions: { loader: { ".js": "jsx" } },
  },
  server: { port: 3000 },
  build: { outDir: "dist" },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/setupTests.js",
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{js,jsx}"],
      exclude: ["src/index.js", "src/**/*.test.{js,jsx}"],
      // Ratchet — pinned at the coverage on the day it was set, not a target.
      // Raise as coverage rises; never lower to make a build pass.
      thresholds: {
        statements: 77,
        branches: 66,
        functions: 68,
        lines: 82,
      },
    },
  },
});
