import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import { verifyAttestation } from "../lib/attestation";
import { SHARE, DANGER } from "../lib/theme";

// Published MRENCLAVE of the backend release (Amplify env var). Optional:
// unset means the measurement is shown but not enforced.
const EXPECTED_MRENCLAVE = import.meta.env.VITE_EXPECTED_MRENCLAVE || "";

// Shield in the header: fetches the backend's SGX quote once and verifies it
// in the browser (signature chain to Intel's root + pinned signing key).
// Click opens the receipt. Three terminal states:
//   verified    — every check passed (green)
//   failed      — a cryptographic check failed: wrong signer, forged or
//                 replayed-from-other-hardware quote (red)
//   unavailable — no quote to check: dev backend (501) or fetch error (gray)
// Takes theme + api as props so it mounts from either context (the signed-in
// Header via LayoutContext, the Landing header via WorkspaceContext).
export default function AttestationBadge({ theme, api }) {
  const [state, setState] = useState({ status: "checking" });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/attestation");
        if (!res.ok) {
          const detail = res.status === 501
            ? "Backend is not running inside an SGX enclave (dev mode)."
            : `Attestation endpoint returned ${res.status}.`;
          if (!cancelled) setState({ status: "unavailable", detail });
          return;
        }
        const result = await verifyAttestation(await res.json(), {
          expectedMrenclave: EXPECTED_MRENCLAVE,
        });
        if (!cancelled) setState({ status: result.ok ? "verified" : "failed", result });
      } catch {
        if (!cancelled) setState({ status: "unavailable", detail: "Could not reach the attestation endpoint." });
      }
    })();
    return () => { cancelled = true; };
  }, [api]);

  const { status, result, detail } = state;
  const Icon = status === "verified" ? ShieldCheck
    : status === "failed" ? ShieldAlert
    : ShieldQuestion;
  const color = status === "verified" ? SHARE
    : status === "failed" ? DANGER
    : theme.subText;
  const title = status === "verified" ? "Enclave verified — click for details"
    : status === "failed" ? "Enclave verification FAILED — click for details"
    : status === "checking" ? "Verifying enclave…"
    : "Enclave attestation unavailable — click for details";

  return (
    <>
      <button
        onClick={() => status !== "checking" && setOpen(true)}
        title={title}
        aria-label={title}
        style={{
          background: "none", border: "none", cursor: "pointer", color,
          width: "40px", height: "40px", borderRadius: "50%", display: "flex",
          alignItems: "center", justifyContent: "center", flexShrink: 0,
          opacity: status === "checking" ? 0.5 : 1,
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.searchBg}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
      >
        <Icon size={20} />
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 20000, backgroundColor: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(560px, 92vw)", backgroundColor: theme.card, color: theme.text,
              borderRadius: "16px", padding: "24px", boxShadow: "0 8px 28px rgba(0,0,0,0.3)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
              <Icon size={22} style={{ color }} />
              <span style={{ fontSize: "20px" }}>
                {status === "verified" ? "Enclave verified"
                  : status === "failed" ? "Enclave verification failed"
                  : "Attestation unavailable"}
              </span>
            </div>

            <div style={{ fontSize: "14px", color: theme.subText, lineHeight: 1.5, marginBottom: "14px" }}>
              {status === "unavailable" ? detail : (
                "This browser verified the server's SGX hardware quote: " +
                (EXPECTED_MRENCLAVE
                  ? "the published Web3FS release, "
                  : "Web3FS enclave code signed by the project's key, ") +
                "running in a genuine Intel SGX enclave.  Server admins " +
                "see only ciphertext."
              )}
            </div>

            {result && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px" }}>
                {result.checks.map((c) => (
                  <div key={c.id} style={{ display: "flex", gap: "8px", fontSize: "13px", alignItems: "baseline" }}>
                    <span style={{ color: c.informational ? theme.subText : c.ok ? SHARE : DANGER, flexShrink: 0 }}>
                      {c.informational ? "·" : c.ok ? "✓" : "✕"}
                    </span>
                    <span>
                      {c.label}
                      {c.detail && (
                        <span style={{
                          display: "block", fontFamily: "monospace", fontSize: "11px",
                          color: theme.subText, wordBreak: "break-all",
                        }}>{c.detail}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none", border: `1px solid ${theme.subText}`, cursor: "pointer",
                  color: theme.text, borderRadius: "8px", padding: "8px 16px", fontSize: "14px",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
