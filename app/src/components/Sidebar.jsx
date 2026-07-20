import { Plus, HardDrive, Users, Clock, Star, Trash2, Cloud } from "lucide-react";
import { formatBytes } from "../lib/fileTypes";
import { STORAGE_QUOTA } from "../lib/constants";

// Left rail: brand, New menu, view navigation, and the storage indicator.
// The "My Drive" nav item doubles as a drop target for moving items to root.
export default function Sidebar({
  theme, view, setView, setCurrentPath, setSearchQuery,
  isNewMenuOpen, setIsNewMenuOpen, newMenuItems,
  storageUsed, storageQuota, dropHover, onInternalDropTo,
}) {
  const NavItem = ({ id, icon: Icon, label, dropPath }) => (
    <div
      onClick={() => { setView(id); setCurrentPath("/"); setSearchQuery(""); }}
      onDragOver={dropPath ? dropHover : undefined}
      onDragLeave={dropPath ? (e) => { e.currentTarget.style.backgroundColor = view === id ? theme.navActive : "transparent"; } : undefined}
      onDrop={dropPath ? (e) => { if (view !== id) e.currentTarget.style.backgroundColor = "transparent"; onInternalDropTo(e, dropPath); } : undefined}
      style={{
        display: "flex", alignItems: "center", gap: "14px", padding: "8px 16px",
        cursor: "pointer", borderRadius: "999px", fontSize: "14px",
        backgroundColor: view === id ? theme.navActive : "transparent",
        color: view === id ? theme.navActiveText : theme.text,
        fontWeight: view === id ? 600 : 400, marginBottom: "2px",
      }}
      onMouseEnter={(e) => { if (view !== id) e.currentTarget.style.backgroundColor = theme.tile; }}
      onMouseLeave={(e) => { if (view !== id) e.currentTarget.style.backgroundColor = "transparent"; }}
    >
      <Icon size={18} strokeWidth={1.8} />
      {label}
    </div>
  );

  return (
    <aside style={{ width: "256px", padding: "8px 12px 16px", display: "flex", flexDirection: "column" }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 8px 20px", cursor: "pointer" }}
        onClick={() => { setView("my-drive"); setCurrentPath("/"); setSearchQuery(""); }}
      >
        <div style={{ backgroundColor: "#1A73E8", color: "white", width: "32px", height: "32px", borderRadius: "8px", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>Δ</div>
        <span style={{ fontSize: "22px" }}>Web3FS</span>
      </div>

      <div onMouseDown={(e) => e.stopPropagation()} style={{ position: "relative", padding: "0 4px", marginBottom: "16px" }}>
        <button
          style={{
            display: "flex", alignItems: "center", gap: "10px", padding: "14px 22px",
            borderRadius: "16px", border: "none", cursor: "pointer",
            backgroundColor: theme.card, color: theme.text, fontSize: "14px", fontWeight: 500,
            boxShadow: "0 1px 3px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.1)",
          }}
          onClick={() => setIsNewMenuOpen(!isNewMenuOpen)}
        >
          <Plus size={20} color="#1A73E8" /> New
        </button>

        {isNewMenuOpen && (
          <div style={{
            position: "absolute", top: "56px", left: "4px", width: "200px",
            backgroundColor: theme.card, border: `1px solid ${theme.border}`, borderRadius: "8px",
            zIndex: 100, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", padding: "6px 0",
          }}>
            {newMenuItems.map(({ Icon, label, action }) => (
              <div
                key={label}
                onClick={() => { action(); setIsNewMenuOpen(false); }}
                style={{ padding: "10px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: "12px", fontSize: "14px" }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.hoverRow}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
              >
                <Icon size={17} color={theme.subText} /> {label}
              </div>
            ))}
          </div>
        )}
      </div>

      <nav>
        <NavItem id="my-drive" icon={HardDrive} label="My Drive" dropPath="/" />
        <NavItem id="shared" icon={Users} label="Shared with me" />
        <NavItem id="recent" icon={Clock} label="Recent" />
        <NavItem id="starred" icon={Star} label="Starred" />
        <NavItem id="trash" icon={Trash2} label="Trash" />
      </nav>

      {/* STORAGE INDICATOR */}
      <div style={{ marginTop: "auto", padding: "12px 16px 4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", fontSize: "14px", marginBottom: "10px" }}>
          <Cloud size={18} strokeWidth={1.8} color={theme.subText} />
          Storage
        </div>
        <div style={{ height: "4px", borderRadius: "999px", backgroundColor: theme.tile, overflow: "hidden", marginBottom: "8px" }}>
          <div style={{
            height: "100%", borderRadius: "999px", backgroundColor: "#1A73E8",
            width: `${Math.min(100, (storageUsed / (storageQuota || STORAGE_QUOTA)) * 100)}%`, minWidth: storageUsed > 0 ? "2px" : 0,
          }} />
        </div>
        <div style={{ fontSize: "12px", color: theme.subText }}>
          {formatBytes(storageUsed)} of {formatBytes(storageQuota || STORAGE_QUOTA)} used
        </div>
      </div>
    </aside>
  );
}
