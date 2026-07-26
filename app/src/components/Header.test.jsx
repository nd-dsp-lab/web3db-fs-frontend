import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Header from "./Header";
import { LayoutContext } from "../contexts/LayoutContext";

// Header is the top bar: search box, theme toggle and the account chip. The
// chip label depends on how the user signed in (social vs wallet), and logging
// out goes through the shared confirm dialog.

const THEME = { searchBg: "#f1f1f1", text: "#000", subText: "#888" };
const ACCOUNT = "0xAbCdEf0123456789012345678901234567890123";

function renderHeader(over = {}) {
  const ctx = {
    theme: THEME, searchQuery: "", setSearchQuery: vi.fn(),
    darkMode: false, toggleTheme: vi.fn(),
    account: null, connectWallet: vi.fn(), disconnectWallet: vi.fn(),
    user: null, confirm: vi.fn().mockResolvedValue(true),
    ...over,
  };
  render(
    <LayoutContext.Provider value={ctx}>
      <Header />
    </LayoutContext.Provider>
  );
  return { ctx };
}

test("typing in the search box reports each keystroke", () => {
  const { ctx } = renderHeader();
  fireEvent.change(screen.getByPlaceholderText("Search in Web3FS"), { target: { value: "invoice" } });
  expect(ctx.setSearchQuery).toHaveBeenCalledWith("invoice");
});

test("the theme toggle fires and its tooltip follows the current mode", () => {
  const { ctx } = renderHeader();
  const toggle = screen.getByTitle("Switch to dark mode");

  fireEvent.click(toggle);
  expect(ctx.toggleTheme).toHaveBeenCalled();

  fireEvent.mouseEnter(toggle);
  expect(toggle).toHaveStyle({ backgroundColor: THEME.searchBg });
  fireEvent.mouseLeave(toggle);
  expect(toggle).not.toHaveStyle({ backgroundColor: THEME.searchBg });
});

test("in dark mode the toggle offers to switch back to light", () => {
  renderHeader({ darkMode: true });
  expect(screen.getByTitle("Switch to light mode")).toBeInTheDocument();
});

test("signed out, the bar shows Sign in and connects on click", () => {
  const { ctx } = renderHeader();
  fireEvent.click(screen.getByText("Sign in"));
  expect(ctx.connectWallet).toHaveBeenCalled();
});

test("a wallet account is shown truncated, with the full address as the tooltip", () => {
  renderHeader({ account: ACCOUNT });
  expect(screen.getByText("0xAbCd...0123")).toBeInTheDocument();
  expect(screen.getByTitle(ACCOUNT)).toBeInTheDocument();
  expect(screen.getByText("0")).toBeInTheDocument(); // avatar letter
});

test("a social account prefers the profile name, then the email", () => {
  renderHeader({ account: ACCOUNT, user: { google: { name: "ada lovelace" } } });
  expect(screen.getByText("ada lovelace")).toBeInTheDocument();
  expect(screen.getByText("A")).toBeInTheDocument();
});

test("email-only users fall back to the email address", () => {
  renderHeader({ account: ACCOUNT, user: { email: { address: "ada@example.com" } } });
  expect(screen.getByText("ada@example.com")).toBeInTheDocument();
});

test("clicking the account chip logs out once the confirm is accepted", async () => {
  const { ctx } = renderHeader({ account: ACCOUNT });
  fireEvent.click(screen.getByTitle(ACCOUNT));

  expect(ctx.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Log out" }));
  await waitFor(() => expect(ctx.disconnectWallet).toHaveBeenCalled());
});

test("declining the confirm keeps the session", async () => {
  const { ctx } = renderHeader({ account: ACCOUNT, confirm: vi.fn().mockResolvedValue(false) });
  fireEvent.click(screen.getByTitle(ACCOUNT));

  await waitFor(() => expect(ctx.confirm).toHaveBeenCalled());
  expect(ctx.disconnectWallet).not.toHaveBeenCalled();
});
