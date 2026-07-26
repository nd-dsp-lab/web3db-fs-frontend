// The Google Drive-style palette, light and dark. This used to be redeclared
// in AppLayout and in each modal, which had already drifted apart (two greys
// for the same border, two different input backgrounds), so it lives here now
// and every surface reads the same tokens.
//
// Token guide:
//   bg / card      page background, and any surface sitting on top of it
//   text / subText primary and secondary foreground
//   border         hairlines and outlines
//   searchBg       filled inputs in the chrome (search box, theme toggle)
//   inputBg        filled inputs inside modals
//   tile / tileHover   file and folder tiles
//   hoverRow       hover on rows and menu items
//   navActive / navActiveText   the selected sidebar item
export function makeTheme(darkMode) {
  return darkMode ? {
    bg: "#131314", card: "#1E1F20", text: "#E3E3E3", subText: "#9AA0A6",
    border: "#3C4043", searchBg: "#282A2C", inputBg: "#282A2C",
    tile: "#2D2E31", tileHover: "#37393B",
    navActive: "#004A77", navActiveText: "#C2E7FF", hoverRow: "#2D2E31",
  } : {
    bg: "#F8FAFD", card: "#FFFFFF", text: "#1F1F1F", subText: "#5F6368",
    border: "#E0E3E7", searchBg: "#EDF1F7", inputBg: "#F0F4F9",
    tile: "#F0F4F9", tileHover: "#E1E5EA",
    navActive: "#C2E7FF", navActiveText: "#001D35", hoverRow: "#F5F8FC",
  };
}

// Colours that carry meaning rather than depth. These are deliberately the
// same in both themes — each one is legible on either surface, and swapping
// them per theme would weaken the signal.
export const BLUE = "#1A73E8";      // primary action
export const DANGER = "#d93025";    // destructive confirm
export const TRASH = "#d9534f";     // destructive menu item
export const SHARE = "#00a86b";     // share action
export const STARRED = "#F29900";   // starred marker
