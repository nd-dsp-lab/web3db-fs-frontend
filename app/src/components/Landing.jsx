import { Lock, KeyRound, Network, Sun, Moon } from "lucide-react";
import Logo from "./Logo";
import DrivePreview from "./DrivePreview";
import AttestationBadge from "./AttestationBadge";
import { makeTheme, BLUE, FONT } from "../lib/theme";
import { useWorkspace } from "../contexts/WorkspaceContext";

// What a signed-out visitor sees. The drive chrome (sidebar, search, file
// grid) is meaningless without an account — it renders an empty shell that
// looks broken — so App shows this instead until Privy reports a session.
// Bodies are kept to a similar length on purpose: the columns are equal-width
// and stretch to the tallest, so an uneven set leaves a ragged gap under the
// short ones.
const FEATURES = [
  {
    Icon: Lock,
    title: "End-to-end encryption by TEE",
  body: "Decrypted files never leave outside the enclave. " +
      "Administrators see only ciphertext.",
  },
  {
    Icon: KeyRound,
    title: "Sharing you control",
    body: "Access policies are stored in a smart contract. Only you can grant and revoke access.",
  },
  {
    Icon: Network,
    title: "No centralized cloud storage",
    body: "Encrypted files are stored in decentralized storage. You own your own data. ",
  },
];

export default function Landing() {
  const { darkMode, toggleTheme, connectWallet, api } = useWorkspace();
  const theme = makeTheme(darkMode);

  const signIn = (
    <button
      onClick={connectWallet}
      style={{
        backgroundColor: BLUE, color: "white", border: "none",
        padding: "14px 36px", borderRadius: "999px", cursor: "pointer",
        fontWeight: 500, fontSize: "16px",
      }}
    >
      Sign in
    </button>
  );

  return (
    <div style={{
      minHeight: "100vh", backgroundColor: theme.bg, color: theme.text,
      fontFamily: FONT,
      display: "flex", flexDirection: "column",
    }}>
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: "16px", padding: "16px 32px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Logo />
          <span style={{ fontSize: "22px" }}>Web3FS</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <AttestationBadge theme={theme} api={api} />
          <button
            onClick={toggleTheme}
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            style={{
              background: "none", border: "none", cursor: "pointer", color: theme.subText,
              width: "40px", height: "40px", borderRadius: "50%", display: "flex",
              alignItems: "center", justifyContent: "center",
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.searchBg}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button
            onClick={connectWallet}
            style={{
              backgroundColor: BLUE, color: "white", border: "none",
              padding: "10px 22px", borderRadius: "999px", cursor: "pointer",
              fontWeight: 500, fontSize: "14px",
            }}
          >
            Sign in
          </button>
        </div>
      </header>

      <main style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
        padding: "56px 32px 72px", textAlign: "center",
      }}>
        <h1 style={{
          fontSize: "clamp(36px, 6vw, 60px)", lineHeight: 1.1, fontWeight: 400,
          margin: "0 0 20px", maxWidth: "720px",
          // let the browser even out the lines rather than hard-coding a break
          // that only looks right at one width
          textWrap: "balance",
        }}>
          Store and share files without trusting the server
        </h1>
        {/* One claim only — the three points below carry the detail, and
            saying it twice made the page read like it was padding. */}
        <p style={{
          fontSize: "18px", lineHeight: 1.6, color: theme.subText,
          margin: "0 0 32px", maxWidth: "560px",
        }}>
          Even the administrators running the servers only see the ciphertext.
        </p>
        {signIn}
        <p style={{ fontSize: "13px", color: theme.subText, margin: "16px 0 0" }}>
          Sign in with email, Google, or your own wallet.
        </p>

        <div className="landing-preview" style={{ marginTop: "56px", width: "100%" }}>
          <DrivePreview theme={theme} />
        </div>

        {/* Unboxed, but centred to match the hero above it — left-aligned
            columns under a centred page read like a different section that
            wandered in. The tinted disc gives the icons something to sit in
            so they stop floating in the gap. */}
        <div
          className="landing-points"
          style={{ marginTop: "104px", width: "100%", maxWidth: "1000px" }}
        >
          {FEATURES.map(({ Icon, title, body }) => (
            <section key={title} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{
                width: "44px", height: "44px", borderRadius: "50%",
                backgroundColor: "rgba(26,115,232,0.12)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon size={20} color={BLUE} strokeWidth={1.8} />
              </div>
              <h2 style={{ fontSize: "16px", fontWeight: 500, margin: "18px 0 8px" }}>{title}</h2>
              <p style={{
                fontSize: "14px", lineHeight: 1.65, color: theme.subText,
                margin: 0, maxWidth: "300px",
              }}>{body}</p>
            </section>
          ))}
        </div>
      </main>

      <footer style={{
        padding: "24px 32px 32px", textAlign: "center",
        fontSize: "13px", color: theme.subText,
      }}>
        &copy; {new Date().getFullYear()} Data Security &amp; Privacy Lab,
        University of Notre Dame. All rights reserved.
      </footer>
    </div>
  );
}
