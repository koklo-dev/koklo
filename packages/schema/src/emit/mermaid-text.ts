/** Caractères qui ont un sens pour Mermaid (délimiteurs, instructions, commentaires `%%`) : remplacés par leur entité `#<code>;`. */
const SPECIAL = /[#"&;<>|[\]{}()`%\\]/g;
const BREAKS = /[\p{Cc}\u2028\u2029]+/gu;

/**
 * Texte brut sûr pour un libellé Mermaid : sauts de ligne et contrôles ramenés à une espace, caractères spéciaux
 * remplacés par leur entité numérique. Le résultat tient sur une ligne, sans `;`, guillemet ni balise (hors entités).
 */
export const mermaidText = (value: string): string =>
  value
    .replace(BREAKS, " ")
    .replace(SPECIAL, (char) => `#${char.codePointAt(0)};`)
    .trim();

/** Identifiant de nœud ou de participant : `C-api` -> `C_api` (le tiret n'est pas admis partout). */
export const mermaidId = (id: string): string => id.replace(/[^A-Za-z0-9_]/g, "_");
