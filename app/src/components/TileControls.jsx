import { MoreVertical } from "lucide-react";
import { useLayout } from "../contexts/LayoutContext";
import { BLUE } from "../lib/theme";

// The two controls that sit on every file tile and every list row.
//
// They live here rather than inside AppLayout's body because a component
// declared during render is a new component *type* on every render: React
// cannot match it to the previous one, so it unmounts the old tree and mounts
// a fresh one each time. For the checkbox that means losing focus mid-click,
// and for both it means throwing away and rebuilding a DOM node per tile on
// every keystroke typed into the search box.
//
// Both read from context rather than taking a handful of props, since they
// are rendered deep inside the grid and list.

// Overflow menu; the same button opens the file or the folder menu.
export function MoreButton({ item, visible }) {
  const { theme, openMenuForFile, openMenuForFolder } = useLayout();
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        item.type === "file" ? openMenuForFile(e, item) : openMenuForFolder(e, item);
      }}
      title="More actions"
      style={{
        background: "none", border: "none", cursor: "pointer", color: theme.subText,
        borderRadius: "50%", width: "30px", height: "30px", display: "flex",
        alignItems: "center", justifyContent: "center", flexShrink: 0,
        // Kept mounted rather than conditionally rendered so the tile doesn't
        // reflow when the pointer enters it.
        opacity: visible ? 1 : 0, transition: "opacity 0.1s",
      }}
    >
      <MoreVertical size={17} />
    </button>
  );
}

// Selection checkbox; shown on hover, and always once anything is selected.
export function SelectBox({ cid, visible }) {
  const { selected, toggleSelect } = useLayout();
  const isSelected = selected.has(cid);
  return (
    <input
      type="checkbox"
      checked={isSelected}
      onChange={() => toggleSelect(cid)}
      // The tile itself opens the file on click; the checkbox must not.
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "16px", height: "16px", accentColor: BLUE, cursor: "pointer",
        flexShrink: 0, opacity: visible || isSelected ? 1 : 0, transition: "opacity 0.1s",
      }}
    />
  );
}
