/** Vrai seulement pour une URL `https://github.com/…` (sans identifiants, port ni autre hôte). */
export function isGithubUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "github.com" &&
      parsed.port === "" &&
      parsed.username === "" &&
      parsed.password === ""
    );
  } catch {
    return false;
  }
}

/** Frontière navigateur : navigation vers l'URL (remplaçable dans les tests). */
export function assignLocation(url: string): void {
  window.location.assign(url);
}
