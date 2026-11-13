import { AGENT_PROPOSE_LIMITS, type AgentProposalKind, slugOf } from "@koklo/domain";
import { isSafeText, PROPOSAL_SCHEMAS } from "@koklo/schema";
import { isRecord } from "../job-support.ts";
import { OutputInvalidError } from "./errors.ts";

const TITLE_MAX = 200;
const ZONE_MAX = 120;
const RATIONALE_MAX = 500;
/** Une seule proposition « relations » par lancement : son titre est fixe, un second est un doublon. */
const RELATIONS_TITLE = "Relations";

/** Proposition validée, prête à être publiée (le contenu a passé le schéma de son type et le texte brut). */
export interface Candidate {
  readonly kind: AgentProposalKind;
  readonly title: string;
  readonly rationale: string;
  readonly payload: Record<string, unknown>;
}

export interface TriageContext {
  /** Types que le mode du lancement demande ; tout autre type est écarté. */
  readonly kinds: readonly AgentProposalKind[];
  /** Titres déjà connus par type (cahier, propositions déjà publiées), normalisés : alimenté au fil de la génération. */
  readonly titles: Partial<Record<AgentProposalKind, Set<string>>>;
  /** Fonctionnalités sans critère (`F-nnn` vers titre) : seules cibles d'une proposition `criteria`, une fois chacune. */
  readonly missingCriteria: Map<string, string>;
  /**
   * Livrable Données : références que le modèle peut viser. `specIds` : fonctionnalités et règles du cahier ; `tables` :
   * tables du modèle actuel, complétées au fil du tri par celles de la génération, avec leurs noms de champs (`null` :
   * champs inconnus, jeu non contrôlé). Absent pour le Fonctionnel.
   */
  readonly refs?: {
    readonly specIds: ReadonlySet<string>;
    readonly tables: Map<string, ReadonlySet<string> | null>;
  };
}

/** Clé de comparaison de deux titres : forme NFKC, espaces repliés, casse ignorée. */
export const titleKey = (title: string): string =>
  title.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

const titleOf = (kind: AgentProposalKind, payload: Record<string, unknown>): string => {
  const value = payload[kind === "role" || kind === "table" ? "name" : "title"];
  return typeof value === "string" ? value.slice(0, TITLE_MAX) : "";
};

const tableIdOf = (name: string): string => `T-${slugOf(name, "table")}`;

/** Noms des champs d'une table proposée. */
const fieldNamesOf = (payload: Record<string, unknown>): ReadonlySet<string> =>
  new Set(
    recordsOf(payload.fields).flatMap((field) =>
      typeof field.name === "string" ? [field.name] : [],
    ),
  );

const recordsOf = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];
const stringsOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** Table visée par un type de champ `ref(T-slug)` ; `undefined` pour tout autre type. */
const refTarget = (type: unknown): string | undefined =>
  typeof type === "string" ? /^ref\((T-[a-z0-9-]+)\)$/.exec(type)?.[1] : undefined;

/** Références d'une table : `sources` et `rule` vers le cahier, `ref(T-x)` vers une table connue ou elle-même. */
function tableReferencesKnown(
  payload: Record<string, unknown>,
  refs: NonNullable<TriageContext["refs"]>,
) {
  const own = tableIdOf(titleOf("table", payload));
  const fields = recordsOf(payload.fields);
  const ruleIds = fields.flatMap((field) => (typeof field.rule === "string" ? [field.rule] : []));
  const targets = fields.flatMap((field) => refTarget(field.type) ?? []);
  return (
    [...stringsOf(payload.sources), ...ruleIds].every((id) => refs.specIds.has(id)) &&
    targets.every((id) => id === own || refs.tables.has(id))
  );
}

/**
 * Un jeu vise une table connue et n'emploie que ses champs. L'agent traite le cahier zone par zone : deux zones peuvent
 * décrire la même table avec des champs différents ; seule la première est gardée (doublon de titre), et le jeu bâti sur
 * l'autre version ferait échouer tout l'enregistrement (`R4_UNKNOWN_FIELD`). Il est donc écarté ici.
 */
function fixtureFitsTable(
  payload: Record<string, unknown>,
  refs: NonNullable<TriageContext["refs"]>,
): boolean {
  if (typeof payload.table !== "string" || !refs.tables.has(payload.table)) return false;
  const fields = refs.tables.get(payload.table);
  if (fields === null || fields === undefined) return true;
  return recordsOf(payload.rows).every((row) => Object.keys(row).every((key) => fields.has(key)));
}

/** Les types des Données ne visent que des identifiants connus (cahier, modèle actuel, tables de la génération). */
function referencesKnown(
  kind: AgentProposalKind,
  payload: Record<string, unknown>,
  refs: TriageContext["refs"],
): boolean {
  if (kind !== "table" && kind !== "relations" && kind !== "fixtures") return true;
  if (refs === undefined) return false;
  if (kind === "table") return tableReferencesKnown(payload, refs);
  if (kind === "fixtures") return fixtureFitsTable(payload, refs);
  return recordsOf(payload.relations).every(
    (relation) =>
      typeof relation.from === "string" &&
      typeof relation.to === "string" &&
      refs.tables.has(relation.from) &&
      refs.tables.has(relation.to),
  );
}

/** Un type `criteria` n'a pas de titre propre : celui de la fonctionnalité visée, sous la forme `F-nnn · Titre`. */
function criteriaTarget(
  payload: Record<string, unknown>,
  context: TriageContext,
): string | undefined {
  const specId = payload.specId;
  const featureTitle = typeof specId === "string" ? context.missingCriteria.get(specId) : undefined;
  if (typeof specId !== "string" || featureTitle === undefined) return undefined;
  context.missingCriteria.delete(specId);
  return `${specId} · ${featureTitle}`.slice(0, TITLE_MAX);
}

/** Une entrée de la sortie du modèle : `undefined` si elle doit être écartée (jamais publiée, comptée). */
function candidateOf(entry: unknown, context: TriageContext): Candidate | undefined {
  if (!isRecord(entry)) return undefined;
  const { kind, rationale, content } = entry;
  const kinds: readonly unknown[] = context.kinds;
  if (!kinds.includes(kind) || typeof rationale !== "string") return undefined;
  if (rationale.length > RATIONALE_MAX || !isSafeText(rationale, true)) return undefined;
  const asKind = kind as AgentProposalKind;
  const parsed = PROPOSAL_SCHEMAS[asKind].safeParse(content);
  if (!parsed.success) return undefined;
  const payload = parsed.data as Record<string, unknown>;
  const title = titleFor(asKind, payload, context);
  return title === undefined ? undefined : { kind: asKind, title, rationale, payload };
}

/** Titre d'une proposition valide, `undefined` si elle doit être écartée (cible, doublon, référence inconnue). */
function titleFor(
  kind: AgentProposalKind,
  payload: Record<string, unknown>,
  context: TriageContext,
): string | undefined {
  if (kind === "criteria") return criteriaTarget(payload, context);
  if (!referencesKnown(kind, payload, context.refs)) return undefined;
  const title = kind === "relations" ? RELATIONS_TITLE : titleOf(kind, payload);
  const known = context.titles[kind] ?? new Set<string>();
  context.titles[kind] = known;
  if (known.has(titleKey(title))) return undefined;
  known.add(titleKey(title));
  if (kind === "table") context.refs?.tables.set(tableIdOf(title), fieldNamesOf(payload));
  return title;
}

/**
 * Trie la sortie d'une zone : chaque entrée est validée à part (schéma du type, texte brut, doublon, cible) ; une
 * entrée refusée est écartée et comptée, jamais publiée. Au plus 25 propositions par zone, l'excédent est écarté.
 * Seule une sortie qui n'a pas la forme `{ proposals: [...] }` lève.
 */
export function triageProposals(
  raw: unknown,
  context: TriageContext,
): { accepted: Candidate[]; discarded: number } {
  if (!isRecord(raw) || !Array.isArray(raw.proposals)) throw new OutputInvalidError();
  const accepted: Candidate[] = [];
  let discarded = 0;
  for (const entry of raw.proposals as unknown[]) {
    const candidate =
      accepted.length < AGENT_PROPOSE_LIMITS.perZone ? candidateOf(entry, context) : undefined;
    if (candidate === undefined) discarded += 1;
    else accepted.push(candidate);
  }
  return { accepted, discarded };
}

/** Titres de zones du modèle : texte brut d'une ligne, `maxLength` caractères au plus (120 ; 80 pour les Données), sans doublon, douze au plus. */
export function zonesOf(raw: unknown, maxLength = ZONE_MAX): string[] {
  if (!isRecord(raw) || !Array.isArray(raw.zones)) throw new OutputInvalidError();
  const zones: string[] = [];
  for (const entry of raw.zones as unknown[]) {
    if (typeof entry !== "string") continue;
    const zone = entry.trim();
    const valid = zone.length > 0 && zone.length <= maxLength && isSafeText(zone, false);
    if (valid && !zones.includes(zone)) zones.push(zone);
  }
  if (zones.length === 0) throw new OutputInvalidError();
  return zones.slice(0, AGENT_PROPOSE_LIMITS.zones);
}
