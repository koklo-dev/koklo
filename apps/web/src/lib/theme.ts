export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "koklo-theme";

/**
 * Exécuté avant le premier rendu : le thème est clair sauf choix enregistré (H-24), quel que soit
 * `prefers-color-scheme`. Évite le flash au rechargement.
 */
export const THEME_INIT_SCRIPT = `try{if(localStorage.getItem("${THEME_STORAGE_KEY}")==="dark"){document.documentElement.classList.add("dark")}}catch(e){}`;

export function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // stockage indisponible : le choix vaut pour la session seulement
  }
}
