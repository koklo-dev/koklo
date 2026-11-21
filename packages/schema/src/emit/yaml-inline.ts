import { stringify } from "yaml";

/** Élément de liste en style flux : nu s'il est sûr, sinon cité en JSON (une virgule ou un crochet couperait la liste). */
const inlineItem = (value: string): string =>
  /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) ? value : JSON.stringify(value);

/** Liste YAML en style flux sur une ligne : `[a, "b c"]`. */
export const inlineList = (items: readonly string[] | undefined): string =>
  `[${(items ?? []).map(inlineItem).join(", ")}]`;

/** Scalaire YAML sûr sur une ligne (JSON en repli : YAML valide). */
export function yamlScalar(value: string): string {
  const text = stringify(value, { lineWidth: 0 }).trimEnd();
  return text.includes("\n") ? JSON.stringify(value) : text;
}

/** Vrai pour un texte d'une seule ligne, sans caractère de contrôle de ligne ni espace de bord. */
export const isOneLine = (value: string): boolean =>
  !/[\r\n\0\u2028\u2029]/.test(value) && value === value.trim();
