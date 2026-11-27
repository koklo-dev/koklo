import type { DataCategory, SecurityData, Threat } from "../entities/index.ts";

/**
 * État des menaces et blocages de la validation de la Sécurité (TK-117, B795, B804, B813). Fonctions pures, partagées par
 * l'API (garde de « Valider ») et le worker.
 */

/** Table du modèle (format v1 ou v2) : seuls son identifiant et le nom de ses champs comptent ici. */
export interface ModelTable {
  readonly id: string;
  readonly champs: readonly { readonly nom: string }[];
}

export type ThreatState = "todo" | "ok";

/** Une menace sans parade est « à traiter ». */
export const threatStateOf = ({ parades }: { readonly parades: readonly string[] }): ThreatState =>
  parades.length === 0 ? "todo" : "ok";

const PERSONAL: readonly DataCategory[] = ["personnelle", "contact", "sensible"];

/** Donnée sur une personne : elle exige une durée de conservation et porte le niveau ASVS 2 (A6). */
export const isPersonalData = (category: DataCategory): boolean => PERSONAL.includes(category);

const tableSlug = (id: string): string => id.replace(/^T-/, "");
const fieldsOf = (table: ModelTable): string[] =>
  table.champs.map((field) => `${tableSlug(table.id)}.${field.nom}`);

/** Tous les champs du modèle, `<slug de table>.<champ>`. */
export const modelFields = (tables: readonly ModelTable[]): string[] => tables.flatMap(fieldsOf);

/** Champs du modèle absents de toute entrée (seuls les champs des entrées comptent). */
export function unclassifiedFields(
  data: { readonly donnees: readonly { readonly champs: readonly string[] }[] } | undefined,
  tables: readonly ModelTable[],
): string[] {
  const classified = new Set<string>(data?.donnees.flatMap((entry) => entry.champs));
  return modelFields(tables).filter((field) => !classified.has(field));
}

/** Entrées sur une personne sans durée saisie, désignées par leur premier champ ; une suggestion ne compte pas. */
export const undecidedEntries = (data: Pick<SecurityData, "donnees"> | undefined): string[] =>
  (data?.donnees ?? [])
    .filter((entry) => isPersonalData(entry.categorie) && entry.conservation === undefined)
    .map((entry) => entry.champs[0] as string);

export interface SecurityBlockers {
  /** Menaces de gravité élevée sans parade. */
  readonly openHighThreats: readonly string[];
  readonly unclassified: readonly string[];
  readonly undecided: readonly string[];
}

export interface SecurityBlockerFacts {
  readonly threats: readonly Pick<Threat, "id" | "gravite" | "parades">[];
  readonly data: Pick<SecurityData, "donnees"> | undefined;
  readonly tables: readonly ModelTable[];
}

export const securityBlockers = ({
  threats,
  data,
  tables,
}: SecurityBlockerFacts): SecurityBlockers => ({
  openHighThreats: threats
    .filter((threat) => threat.gravite === "elevee" && threatStateOf(threat) === "todo")
    .map((threat) => threat.id),
  unclassified: unclassifiedFields(data, tables),
  undecided: undecidedEntries(data),
});

export type SecurityBlockerReason = "threats_open" | "data_unclassified";

/** Motif du refus de « Valider » : les menaces d'abord, puis les données ; `undefined` : rien ne bloque. */
export function blockerReasonOf(blockers: SecurityBlockers): SecurityBlockerReason | undefined {
  if (blockers.openHighThreats.length > 0) return "threats_open";
  const data = blockers.unclassified.length + blockers.undecided.length;
  return data > 0 ? "data_unclassified" : undefined;
}

/** Une table saisie seule est développée en ses champs du moment ; le reste est gardé, sans doublon (B795). */
export function expandDataFields(refs: readonly string[], tables: readonly ModelTable[]): string[] {
  const byName = new Map(tables.map((table) => [tableSlug(table.id), fieldsOf(table)]));
  return [...new Set(refs.flatMap((ref) => byName.get(tableSlug(ref)) ?? [ref]))];
}
