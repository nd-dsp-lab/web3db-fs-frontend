import { createContext, useContext } from "react";

// Shared layout state/handlers, provided by AppLayout and consumed by the
// deep view components (grid, list, menus, toolbar) via useLayout() instead
// of long prop chains.
export const LayoutContext = createContext(null);

export const useLayout = () => useContext(LayoutContext);
