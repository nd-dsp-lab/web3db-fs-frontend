import { createContext, useContext } from "react";

// Everything App owns — auth, the API client, view/search state, file actions,
// starred, theme, storage — provided by App and read by AppLayout via
// useWorkspace(). AppLayout used to take these as ~50 props only to forward
// them into LayoutContext, so the prop list was a hop with no reader.
export const WorkspaceContext = createContext(null);

export const useWorkspace = () => useContext(WorkspaceContext);
