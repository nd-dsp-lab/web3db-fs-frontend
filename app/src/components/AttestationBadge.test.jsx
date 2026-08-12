import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import AttestationBadge from "./AttestationBadge";
import fixture from "../lib/__fixtures__/attestation.json";

// The badge is the header shield: fetch /attestation once, verify the quote
// in-browser, and expose the receipt in a modal. The fixture is a real
// production quote, so the "verified" path exercises the actual crypto.

const THEME = { searchBg: "#f1f1f1", text: "#000", subText: "#888", card: "#fff" };

function renderBadge(apiGet) {
  render(<AttestationBadge theme={THEME} api={{ get: apiGet }} />);
}

test("a genuine quote lands on verified, and the modal shows the receipt", async () => {
  renderBadge(vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(fixture),
  }));

  const badge = await screen.findByTitle("Enclave verified — click for details");
  fireEvent.click(badge);

  expect(screen.getByText("Enclave verified")).toBeInTheDocument();
  expect(screen.getByText(fixture.mrsigner)).toBeInTheDocument();
});

test("a 501 (dev backend) parks the badge on unavailable, not failed", async () => {
  renderBadge(vi.fn().mockResolvedValue({ ok: false, status: 501 }));

  const badge = await screen.findByTitle("Enclave attestation unavailable — click for details");
  fireEvent.click(badge);

  expect(screen.getByText(/not running inside an SGX enclave/)).toBeInTheDocument();
});

test("a network error is unavailable too — never a scary red", async () => {
  renderBadge(vi.fn().mockRejectedValue(new TypeError("fetch failed")));

  await screen.findByTitle("Enclave attestation unavailable — click for details");
});

test("a forged quote fails loudly", async () => {
  // Flip one bit in the report: signature chain must reject it.
  const bytes = Uint8Array.from(atob(fixture.quote), (c) => c.charCodeAt(0));
  bytes[48 + 64] ^= 0x01;
  const forged = { ...fixture, quote: btoa(String.fromCharCode(...bytes)) };

  renderBadge(vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(forged),
  }));

  const badge = await screen.findByTitle("Enclave verification FAILED — click for details");
  fireEvent.click(badge);

  expect(await screen.findByText("Enclave verification failed")).toBeInTheDocument();
});
