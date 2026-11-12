import { SEED_DATE } from "./seed-data.ts";
import type { SeedStatement } from "./seed-statements.ts";

/**
 * Briques SQL communes des jeux de volume (TK-94, TK-105) : identifiants dérivés du projet, remplissage des rangs,
 * choix cyclique d'une valeur. Paramètres de chaque requête : `$1` projet, `$2` organisation, `$3` date fixe.
 */
export interface VolumeTarget {
  organizationId: string;
  projectId: string;
}

/** Une requête ne reçoit que les paramètres qu'elle cite (`pg` refuse un paramètre en trop). */
export const statementOf = (sql: string, target: VolumeTarget): SeedStatement => {
  const used = Math.max(...[...sql.matchAll(/\$(\d)/g)].map((match) => Number(match[1])));
  return { sql, params: [target.projectId, target.organizationId, SEED_DATE].slice(0, used) };
};

/**
 * UUID dérivé d'un texte : les 32 chiffres de `md5`, dont les quartets de version (8) et de variante
 * (a) sont fixés pour que l'identifiant soit un UUID valide aux yeux du contrat (`z.uuid()`).
 */
const uuidOf = (text: string) =>
  `overlay(overlay(md5(${text}) placing '8' from 13 for 1) placing 'a' from 17 for 1)::uuid`;
/** Identifiant dérivé d'une nature d'objet unique du projet (installation, dépôt, instantané…). */
export const own = (kind: string) => uuidOf(`$1::text || ':${kind}'`);
/** Identifiant dérivé du n-ième objet d'une série. */
export const nth = (kind: string, n = "n") => uuidOf(`$1::text || ':${kind}:' || ${n}`);
/** Au moins trois chiffres, sans jamais tronquer (`lpad` couperait 1000 en 100). */
export const pad = (n = "n") => `lpad(${n}::text, GREATEST(3, length(${n}::text)), '0')`;
export const pick = (values: readonly string[], index: string) =>
  `(ARRAY[${values.map((value) => `'${value.replace(/'/g, "''")}'`).join(", ")}])[1 + ${index}]`;

/** Verbes et compléments tournants : des titres lisibles, distincts, stables d'une exécution à l'autre. */
export const VERBS = [
  "Gérer",
  "Consulter",
  "Exporter",
  "Importer",
  "Valider",
  "Suspendre",
  "Relancer",
  "Archiver",
  "Planifier",
] as const;
export const NOUNS = [
  "les réservations",
  "le calendrier",
  "les paiements",
  "les clients",
  "les factures",
  "les notifications",
  "le planning",
  "les documents",
  "les accès",
  "les rapports",
] as const;
