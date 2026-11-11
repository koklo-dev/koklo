import { AGENT_PROPOSE_LIMITS, type AgentProposalKind } from "@koklo/domain";
import { isSafeText, PROPOSAL_SCHEMAS } from "@koklo/schema";
import { isRecord } from "../job-support.ts";
import { OutputInvalidError } from "./errors.ts";

const TITLE_MAX = 200;
const ZONE_MAX = 120;
const RATIONALE_MAX = 500;

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
  /** Titres déjà connus (cahier, propositions déjà publiées), normalisés : alimenté au fil de la génération. */
  readonly titles: Set<string>;
  /** Fonctionnalités sans critère (`F-nnn` vers titre) : seules cibles d'une proposition `criteria`, une fois chacune. */
  readonly missingCriteria: Map<string, string>;
}

/** Clé de comparaison de deux titres : forme NFKC, espaces repliés, casse ignorée. */
export const titleKey = (title: string): string =>
  title.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

const titleOf = (kind: AgentProposalKind, payload: Record<string, unknown>): string => {
  const value = payload[kind === "role" ? "name" : "title"];
  return typeof value === "string" ? value.slice(0, TITLE_MAX) : "";
};

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
  if (asKind === "criteria") {
    const title = criteriaTarget(payload, context);
    return title === undefined ? undefined : { kind: asKind, title, rationale, payload };
  }
  const title = titleOf(asKind, payload);
  if (context.titles.has(titleKey(title))) return undefined;
  context.titles.add(titleKey(title));
  return { kind: asKind, title, rationale, payload };
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

/** Titres de zones du modèle : texte brut d'une ligne, 120 caractères au plus, sans doublon, douze au plus. */
export function zonesOf(raw: unknown): string[] {
  if (!isRecord(raw) || !Array.isArray(raw.zones)) throw new OutputInvalidError();
  const zones: string[] = [];
  for (const entry of raw.zones as unknown[]) {
    if (typeof entry !== "string") continue;
    const zone = entry.trim();
    const valid = zone.length > 0 && zone.length <= ZONE_MAX && isSafeText(zone, false);
    if (valid && !zones.includes(zone)) zones.push(zone);
  }
  if (zones.length === 0) throw new OutputInvalidError();
  return zones.slice(0, AGENT_PROPOSE_LIMITS.zones);
}
