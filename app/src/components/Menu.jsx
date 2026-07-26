import { forwardRef } from "react";
import { useLayout } from "../contexts/LayoutContext";

// The popup menus (background, selection, folder, and the sidebar's New menu)
// were four copies of the same card and the same row, including the pair of
// hover handlers inline styles force on us. They share these two instead.
//
// Both read the theme from context, so callers only describe content.

// Takes a ref so a caller can measure the panel and nudge it back on-screen.
export const MenuPanel = forwardRef(function MenuPanel(
  { x, y, width = 200, style, children }, ref,
) {
  const { theme } = useLayout();
  return (
    <div
      ref={ref}
      // Menus sit above the content area, whose mousedown starts a rubber-band
      // selection; without this, opening one would begin a drag behind it.
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed", top: y, left: x, width: `${width}px`,
        backgroundColor: theme.card, border: `1px solid ${theme.border}`, borderRadius: "8px",
        zIndex: 9999, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", padding: "6px 0",
        ...style,
      }}
    >
      {children}
    </div>
  );
});

// A label above a group of rows (e.g. "3 selected").
export function MenuLabel({ children }) {
  const { theme } = useLayout();
  return (
    <div style={{ padding: "8px 18px 6px", fontSize: "12px", color: theme.subText }}>
      {children}
    </div>
  );
}

// Separates groups of rows.
export function MenuDivider() {
  const { theme } = useLayout();
  return <div style={{ borderTop: `1px solid ${theme.border}`, margin: "4px 0" }} />;
}

// `right` puts a trailing element (a shortcut hint, a submenu chevron) at the
// far edge. Without it the row is icon + label, which is the common case and
// the markup the simpler menus already had.
//
// `icon` takes an already-built element for the rows that need to style the
// glyph themselves (the star fills when the file is starred); `Icon` takes the
// component and is the shorter form everything else uses.
export function MenuRow({ Icon, icon, label, color, right, iconSize = 16, onClick }) {
  const { theme } = useLayout();
  const content = (
    <>
      {icon || <Icon size={iconSize} color={color || theme.subText} />} {label}
    </>
  );
  return (
    <div
      onClick={onClick}
      style={{
        padding: "10px 18px", cursor: "pointer", display: "flex", alignItems: "center",
        justifyContent: right ? "space-between" : "flex-start", gap: "12px", fontSize: "14px",
        color: color || theme.text,
      }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.hoverRow}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
    >
      {right
        ? <span style={{ display: "flex", alignItems: "center", gap: "12px" }}>{content}</span>
        : content}
      {right}
    </div>
  );
}
