// Right-click menu on empty content-area background (New folder / uploads).
export default function BackgroundMenu({ bgMenu, setBgMenu, newMenuItems, theme }) {
  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed", top: bgMenu.y, left: bgMenu.x, width: "200px",
        backgroundColor: theme.card, border: `1px solid ${theme.border}`, borderRadius: "8px",
        zIndex: 9999, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", padding: "6px 0",
      }}
    >
      {newMenuItems.map(({ Icon, label, action }) => (
        <div
          key={label}
          onClick={() => { setBgMenu(null); action(); }}
          style={{ padding: "10px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: "12px", fontSize: "14px" }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.hoverRow}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
        >
          <Icon size={17} color={theme.subText} /> {label}
        </div>
      ))}
    </div>
  );
}
