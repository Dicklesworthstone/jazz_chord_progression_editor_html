/**
 * Theme selection for the v2 ink-on-paper identity (jcpe-v2-redesign-z323).
 *
 * The paper (light) theme is the stylesheet base; the night theme applies
 * through the OS preference until the user makes an explicit choice, which is
 * pinned on the root element as [data-theme] and remembered locally. The
 * stored value is a UI presentation preference, never document data — it does
 * not pass through the persistence layer's recovery adapters, and every
 * storage touch degrades silently where storage is unavailable (file:// in
 * some engines, private windows).
 */

export type StudioTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "jz.theme";

function storedTheme(): StudioTheme | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function osPrefersDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

/** The theme the page is currently presenting. */
export function activeTheme(): StudioTheme {
  const pinned = document.documentElement.getAttribute("data-theme");
  if (pinned === "light" || pinned === "dark") return pinned;
  return osPrefersDark() ? "dark" : "light";
}

/**
 * Applies a stored explicit choice at boot. Without one, the root attribute
 * stays absent so the OS preference keeps governing through the stylesheet's
 * media block — including live OS theme changes.
 */
export function initializeTheme(): StudioTheme {
  const stored = storedTheme();
  if (stored !== null) {
    document.documentElement.setAttribute("data-theme", stored);
    return stored;
  }
  return activeTheme();
}

/** Pins an explicit choice and remembers it. */
export function setTheme(theme: StudioTheme): StudioTheme {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* Presentation preference only; losing it is acceptable. */
  }
  return theme;
}

export function toggleTheme(): StudioTheme {
  return setTheme(activeTheme() === "dark" ? "light" : "dark");
}
