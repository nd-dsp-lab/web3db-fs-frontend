// In-browser verification of the backend's SGX attestation quote.
//
// Mirrors sgx/verify-attestation.py in the backend repo: same quote layout,
// same pinned MRSIGNER, same pinned Intel SGX Root CA, same signature chain
// (PCK certificates → Quoting Enclave report → attestation key → quote).
// Everything is ECDSA-P256/SHA-256, done with WebCrypto — no dependencies.
//
// One check the CLI script performs is impossible here: a browser cannot
// read the TLS certificate its own connection received, so the
// report_data ↔ certificate binding cannot be confirmed in-page. The UI
// states this and points at the CLI script, which does confirm it.

// SHA-256 of the enclave signing key's public modulus. Constant across
// releases; changes only if the Web3FS signing key rotates.
export const PINNED_MRSIGNER =
  "61838aff783799c244260291db365c485210ea2ca4c73ad336c0017fe5065afe";

// Intel SGX Provisioning Certification Root CA (public, expires 2049),
// pinned by DER fingerprint — cross-checkable against
// https://certificates.trustedservices.intel.com/
const INTEL_SGX_ROOT_CA_SHA256 =
  "44a0196b2b99f889b8e149e95b807a350e7424964399e885a7cbb8ccfab674d3";

const EC = { name: "ECDSA", namedCurve: "P-256" };
const SIG = { name: "ECDSA", hash: "SHA-256" };

const hex = (bytes) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const sha256 = async (bytes) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));

const bytesEqual = (a, b) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

// --- minimal DER, just enough to take an X.509 certificate apart ---------

function derElement(bytes, offset) {
  const tag = bytes[offset];
  let len = bytes[offset + 1];
  let headerLen = 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + bytes[offset + 2 + i];
    headerLen = 2 + n;
  }
  return { tag, start: offset, contentStart: offset + headerLen, len, end: offset + headerLen + len };
}

function derChildren(bytes, el) {
  const out = [];
  let o = el.contentStart;
  while (o < el.end) {
    const c = derElement(bytes, o);
    out.push(c);
    o = c.end;
  }
  return out;
}

// Certificate ::= SEQUENCE { tbsCertificate, signatureAlgorithm, signatureValue }
// The pieces we need: the signed bytes, the signature, and the public key.
function parseCertificate(der) {
  const [tbs, , sigBits] = derChildren(der, derElement(der, 0));
  // tbsCertificate: [0]version? serial sigAlg issuer validity subject SPKI …
  const tbsChildren = derChildren(der, tbs);
  const spki = tbsChildren[tbsChildren[0].tag === 0xa0 ? 6 : 5];
  return {
    der,
    tbsBytes: der.slice(tbs.start, tbs.end),
    // BIT STRING content starts with the unused-bits count byte
    sigDer: der.slice(sigBits.contentStart + 1, sigBits.end),
    spkiBytes: der.slice(spki.start, spki.end),
  };
}

// X.509 signatures are DER SEQUENCE{r, s}; WebCrypto wants raw r||s (64 B).
function derSigToRaw(sigDer) {
  const [r, s] = derChildren(sigDer, derElement(sigDer, 0));
  const fixed = (el) => {
    let v = sigDer.slice(el.contentStart, el.end);
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    const out = new Uint8Array(32);
    out.set(v, 32 - v.length);
    return out;
  };
  return concat(fixed(r), fixed(s));
}

function pemChainToDers(blob) {
  return new TextDecoder()
    .decode(blob)
    .split("-----END CERTIFICATE-----")
    .filter((p) => p.includes("-----BEGIN CERTIFICATE-----"))
    .map((p) =>
      b64ToBytes(p.split("-----BEGIN CERTIFICATE-----")[1].replace(/\s+/g, "")));
}

const importSpki = (spki) => crypto.subtle.importKey("spki", spki, EC, false, ["verify"]);
const verify = (key, rawSig, data) => crypto.subtle.verify(SIG, key, rawSig, data);

// --- the quote itself -----------------------------------------------------

// SGX ECDSA quote: 48-byte header, then the 384-byte enclave report.
const REPORT = 48;

export function parseQuote(quote) {
  if (quote.length < REPORT + 384 + 4) throw new Error("quote too short");
  const u16 = (o) => quote[o] | (quote[o + 1] << 8);
  return {
    version: u16(0),
    keyType: u16(2),
    mrenclave: hex(quote.slice(REPORT + 64, REPORT + 96)),
    mrsigner: hex(quote.slice(REPORT + 128, REPORT + 160)),
    reportData: hex(quote.slice(REPORT + 320, REPORT + 384)),
  };
}

// Cryptographically verify a v3 ECDSA quote up to Intel's pinned root.
// Returns null on success, an error string on failure — same contract and
// same error texts as the Python reference.
export async function verifyQuoteChain(quote) {
  const { version, keyType } = parseQuote(quote);
  if (version !== 3 || keyType !== 2) {
    return `unsupported quote (version=${version}, key_type=${keyType})`;
  }

  // Layout after header+report: sig_data_len(4), ECDSA sig over
  // header+report (64, raw r||s), attestation pubkey (64, raw x||y), the
  // Quoting Enclave's report (384), the PCK signature over it (64), QE auth
  // data (2+n), and the certification data (type 5 = PEM chain).
  const sig = quote.slice(REPORT + 384 + 4);
  const ecdsaSig = sig.slice(0, 64);
  const attestPubRaw = sig.slice(64, 128);
  const qeReport = sig.slice(128, 512);
  const qeReportSig = sig.slice(512, 576);
  const authLen = sig[576] | (sig[577] << 8);
  const qeAuth = sig.slice(578, 578 + authLen);
  const cd = sig.slice(578 + authLen);
  const certType = cd[0] | (cd[1] << 8);
  const certSize = cd[2] | (cd[3] << 8) | (cd[4] << 16) | (cd[5] << 24);
  if (certType !== 5) return `unsupported certification data type ${certType}`;

  // -- PCK chain: leaf <- intermediate <- root, root pinned to Intel's
  const chain = pemChainToDers(cd.slice(6, 6 + certSize)).map(parseCertificate);
  if (chain.length < 3) {
    return `expected 3 certificates in the PCK chain, got ${chain.length}`;
  }
  const root = chain[chain.length - 1];
  if (hex(await sha256(root.der)) !== INTEL_SGX_ROOT_CA_SHA256) {
    return "PCK chain does not end at the pinned Intel SGX Root CA";
  }
  // Each certificate signed by the next; the root by itself.
  for (let i = 0; i < chain.length; i++) {
    const issuer = chain[Math.min(i + 1, chain.length - 1)];
    const issuerKey = await importSpki(issuer.spkiBytes);
    if (!(await verify(issuerKey, derSigToRaw(chain[i].sigDer), chain[i].tbsBytes))) {
      return "PCK certificate chain signature invalid";
    }
  }

  // -- PCK key signed the Quoting Enclave's report
  const pckKey = await importSpki(chain[0].spkiBytes);
  if (!(await verify(pckKey, qeReportSig, qeReport))) {
    return "QE report signature invalid (not signed by the PCK key)";
  }

  // -- the QE report pins the attestation key that signs quotes
  const pin = await sha256(concat(attestPubRaw, qeAuth));
  if (!bytesEqual(pin, qeReport.slice(320, 352))) {
    return "QE report does not pin this attestation key";
  }

  // -- and that attestation key signed this quote's header + report
  const attestKey = await crypto.subtle.importKey(
    "raw", concat(new Uint8Array([4]), attestPubRaw), EC, false, ["verify"]);
  if (!(await verify(attestKey, ecdsaSig, quote.slice(0, REPORT + 384)))) {
    return "quote signature invalid (not signed by the attested key)";
  }

  return null;
}

// Verify an /attestation response. `expectedMrenclave` (the published
// release measurement, VITE_EXPECTED_MRENCLAVE) is optional: without it the
// MRENCLAVE is reported for display but not enforced — same policy as the
// CLI script without --mrenclave.
export async function verifyAttestation(payload, { expectedMrenclave } = {}) {
  const quote = b64ToBytes(payload.quote);
  const parsed = parseQuote(quote);

  const chainError = await verifyQuoteChain(quote);
  const checks = [
    {
      id: "genuine",
      label: "Quote signature chain verifies to Intel's SGX Root CA",
      ok: chainError === null,
      detail: chainError ?? "genuine SGX hardware",
    },
    {
      id: "mrsigner",
      label: "MRSIGNER matches the Web3FS signing key",
      ok: parsed.mrsigner === PINNED_MRSIGNER,
      detail: parsed.mrsigner,
    },
  ];
  if (expectedMrenclave) {
    checks.push({
      id: "mrenclave",
      label: "MRENCLAVE matches the published release",
      ok: parsed.mrenclave === expectedMrenclave.toLowerCase(),
      detail: parsed.mrenclave,
    });
  } else {
    // No release pinned: show the measurement for manual comparison, same
    // as the CLI script without --mrenclave. informational=true renders
    // without a pass/fail mark and never affects the verdict.
    checks.push({
      id: "mrenclave",
      label: "MRENCLAVE (this release's measurement — not checked)",
      ok: true,
      informational: true,
      detail: parsed.mrenclave,
    });
  }

  return {
    ok: checks.every((c) => c.ok),
    mrenclave: parsed.mrenclave,
    mrsigner: parsed.mrsigner,
    checks,
  };
}
