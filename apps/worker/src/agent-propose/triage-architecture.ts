import { type AgentProposalKind, slugOf } from "@koklo/domain";
import { recordsOf, stringsOf } from "../job-support.ts";

/**
 * Références que le modèle peut viser pour le livrable Architecture (TK-111, B511) : identifiants du cahier, des tables, des
 * parcours, des rôles, des composants et des décisions déjà connus. `components` et `archflows` sont complétés au fil du tri
 * par ce que la génération a déjà accepté.
 */
export interface ArchitectureRefs {
  readonly features: ReadonlySet<string>;
  readonly rules: ReadonlySet<string>;
  readonly tables: ReadonlySet<string>;
  /** Parcours métier `P-<slug>` : un flux technique en détaille un, une seule fois. */
  readonly flows: ReadonlySet<string>;
  readonly roles: ReadonlySet<string>;
  readonly components: Set<string>;
  readonly decisions: ReadonlySet<string>;
  /** Flux techniques existants, puis acceptés : un parcours n'a qu'un flux. */
  readonly archflows: Set<string>;
  /** Tables déjà possédées (index, puis acceptées) : le premier déclarant reste propriétaire (TK-114b, B614). */
  readonly ownedTables: Set<string>;
}

export const ARCHITECTURE_KINDS: readonly AgentProposalKind[] = [
  "component",
  "archflow",
  "adr",
  "doc_section",
];
export const isArchitectureKind = (kind: AgentProposalKind): boolean =>
  ARCHITECTURE_KINDS.includes(kind);

/** Identifiant que le serveur attribuera à un composant : `C-<slug du nom>`. */
export const componentIdOf = (name: string): string => `C-${slugOf(name, "composant")}`;

const allIn = (ids: readonly string[], known: ReadonlySet<string>): boolean =>
  ids.every((id) => known.has(id));

const ownIdOf = (payload: Record<string, unknown>): string =>
  componentIdOf(typeof payload.name === "string" ? payload.name : "");

/** Les cibles de `dependsOn` sont filtrées avant (`withKnownDependencies`, B638) : seuls tables, fonctions et décisions écartent. */
function componentKnown(payload: Record<string, unknown>, arch: ArchitectureRefs): boolean {
  if (arch.components.has(ownIdOf(payload))) return false;
  return (
    allIn(stringsOf(payload.owns), arch.tables) &&
    allIn(stringsOf(payload.serves), arch.features) &&
    allIn(stringsOf(payload.decisions), arch.decisions)
  );
}

/** Messages d'un flux, blocs `alt` compris. */
function messagesOf(items: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  return items.flatMap((item) => ("block" in item ? recordsOf(item.messages) : [item]));
}

function archflowKnown(payload: Record<string, unknown>, arch: ArchitectureRefs): boolean {
  const flow = payload.flow;
  if (typeof flow !== "string" || !arch.flows.has(flow) || arch.archflows.has(flow)) return false;
  const participants = new Set(stringsOf(payload.participants));
  const declared = [...participants].every((id) => arch.components.has(id) || arch.roles.has(id));
  const ends = messagesOf(recordsOf(payload.messages)).flatMap((message) => [
    message.from,
    message.to,
  ]);
  return (
    declared &&
    ends.every((id) => typeof id === "string" && participants.has(id)) &&
    allIn(stringsOf(payload.features), arch.features) &&
    allIn(stringsOf(payload.rules), arch.rules) &&
    allIn(stringsOf(payload.decisions), arch.decisions)
  );
}

function adrKnown(payload: Record<string, unknown>, arch: ArchitectureRefs): boolean {
  const known = new Set([
    ...arch.features,
    ...arch.rules,
    ...arch.tables,
    ...arch.components,
    ...arch.flows,
  ]);
  return allIn(stringsOf(payload.links), known);
}

/** Les références d'une proposition d'architecture visent des identifiants connus ; sans contexte d'architecture, aucune ne l'est. */
export function architectureKnown(
  kind: AgentProposalKind,
  payload: Record<string, unknown>,
  arch: ArchitectureRefs | undefined,
): boolean {
  if (arch === undefined) return false;
  if (kind === "component") return componentKnown(payload, arch);
  if (kind === "archflow") return archflowKnown(payload, arch);
  if (kind === "adr") return adrKnown(payload, arch);
  return true;
}

/** Identifiant d'un composant proposé : son `specId` (posé par le code seul), sinon celui que le serveur attribuera. */
export const proposedComponentId = (payload: Record<string, unknown>): string | undefined => {
  if (typeof payload.specId === "string") return payload.specId;
  return typeof payload.name === "string" ? componentIdOf(payload.name) : undefined;
};

/** Composant proposé : les tables déjà possédées sont retirées de `owns` (TK-114b, B614). Tout autre type : inchangé. */
export function withoutOwnedTables(
  kind: AgentProposalKind,
  payload: Record<string, unknown>,
  arch: ArchitectureRefs | undefined,
): Record<string, unknown> {
  if (kind !== "component" || arch === undefined || !Array.isArray(payload.owns)) return payload;
  return { ...payload, owns: stringsOf(payload.owns).filter((id) => !arch.ownedTables.has(id)) };
}

/**
 * Composant proposé : une cible de `dependsOn` inconnue (zone pas encore traitée, composant cité avant d'être proposé) est
 * retirée au lieu d'écarter le composant (TK-114c, B638) ; l'auto-dépendance reste admise (TK-111). La passe de couverture
 * rétablit ensuite les liens. Tout autre type : inchangé.
 */
export function withKnownDependencies(
  kind: AgentProposalKind,
  payload: Record<string, unknown>,
  arch: ArchitectureRefs | undefined,
): Record<string, unknown> {
  if (kind !== "component" || arch === undefined || !Array.isArray(payload.dependsOn))
    return payload;
  const own = ownIdOf(payload);
  const known = (link: Record<string, unknown>) =>
    typeof link.to === "string" && (link.to === own || arch.components.has(link.to));
  return { ...payload, dependsOn: recordsOf(payload.dependsOn).filter(known) };
}

/** Une proposition acceptée devient connue pour la suite de la génération (composants, flux, tables possédées). */
export function rememberAccepted(
  kind: AgentProposalKind,
  payload: Record<string, unknown>,
  arch: ArchitectureRefs | undefined,
): void {
  if (arch === undefined) return;
  const id = kind === "component" ? proposedComponentId(payload) : undefined;
  if (id !== undefined) arch.components.add(id);
  if (kind === "component")
    for (const table of stringsOf(payload.owns)) arch.ownedTables.add(table);
  if (kind === "archflow" && typeof payload.flow === "string") arch.archflows.add(payload.flow);
}
