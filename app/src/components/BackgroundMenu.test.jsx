/* eslint-disable testing-library/no-node-access --
   The menu container carries the fixed-position styling that places it at the
   click point. It has no role or label of its own, so it is reached through a
   row it renders. */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import BackgroundMenu from "./BackgroundMenu";
import { LayoutContext } from "../contexts/LayoutContext";

// BackgroundMenu is the right-click menu on empty content-area background. It
// renders whatever `newMenuItems` the layout supplies and closes on activation.

const THEME = { card: "#fff", border: "#ccc", hoverRow: "#eee", subText: "#888" };
const Icon = (props) => <svg data-testid="icon" {...props} />;

function renderMenu(over = {}) {
  const ctx = {
    theme: THEME,
    newMenuItems: [
      { Icon, label: "New folder", action: vi.fn() },
      { Icon, label: "File upload", action: vi.fn() },
    ],
    ...over,
  };
  const setBgMenu = vi.fn();
  render(
    <LayoutContext.Provider value={ctx}>
      <BackgroundMenu bgMenu={{ x: 120, y: 80 }} setBgMenu={setBgMenu} />
    </LayoutContext.Provider>
  );
  return { ctx, setBgMenu };
}

test("renders one row per new-menu item, positioned at the click point", () => {
  renderMenu();
  expect(screen.getByText(/New folder/)).toBeInTheDocument();
  expect(screen.getByText(/File upload/)).toBeInTheDocument();

  const menu = screen.getByText(/New folder/).parentElement;
  expect(menu).toHaveStyle({ position: "fixed", top: "80px", left: "120px" });
});

test("clicking an item closes the menu and runs its action", () => {
  const { ctx, setBgMenu } = renderMenu();
  fireEvent.click(screen.getByText(/File upload/));

  expect(setBgMenu).toHaveBeenCalledWith(null);
  expect(ctx.newMenuItems[1].action).toHaveBeenCalled();
  expect(ctx.newMenuItems[0].action).not.toHaveBeenCalled();
});

test("hovering a row highlights it and clears on leave", () => {
  renderMenu();
  const row = screen.getByText(/New folder/);

  fireEvent.mouseEnter(row);
  expect(row).toHaveStyle({ backgroundColor: THEME.hoverRow });

  fireEvent.mouseLeave(row);
  expect(row).not.toHaveStyle({ backgroundColor: THEME.hoverRow });
});

test("mousedown inside the menu does not bubble out to the background handler", () => {
  const onBackgroundMouseDown = vi.fn();
  const ctx = { theme: THEME, newMenuItems: [{ Icon, label: "New folder", action: vi.fn() }] };
  render(
    <div onMouseDown={onBackgroundMouseDown}>
      <LayoutContext.Provider value={ctx}>
        <BackgroundMenu bgMenu={{ x: 0, y: 0 }} setBgMenu={vi.fn()} />
      </LayoutContext.Provider>
    </div>
  );

  fireEvent.mouseDown(screen.getByText(/New folder/));
  expect(onBackgroundMouseDown).not.toHaveBeenCalled();
});
