import { MenuPanel, MenuRow } from "./Menu";
import { useLayout } from "../contexts/LayoutContext";

// Right-click menu on empty content-area background (New folder / uploads).
export default function BackgroundMenu({ bgMenu, setBgMenu }) {
  const { newMenuItems } = useLayout();
  return (
    <MenuPanel x={bgMenu.x} y={bgMenu.y}>
      {newMenuItems.map(({ Icon, label, action }) => (
        <MenuRow
          key={label}
          Icon={Icon}
          label={label}
          iconSize={17}
          onClick={() => { setBgMenu(null); action(); }}
        />
      ))}
    </MenuPanel>
  );
}
