import { Search, Sun, Moon } from "lucide-react";

// Top bar: search box, theme toggle, and the account chip / sign-in button.
export default function Header({
  theme, searchQuery, setSearchQuery, darkMode, toggleTheme,
  account, connectWallet, disconnectWallet, user,
}) {
  // Account chip: social users see name/email, wallet users see the address
  const displayName = user?.google?.name || user?.email?.address ||
    (account ? `${account.slice(0, 6)}...${account.slice(-4)}` : null);
  const avatarLetter = (user?.google?.name || user?.email?.address || account || "?")[0].toUpperCase();

  return (
    <header style={{ height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px 0", gap: "16px" }}>
      <div style={{ position: "relative", flex: 1, maxWidth: "640px" }}>
        <Search size={18} style={{ position: "absolute", left: "18px", top: "50%", transform: "translateY(-50%)", color: theme.subText }} />
        <input
          type="text"
          placeholder="Search in Web3FS"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: "100%", boxSizing: "border-box", padding: "13px 20px 13px 48px",
            borderRadius: "999px", border: "none", backgroundColor: theme.searchBg,
            color: theme.text, outline: "none", fontSize: "15px",
          }}
        />
      </div>

      <button
        onClick={toggleTheme}
        title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
        style={{
          background: "none", border: "none", cursor: "pointer", color: theme.subText,
          width: "40px", height: "40px", borderRadius: "50%", display: "flex",
          alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.searchBg}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
      >
        {darkMode ? <Sun size={20} /> : <Moon size={20} />}
      </button>

      {account ? (
        <div
          onClick={() => { if (window.confirm("Log out of Web3FS?")) disconnectWallet(); }}
          title={account}
          style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", padding: "4px 12px 4px 4px", borderRadius: "999px", backgroundColor: theme.searchBg }}
        >
          <div style={{
            width: "32px", height: "32px", borderRadius: "50%", backgroundColor: "#1A73E8",
            color: "white", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "15px", fontWeight: 600,
          }}>{avatarLetter}</div>
          <span style={{ fontSize: "13px", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</span>
        </div>
      ) : (
        <button onClick={connectWallet} style={{ backgroundColor: "#1A73E8", color: "white", border: "none", padding: "10px 22px", borderRadius: "999px", cursor: "pointer", fontWeight: 500, fontSize: "14px" }}>
          Sign in
        </button>
      )}
    </header>
  );
}
