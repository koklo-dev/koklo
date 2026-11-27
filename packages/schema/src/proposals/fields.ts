import { z } from "zod";
import { safeText } from "./ai-text-policy.ts";

/** Champs communs des charges de proposition : textes de la sortie du modèle, liens par motif et vocabulaires. */

/** Enum des mots anglais d'une table de vocabulaire (mot -> valeur du fichier). */
export const keysOf = <K extends string>(map: Readonly<Record<K, string>>) =>
  z.enum(Object.keys(map) as [K, ...K[]]);

export const oneLine = (max: number) => safeText({ min: 1, max });
export const text = (max: number) => safeText({ min: 1, max, multiline: true });
export const link = (pattern: RegExp) => z.string().regex(pattern);
export const anyOf = (...patterns: RegExp[]) =>
  link(new RegExp(patterns.map((p) => p.source).join("|")));
export const links = (pattern: RegExp, max = 30) => z.array(link(pattern)).max(max);
