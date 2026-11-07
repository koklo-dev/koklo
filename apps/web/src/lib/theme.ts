export type Theme = "light" | "dark";
/** Choix de la personne : un thème, ou « Système » qui suit `prefers-color-scheme` (B100). */
export type ThemePreference = Theme | "system";

export const THEME_STORAGE_KEY = "koklo-theme";

export const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Exécuté avant le premier rendu : le thème est clair sauf choix enregistré (H-24) ; « system » suit
 * `prefers-color-scheme`. Évite le flash au rechargement.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="dark"||(t==="system"&&window.matchMedia("${DARK_QUERY}").matches)){document.documentElement.classList.add("dark")}}catch(e){}`;

export function readTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" || stored === "system" ? stored : "light";
  } catch {
    return "light";
  }
}

/** Thème effectif d'un choix : « Système » vaut le thème préféré du système. */
export function resolveTheme(preference: ThemePreference): Theme {
  if (preference !== "system") return preference;
  return window.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";
}

export function applyTheme(preference: ThemePreference): void {
  document.documentElement.classList.toggle("dark", resolveTheme(preference) === "dark");
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // stockage indisponible : le choix vaut pour la session seulement
  }
}
