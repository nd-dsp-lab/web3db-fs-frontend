import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import Landing from "./Landing";
import { WorkspaceContext } from "../contexts/WorkspaceContext";

function mountLanding(overrides = {}) {
  const ctx = { darkMode: false, toggleTheme: vi.fn(), connectWallet: vi.fn(), ...overrides };
  render(
    <WorkspaceContext.Provider value={ctx}>
      <Landing />
    </WorkspaceContext.Provider>
  );
  return ctx;
}

test("both sign-in buttons start the login flow", () => {
  const ctx = mountLanding();
  const buttons = screen.getAllByRole("button", { name: "Sign in" });
  expect(buttons).toHaveLength(2); // header and hero

  buttons.forEach((b) => fireEvent.click(b));
  expect(ctx.connectWallet).toHaveBeenCalledTimes(2);
});

test("the drive preview is decorative, not announced", () => {
  mountLanding();
  // It duplicates the sidebar and file names of the real app; a screen reader
  // reading them out would promise navigation that isn't there. Being hidden
  // is the point, so it is unreachable by role or by an accessible-name
  // query — the DOM is the only place left to look.
  /* eslint-disable testing-library/no-node-access */
  const preview = document.querySelector(".landing-preview");
  expect(preview).toBeInTheDocument();
  expect(preview.firstChild).toHaveAttribute("aria-hidden", "true");
  /* eslint-enable testing-library/no-node-access */
});

test("the theme toggle is available before signing in", () => {
  const ctx = mountLanding({ darkMode: true });
  fireEvent.click(screen.getByTitle("Switch to light mode"));
  expect(ctx.toggleTheme).toHaveBeenCalled();
});

test("the page explains what the product does", () => {
  mountLanding();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/without trusting the server/i);
  // one card per guarantee, so a dropped feature is a failing test
  expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(3);
});
