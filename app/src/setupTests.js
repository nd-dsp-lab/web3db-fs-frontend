import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// CRA/Jest unmounted the tree between tests automatically; under Vitest we
// register the same cleanup explicitly.
afterEach(() => cleanup());
