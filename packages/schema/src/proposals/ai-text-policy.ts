import { z } from "zod";

/**
 * Politique de contenu d'une sortie du modèle (D6). La sortie est une donnée hostile : un champ de
 * texte ne doit contenir ni lien, ni balise, ni image, ni caractère de contrôle ou de direction.
 * Du texte ordinaire (« < » isolé entre espaces, crochets simples, guillemets français) reste accepté.
 */
const FORBIDDEN_CONTENT: readonly RegExp[] = [
  /https?:\/\//i, // adresse web
  /<[a-z/!]/i, // balise ou commentaire HTML
  /!\[/, // image markdown
  /\]\(/, // lien markdown
];

/** Contrôles C0 et C1 (le saut de ligne et la tabulation sont traités à part). */
const hasControlCharacter = (text: string): boolean =>
  Array.from(text).some((char) => {
    const code = char.codePointAt(0) ?? 0;
    return (code <= 0x1f && code !== 0x0a && code !== 0x09) || (code >= 0x7f && code <= 0x9f);
  });
const DIRECTIONAL = /[\u061C\u200B-\u200F\u2028-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/;
const LINE_BREAK = /[\n\r\t]/;

/** Vrai si le texte respecte la politique ; la forme NFKC écarte les variantes pleine chasse. */
export function isSafeText(text: string, multiline: boolean): boolean {
  const folded = text.normalize("NFKC");
  if (hasControlCharacter(text) || DIRECTIONAL.test(text)) return false;
  if (!multiline && LINE_BREAK.test(text)) return false;
  return !FORBIDDEN_CONTENT.some((pattern) => pattern.test(folded) || pattern.test(text));
}

interface TextBounds {
  readonly min: number;
  readonly max: number;
  /** Plusieurs lignes permises (description, problème…) ; sinon une seule ligne. */
  readonly multiline?: boolean;
}

/** Champ de texte d'une sortie du modèle : borné, sans contenu interdit. Le message n'en reprend rien. */
export const safeText = ({ min, max, multiline = false }: TextBounds) =>
  z
    .string()
    .min(min)
    .max(max)
    .refine((text) => isSafeText(text, multiline), "contenu non autorisé");
