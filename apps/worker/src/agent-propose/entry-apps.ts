import { DIRECT_COMPONENT_TYPES, exchangesOf, roleSideOf } from "@koklo/schema";
import { isRecord, stringsOf } from "../job-support.ts";
import {
  type CoverageIndex,
  flowsOf,
  knownComponents,
  type Packet,
  type PublishedProposal,
  type RolePacket,
} from "./coverage.ts";
import { type RepriseContext, rewriteFlow } from "./reprises.ts";
import type { Candidate } from "./triage.ts";
import { proposedComponentId } from "./triage-architecture.ts";

/**
 * Passe des applications (TK-114d, B653, B658), dans le même appel que la couverture : un paquet porte au plus 5 rôles sans
 * application d'entrée, chacun avec les composants que ses flux appellent directement. Le modèle répond `entries` (rôle →
 * composant `app` connu ou proposé dans la même réponse) ; le code seul décide : rôle du paquet, une fois, cible `app` où
 * l'ajout peut s'écrire. Les flux proposés dans la même réponse sont réécrits pour passer par l'application d'entrée. Pur.
 */
export interface Entry {
  readonly role: string;
  readonly component: string;
}

/** Sortie `entries` du modèle : les entrées bien formées ; absent ou invalide : []. */
export function entriesOf(raw: unknown): Entry[] {
  return (Array.isArray(raw) ? raw : []).flatMap((item) =>
    isRecord(item) && typeof item.role === "string" && typeof item.component === "string"
      ? [{ role: item.role, component: item.component }]
      : [],
  );
}

/** Rôles de l'index avec les composants `service`, `store` ou `queue` que leurs flux appellent directement (B653). */
export function rolePacketsOf(
  index: CoverageIndex,
  proposals: readonly PublishedProposal[],
): RolePacket[] {
  const types = new Map(knownComponents(index, proposals).map((c) => [c.specId, c.type]));
  const calls = new Map<string, Set<string>>();
  for (const flow of flowsOf(index, proposals).values()) {
    for (const exchange of exchangesOf(flow.messages)) {
      const side = roleSideOf(exchange);
      if (side === undefined || !DIRECT_COMPONENT_TYPES.has(types.get(side.component) ?? ""))
        continue;
      calls.set(side.role, (calls.get(side.role) ?? new Set()).add(side.component));
    }
  }
  return (index.roles ?? []).map(({ specId, title }) => ({
    specId,
    title,
    calls: [...(calls.get(specId) ?? [])],
  }));
}

export interface EntryContext {
  /** Type d'un composant connu : index, lancement, même réponse. */
  readonly typeOf: (id: string) => string | undefined;
  /** La cible peut recevoir l'ajout (même réponse, proposition en attente, indexé non décidé). */
  readonly writable: (id: string) => boolean;
}

/** Rôles retenus par application cible, dans l'ordre de la réponse : rôle du paquet, une fois, cible `app` (B653). */
export function entryActorsPlan(
  entries: readonly Entry[],
  packet: Packet,
  context: EntryContext,
): Map<string, string[]> {
  const holes = new Set((packet.roles ?? []).map((role) => role.specId));
  const added = new Map<string, string[]>();
  for (const { role, component } of entries) {
    if (!holes.has(role) || context.typeOf(component) !== "app" || !context.writable(component))
      continue;
    holes.delete(role);
    added.set(component, [...(added.get(component) ?? []), role]);
  }
  return added;
}

/** Types des composants proposés dans la réponse, par identifiant. */
export const answerTypesOf = (accepted: readonly Candidate[]): Map<string, string> =>
  new Map(
    accepted.flatMap((candidate) => {
      const id =
        candidate.kind === "component" ? proposedComponentId(candidate.payload) : undefined;
      return id === undefined ? [] : [[id, String(candidate.payload.type)] as const];
    }),
  );

/** Applications d'entrée vues par la réécriture : celles de l'index et du lancement, puis les rôles de la même réponse. */
export function withAnswerEntries(
  context: RepriseContext,
  accepted: readonly Candidate[],
  actors: ReadonlyMap<string, readonly string[]>,
): RepriseContext {
  const entryApps = new Map([...context.entryApps].map(([role, apps]) => [role, [...apps]]));
  const add = (app: string, roles: readonly string[]) => {
    for (const role of roles) entryApps.set(role, [...(entryApps.get(role) ?? []), app]);
  };
  for (const candidate of accepted) {
    const id = candidate.kind === "component" ? proposedComponentId(candidate.payload) : undefined;
    if (id !== undefined && candidate.payload.type === "app")
      add(id, stringsOf(candidate.payload.actors));
  }
  for (const [app, roles] of actors) add(app, roles);
  const types = new Map([...context.types, ...answerTypesOf(accepted)]);
  return { types, entryApps };
}

/** Flux de la réponse réécrits quand le rôle a une application d'entrée (B658) ; sinon inchangés. */
export function rewriteAnswerFlows(
  creations: readonly Candidate[],
  context: RepriseContext,
): Candidate[] {
  return creations.map((candidate) => {
    if (candidate.kind !== "archflow") return candidate;
    const rewrite = rewriteFlow(candidate.payload, context);
    return rewrite !== undefined && "payload" in rewrite
      ? { ...candidate, payload: rewrite.payload }
      : candidate;
  });
}
