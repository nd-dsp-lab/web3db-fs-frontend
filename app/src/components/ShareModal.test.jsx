import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ShareModal from "./ShareModal";

// ShareModal takes explicit props. It loads the current shared-user list on
// mount, shares a typed recipient, and revokes access with a confirm.

const ACCOUNT = "0x1A28b19f6d2ea1A05F9eFFbcCcbF7E9571877981";
const OTHER = "0x3081Acc05169336e7875ad9f896bF6511397809a";

function mockShared(list) {
  global.fetch = vi.fn().mockResolvedValue({ json: async () => ({ shared_with: list }) });
}

function setup(over = {}) {
  const props = {
    file: { cid: "c1", filename: "a.pdf" },
    account: ACCOUNT, API_BASE_URL: "http://api",
    onClose: vi.fn(), onShare: vi.fn().mockResolvedValue(), onUnshare: vi.fn().mockResolvedValue(),
    darkMode: false, confirm: vi.fn().mockResolvedValue(true),
    ...over,
  };
  render(<ShareModal {...props} />);
  return props;
}

beforeEach(() => {
  mockShared([]);
  vi.spyOn(console, "error").mockImplementation(() => {}); // benign async act warnings
});
afterEach(() => vi.restoreAllMocks());

test("renders the header, input and the owner row", () => {
  setup();
  // "Share" appears in both the header and the button, so match the header by filename
  expect(screen.getByText(/a\.pdf/)).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/Email or Ethereum address/i)).toBeInTheDocument();
  expect(screen.getByText("People with access")).toBeInTheDocument();
  expect(screen.getByText("You")).toBeInTheDocument();
});

test("shows the empty state once the list loads", async () => {
  setup();
  expect(await screen.findByText(/No one else has access yet/i)).toBeInTheDocument();
});

test("lists the addresses a file is already shared with", async () => {
  mockShared([OTHER]);
  setup();
  expect(await screen.findByText("0x3081...809a")).toBeInTheDocument();
});

test("sharing a recipient calls onShare and clears the input", async () => {
  const props = setup();
  await screen.findByText(/No one else has access yet/i);

  const input = screen.getByPlaceholderText(/Email or Ethereum address/i);
  fireEvent.change(input, { target: { value: OTHER } });
  fireEvent.click(screen.getByRole("button", { name: /Share/ }));

  await waitFor(() => expect(props.onShare).toHaveBeenCalledWith("c1", OTHER, "a.pdf"));
  await waitFor(() => expect(input.value).toBe(""));
});

test("Enter in the input triggers the share", async () => {
  const props = setup();
  await screen.findByText(/No one else has access yet/i);

  const input = screen.getByPlaceholderText(/Email or Ethereum address/i);
  fireEvent.change(input, { target: { value: OTHER } });
  fireEvent.keyDown(input, { key: "Enter" });

  await waitFor(() => expect(props.onShare).toHaveBeenCalled());
});

test("revoking access confirms then calls onUnshare", async () => {
  mockShared([OTHER]);
  const props = setup();
  await screen.findByText("0x3081...809a");

  fireEvent.click(screen.getByTitle("Remove access"));

  await waitFor(() => expect(props.confirm).toHaveBeenCalled());
  await waitFor(() => expect(props.onUnshare).toHaveBeenCalledWith("c1", OTHER));
});

test("folder mode explains the batch share and hits the batch endpoint", async () => {
  setup({ file: { folder: true, filename: "docs", cids: ["c1", "c2"] } });
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/shared-users-batch"), expect.anything()));
  expect(screen.getByText(/2 file\(s\)/i)).toBeInTheDocument();
});

test("the close button dismisses the modal", () => {
  const props = setup();
  // the X in the header is the first (icon-only) button
  fireEvent.click(screen.getAllByRole("button")[0]);
  expect(props.onClose).toHaveBeenCalled();
});
