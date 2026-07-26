import { makeTheme, BLUE, DANGER, TRASH, SHARE, STARRED } from "./theme";

// The palette used to be redeclared per component and had drifted. These
// tests are less about the specific hex values than about the invariants that
// drift breaks: both themes carry the same tokens, and none of them collide.

const KEYS = [
  "bg", "card", "text", "subText", "border", "searchBg", "inputBg",
  "tile", "tileHover", "navActive", "navActiveText", "hoverRow",
];

test("both themes expose exactly the same tokens", () => {
  expect(Object.keys(makeTheme(true)).sort()).toEqual([...KEYS].sort());
  expect(Object.keys(makeTheme(false)).sort()).toEqual([...KEYS].sort());
});

test("every token is a hex colour", () => {
  for (const theme of [makeTheme(true), makeTheme(false)]) {
    for (const [name, value] of Object.entries(theme)) {
      expect(value, name).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  }
});

test("light and dark differ on every token", () => {
  // A token that is identical in both themes is a sign one side was missed.
  const light = makeTheme(false);
  const dark = makeTheme(true);
  for (const key of KEYS) expect(dark[key], key).not.toBe(light[key]);
});

test("foreground and background are not the same colour", () => {
  for (const theme of [makeTheme(true), makeTheme(false)]) {
    expect(theme.text).not.toBe(theme.card);
    expect(theme.subText).not.toBe(theme.card);
    expect(theme.text).not.toBe(theme.bg);
  }
});

test("dark is dark and light is light", () => {
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  };
  expect(luminance(makeTheme(true).card)).toBeLessThan(0.3);
  expect(luminance(makeTheme(false).card)).toBeGreaterThan(0.9);
  expect(luminance(makeTheme(true).text)).toBeGreaterThan(0.7);
  expect(luminance(makeTheme(false).text)).toBeLessThan(0.3);
});

test("semantic colours are theme-independent and distinct", () => {
  const semantic = { BLUE, DANGER, TRASH, SHARE, STARRED };
  for (const [name, value] of Object.entries(semantic)) {
    expect(value, name).toMatch(/^#[0-9A-Fa-f]{6}$/);
  }
  expect(new Set(Object.values(semantic)).size).toBe(Object.keys(semantic).length);
});

test("a new theme object is returned each call, so callers cannot poison it", () => {
  const a = makeTheme(true);
  a.card = "#000000";
  expect(makeTheme(true).card).not.toBe("#000000");
});
