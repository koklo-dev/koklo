import { type AgentProposalKind, slugOf } from "@koklo/domain";
import { isRecord } from "../job-support.ts";

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

const stringsOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const recordsOf = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];
const allIn = (ids: readonly string[], known: ReadonlySet<string>): boolean =>
  ids.every((id) => known.has(id));

function componentKnown(payload: Record<string, unknown>, arch: ArchitectureRefs): boolean {
  const own = componentIdOf(typeof payload.name === "string" ? payload.name : "");
  if (arch.components.has(own)) return false;
  const targets = recordsOf(payload.dependsOn).flatMap((link) =>
    typeof link.to === "string" ? [link.to] : [],
  );
  return (
    allIn(stringsOf(payload.owns), arch.tables) &&
    allIn(stringsOf(payload.serves), arch.features) &&
    allIn(stringsOf(payload.decisions), arch.decisions) &&
    targets.every((id) => id === own || arch.components.has(id))
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

/** Une proposition acceptée devient connue pour la suite de la génération (composants, flux). */
export function rememberAccepted(
  kind: AgentProposalKind,
  payload: Record<string, unknown>,
  arch: ArchitectureRefs | undefined,
): void {
  if (arch === undefined) return;
  if (kind === "component" && typeof payload.name === "string") {
    arch.components.add(componentIdOf(payload.name));
  }
  if (kind === "archflow" && typeof payload.flow === "string") arch.archflows.add(payload.flow);
}
