import { useState, useEffect } from "react";

// The five popup menus: the New dropdown, the file context menu, the folder
// context menu (with its Organize submenu), the multi-selection menu, and the
// background right-click menu.
//
// They are one hook rather than five because they are mutually exclusive by
// construction: right-clicking inside a multi-selection opens the selection
// menu instead of the item's own, and opening any of the right-click menus
// dismisses the others through the shared outside-click listener.

// Right-clicking a tile, a button, or a table header means the user is aiming
// at that thing, not at the background behind it.
const BACKGROUND_EXCLUDES = "[data-cid],[data-noselect],button,input,a,table thead";

// Dismiss on any outside mousedown or on Escape. Attached only while
// something is open, so the listeners aren't live for the whole session.
function useDismissOn(isOpen, close) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
    // close is rebuilt every render; isOpen is what should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
}

export function useContextMenus({ view, searchQuery, selection, folderPathOf, folderKeyOf }) {
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);      // { x, y, file }
  const [bgMenu, setBgMenu] = useState(null);                // { x, y }
  const [folderMenu, setFolderMenu] = useState(null);        // { x, y, name, path, shared, trash }
  const [folderOrganizeOpen, setFolderOrganizeOpen] = useState(false);
  const [selMenu, setSelMenu] = useState(null);              // { x, y }

  // The New dropdown closes on its own; clicks inside its container are
  // stopped from propagating before they reach this listener.
  useDismissOn(isNewMenuOpen, () => setIsNewMenuOpen(false));

  const closeRightClickMenus = () => {
    setBgMenu(null);
    setFolderMenu(null);
    setSelMenu(null);
    setFolderOrganizeOpen(false);
  };
  useDismissOn(!!(bgMenu || folderMenu || selMenu), closeRightClickMenus);

  const at = (e) => ({ x: e.clientX, y: e.clientY });

  // Right-clicking something that is part of the current multi-selection acts
  // on the whole selection rather than on the one item under the pointer.
  const inSelection = (key) => selection.count > 1 && selection.has(key);

  const openMenuForFile = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    if (inSelection(item.cid)) { setSelMenu(at(e)); return; }
    setContextMenu({ ...at(e), file: item });
  };

  const openMenuForFolder = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    if (inSelection(folderKeyOf(item))) { setSelMenu(at(e)); return; }
    setFolderOrganizeOpen(false); // never reopen a submenu already expanded
    setFolderMenu({
      ...at(e),
      name: item.name,
      path: folderPathOf(item),
      shared: !!item.shared,
      trash: !!item.trash,
    });
  };

  // Only in My Drive: the background menu creates folders and starts uploads,
  // both of which need a current path that the other views don't have.
  const onBackgroundContextMenu = (e) => {
    if (view !== "my-drive" || searchQuery) return;
    if (e.target.closest(BACKGROUND_EXCLUDES)) return;
    e.preventDefault();
    setBgMenu(at(e));
  };

  return {
    isNewMenuOpen, setIsNewMenuOpen,
    contextMenu, closeContextMenu: () => setContextMenu(null),
    bgMenu, setBgMenu,
    folderMenu, setFolderMenu,
    folderOrganizeOpen, setFolderOrganizeOpen,
    selMenu, setSelMenu,
    openMenuForFile, openMenuForFolder, onBackgroundContextMenu,
  };
}
