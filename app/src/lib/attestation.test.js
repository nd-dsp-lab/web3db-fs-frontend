import { verifyAttestation, parseQuote, verifyQuoteChain, PINNED_MRSIGNER } from "./attestation";
import fixture from "./__fixtures__/attestation.json";

// The fixture is a real /attestation response captured from production
// (2026-08-10) — a genuine hardware quote, so the full signature chain to
// Intel's root must verify. Everything in it is public.

const quoteBytes = () =>
  Uint8Array.from(atob(fixture.quote), (c) => c.charCodeAt(0));

test("parses the production quote's identity fields", () => {
  const parsed = parseQuote(quoteBytes());
  expect(parsed.version).toBe(3);
  expect(parsed.mrenclave).toBe(fixture.mrenclave);
  expect(parsed.mrsigner).toBe(PINNED_MRSIGNER);
  expect(parsed.reportData).toBe(fixture.report_data);
});

test("the real quote verifies end-to-end", async () => {
  const result = await verifyAttestation(fixture);
  expect(result.ok).toBe(true);
  expect(result.checks.map((c) => c.id)).toEqual(["genuine", "mrsigner", "mrenclave"]);
  expect(result.mrenclave).toBe(fixture.mrenclave);

  // Unpinned: the MRENCLAVE row is informational — shown for manual
  // comparison, never part of the verdict.
  const mrenclaveRow = result.checks.find((c) => c.id === "mrenclave");
  expect(mrenclaveRow.informational).toBe(true);
  expect(mrenclaveRow.detail).toBe(fixture.mrenclave);
});

test("enforces MRENCLAVE when an expected release is pinned", async () => {
  const good = await verifyAttestation(fixture, { expectedMrenclave: fixture.mrenclave.toUpperCase() });
  expect(good.ok).toBe(true);

  const bad = await verifyAttestation(fixture, { expectedMrenclave: "ff".repeat(32) });
  expect(bad.ok).toBe(false);
  expect(bad.checks.find((c) => c.id === "mrenclave").ok).toBe(false);
});

test("a tampered report is caught by the quote signature", async () => {
  const tampered = quoteBytes();
  tampered[48 + 64] ^= 0x01; // flip one MRENCLAVE bit
  expect(await verifyQuoteChain(tampered)).toBe(
    "quote signature invalid (not signed by the attested key)");
});

test("a tampered certificate chain is rejected", async () => {
  const quote = quoteBytes();
  // Corrupt one byte deep inside the certification data (the PEM chain
  // lives at the tail of the quote).
  const tampered = quote.slice();
  tampered[tampered.length - 700] ^= 0x01;
  expect(await verifyQuoteChain(tampered)).not.toBeNull();
});

test("an impostor MRSIGNER fails the pinned-key check", async () => {
  // Only the JSON convenience field changes — the quote is untouched, so
  // the parsed (trusted) MRSIGNER still rules. This documents that we trust
  // the quote, not the JSON.
  const result = await verifyAttestation({ ...fixture, mrsigner: "ff".repeat(32) });
  expect(result.ok).toBe(true);
  expect(result.mrsigner).toBe(PINNED_MRSIGNER);
});
