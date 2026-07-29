/* eslint-disable testing-library/no-container, testing-library/no-node-access --
   The storage bar is a bare styled div with no role, label or text: its whole
   observable behaviour is the computed width, so it is queried by style. */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import Sidebar from "./Sidebar";
import { LayoutContext } from "../contexts/LayoutContext";
import { STORAGE_QUOTA } from "../lib/constants";

// Sidebar is the left rail: brand, New menu, view navigation and the storage
// indicator. Navigating always resets the path and the search box, and the
// "My Drive" item doubles as a drop target for moving items back to root.

const THEME = {
  card: "#fff", border: "#ccc", hoverRow: "#eee", tile: "#f5f5f5",
  text: "#000", subText: "#888", navActive: "#d3e3fd", navActiveText: "#001d35",
};
const Icon = (props) => <svg data-testid="icon" {...props} />;

function renderSidebar(over = {}) {
  const ctx = {
    theme: THEME, view: "my-drive", setView: vi.fn(), setCurrentPath: vi.fn(), setSearchQuery: vi.fn(),
    isNewMenuOpen: false, setIsNewMenuOpen: vi.fn(),
    newMenuItems: [
      { Icon, label: "New folder", action: vi.fn() },
      { Icon, label: "File upload", action: vi.fn() },
    ],
    storageUsed: 0, storageQuota: 0,
    dropHover: vi.fn(), onInternalDropTo: vi.fn(),
    ...over,
  };
  const { container } = render(
    <LayoutContext.Provider value={ctx}>
      <Sidebar />
    </LayoutContext.Provider>
  );
  return { ctx, container };
}

test("clicking a nav item switches view and resets path and search", () => {
  const { ctx } = renderSidebar();
  fireEvent.click(screen.getByText("Trash"));

  expect(ctx.setView).toHaveBeenCalledWith("trash");
  expect(ctx.setCurrentPath).toHaveBeenCalledWith("/");
  expect(ctx.setSearchQuery).toHaveBeenCalledWith("");
});

test("the brand returns to My Drive", () => {
  const { ctx } = renderSidebar({ view: "trash" });
  fireEvent.click(screen.getByText("Web3FS"));
  expect(ctx.setView).toHaveBeenCalledWith("my-drive");
});

test("the active view is highlighted and the others are not", () => {
  renderSidebar({ view: "starred" });
  expect(screen.getByText("Starred")).toHaveStyle({ backgroundColor: THEME.navActive });
  expect(screen.getByText("Recent")).not.toHaveStyle({ backgroundColor: THEME.navActive });
});

test("hover highlights an inactive item but leaves the active one alone", () => {
  renderSidebar({ view: "my-drive" });

  const recent = screen.getByText("Recent");
  fireEvent.mouseEnter(recent);
  expect(recent).toHaveStyle({ backgroundColor: THEME.tile });
  fireEvent.mouseLeave(recent);
  expect(recent).not.toHaveStyle({ backgroundColor: THEME.tile });

  const active = screen.getByText("My Drive");
  fireEvent.mouseEnter(active);
  expect(active).toHaveStyle({ backgroundColor: THEME.navActive });
});

test("only My Drive accepts drops, and it moves the payload to root", () => {
  const { ctx } = renderSidebar({ view: "trash" });
  const myDrive = screen.getByText("My Drive");

  fireEvent.dragOver(myDrive);
  expect(ctx.dropHover).toHaveBeenCalled();

  fireEvent.dragLeave(myDrive);
  fireEvent.drop(myDrive);
  expect(ctx.onInternalDropTo).toHaveBeenCalledWith(expect.anything(), "/");

  fireEvent.dragOver(screen.getByText("Recent"));
  expect(ctx.dropHover).toHaveBeenCalledTimes(1);
});

test("dragging away from the active My Drive restores its highlight", () => {
  renderSidebar({ view: "my-drive" });
  const myDrive = screen.getByText("My Drive");

  fireEvent.dragLeave(myDrive);
  expect(myDrive).toHaveStyle({ backgroundColor: THEME.navActive });
});

test("the New button toggles the menu", () => {
  const { ctx } = renderSidebar();
  fireEvent.click(screen.getByText("New"));
  expect(ctx.setIsNewMenuOpen).toHaveBeenCalledWith(true);

  expect(screen.queryByText(/New folder/)).not.toBeInTheDocument();
});

test("the open New menu runs an item's action and closes", () => {
  const { ctx } = renderSidebar({ isNewMenuOpen: true });
  fireEvent.click(screen.getByText(/File upload/));

  expect(ctx.newMenuItems[1].action).toHaveBeenCalled();
  expect(ctx.setIsNewMenuOpen).toHaveBeenCalledWith(false);
});

test("New menu rows highlight on hover", () => {
  renderSidebar({ isNewMenuOpen: true });
  const row = screen.getByText(/New folder/);

  fireEvent.mouseEnter(row);
  expect(row).toHaveStyle({ backgroundColor: THEME.hoverRow });
  fireEvent.mouseLeave(row);
  expect(row).not.toHaveStyle({ backgroundColor: THEME.hoverRow });
});

test("mousedown in the New area does not reach the background handler", () => {
  const onBackgroundMouseDown = vi.fn();
  render(
    <div onMouseDown={onBackgroundMouseDown}>
      <LayoutContext.Provider value={{
        theme: THEME, view: "my-drive", setView: vi.fn(), setCurrentPath: vi.fn(), setSearchQuery: vi.fn(),
        isNewMenuOpen: false, setIsNewMenuOpen: vi.fn(), newMenuItems: [],
        storageUsed: 0, storageQuota: 0, dropHover: vi.fn(), onInternalDropTo: vi.fn(),
      }}>
        <Sidebar />
      </LayoutContext.Provider>
    </div>
  );

  fireEvent.mouseDown(screen.getByText("New"));
  expect(onBackgroundMouseDown).not.toHaveBeenCalled();
});

test("storage falls back to the default quota and stays empty at zero usage", () => {
  const { container } = renderSidebar({ storageUsed: 0, storageQuota: 0 });
  expect(screen.getByText(/available/).textContent).toBe("0 B used · 1.0 GB available");

  expect(container.querySelector('div[style*="width: 0%"]')).toBeInTheDocument();
});

test("space left counts everything on the node, not just this user's files", () => {
  // 250 of the used 400 belong to other people, so 600 is left, not 750
  renderSidebar({ storageUsed: 150, storageNodeUsed: 400, storageQuota: 1000 });
  expect(screen.getByText(/available/).textContent).toBe("150 B used · 600 B available");
});

test("space left never goes negative once the node is over its cap", () => {
  renderSidebar({ storageUsed: 10, storageNodeUsed: 1500, storageQuota: 1000 });
  expect(screen.getByText(/available/).textContent).toBe("10 B used · 0 B available");
});

test("the storage bar tracks usage and never exceeds full", () => {
  const { container } = renderSidebar({ storageUsed: STORAGE_QUOTA / 4, storageQuota: STORAGE_QUOTA });
  expect(container.querySelector('div[style*="width: 25%"]')).toBeInTheDocument();

  const { container: full } = renderSidebar({ storageUsed: STORAGE_QUOTA * 3, storageQuota: STORAGE_QUOTA });
  expect(full.querySelector('div[style*="width: 100%"]')).toBeInTheDocument();
});
