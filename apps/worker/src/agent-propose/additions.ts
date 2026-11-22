import { stringsOf } from "../job-support.ts";
import {
  type Complement,
  type Dependency,
  dependenciesOf,
  dependencyUnion,
  type Packet,
  unionOf,
} from "./coverage.ts";
import { ACTORS_MAX, type targetOf, updateProposalOf } from "./tables.ts";
import type { Candidate } from "./triage.ts";
import { proposedComponentId } from "./triage-architecture.ts";

/**
 * Ajouts de liens par composant cible (TK-114b, B616 ; TK-114c, B636 ; TK-114d, B653, B657) : fonctionnalités servies,
 * dépendances et rôles d'entrée. Écrits sur une proposition de la même réponse, en complément d'une proposition en attente, ou
 * par UNE proposition `specId` d'un composant indexé (index ∪ ajouts). Pur, sans I/O.
 */
export interface Additions {
  readonly serves: Map<string, string[]>;
  readonly dependsOn: Map<string, Dependency[]>;
  readonly actors: Map<string, string[]>;
}

export type Plan = { creations: Candidate[]; complements: Complement[] };

/** Justification d'une proposition `specId` née d'affectations, de liens ou de rôles (B615, B636, B653). */
export const ASSIGNMENT_RATIONALE = "Fonctionnalités et dépendances à rattacher au composant.";

export const emptyAdditions = (): Additions => ({
  serves: new Map(),
  dependsOn: new Map(),
  actors: new Map(),
});

export interface Assignment {
  readonly feature: string;
  readonly component: string;
}

/** Affectations gardées par composant (B616) : trou du paquet, une fois ; composant connu (index, lancement, même réponse). */
export function assignedOf(
  assignments: readonly Assignment[],
  packet: Packet,
  isKnown: (component: string) => boolean,
): Map<string, string[]> {
  const holes = new Set(packet.features.map((feature) => feature.specId));
  const additions = new Map<string, string[]>();
  for (const { feature, component } of assignments) {
    if (!holes.has(feature) || !isKnown(component)) continue;
    holes.delete(feature);
    additions.set(component, [...(additions.get(component) ?? []), feature]);
  }
  return additions;
}

/** Composants proposés dans la réponse, par identifiant, avec leurs dépendances. */
export const freshOf = (accepted: readonly Candidate[]): Map<string, Dependency[]> =>
  new Map(
    accepted.flatMap((c) => {
      const id = c.kind === "component" ? proposedComponentId(c.payload) : undefined;
      return id === undefined ? [] : [[id, dependenciesOf(c.payload.dependsOn)] as const];
    }),
  );

/** Ajoute `values` à la liste de `key`, sans doublon. */
export function pushTo<T>(map: Map<string, T[]>, key: string, ...values: T[]): void {
  const list = map.get(key) ?? [];
  for (const value of values) if (!list.includes(value)) list.push(value);
  map.set(key, list);
}

/** Proposition de la même réponse complétée de ses ajouts, qui sont alors retirés (B616, B636, B653). */
export function withAdditions(candidate: Candidate, additions: Additions): Candidate {
  const id = candidate.kind === "component" ? proposedComponentId(candidate.payload) : undefined;
  if (id === undefined) return candidate;
  const serves = additions.serves.get(id);
  const deps = additions.dependsOn.get(id);
  const actors = additions.actors.get(id);
  additions.serves.delete(id);
  additions.dependsOn.delete(id);
  additions.actors.delete(id);
  const payload = { ...candidate.payload };
  if (serves !== undefined) payload.serves = unionOf(stringsOf(payload.serves), serves);
  if (deps !== undefined)
    payload.dependsOn = dependencyUnion(dependenciesOf(payload.dependsOn), deps);
  if (actors !== undefined) payload.actors = unionOf(stringsOf(payload.actors), actors, ACTORS_MAX);
  return { ...candidate, payload };
}

/** Index et lancement lus par `targetAdditions`. */
export interface TargetContext {
  readonly targetFor: (id: string) => ReturnType<typeof targetOf>;
  /** Dépendances actuelles par composant : le complément d'une proposition `specId` en part (B644). */
  readonly dependencies: ReadonlyMap<string, readonly Dependency[]>;
  /** Rôles actuels par composant : même règle pour `actors`. */
  readonly actors: ReadonlyMap<string, readonly string[]>;
}

/** Ajouts d'une cible, chaque liste vide si rien n'est ajouté. */
const additionsFor = (additions: Additions, id: string) => ({
  serves: additions.serves.get(id) ?? [],
  dependsOn: additions.dependsOn.get(id) ?? [],
  actors: additions.actors.get(id) ?? [],
});

/** Complément d'une proposition en attente : dépendances et rôles réunis avec les actuels (B644). */
function complementOf(
  proposalId: string,
  id: string,
  added: ReturnType<typeof additionsFor>,
  context: TargetContext,
): Complement {
  const { serves, dependsOn, actors } = added;
  const deps = context.dependencies.get(id) ?? [];
  const roles = context.actors.get(id) ?? [];
  return {
    id: proposalId,
    owns: [],
    serves,
    dependsOn: dependsOn.length > 0 ? dependencyUnion(deps, dependsOn) : [],
    actors: actors.length > 0 ? unionOf(roles, actors, ACTORS_MAX) : [],
  };
}

/**
 * Ajouts vers une cible déjà publiée ou indexée : un complément, ou UNE proposition `specId` qui réunit `serves`,
 * `dependsOn` et `actors` (B636). Une cible décidée entre-temps est ignorée (B621).
 */
export function targetAdditions(plan: Plan, additions: Additions, context: TargetContext): void {
  const ids = [
    ...additions.serves.keys(),
    ...additions.dependsOn.keys(),
    ...additions.actors.keys(),
  ];
  for (const id of new Set(ids)) {
    const added = additionsFor(additions, id);
    const target = context.targetFor(id);
    if (target?.kind === "pending") {
      plan.complements.push(complementOf(target.proposal.id, id, added, context));
    } else if (target?.kind === "indexed") {
      const update = updateProposalOf(target.component, added, ASSIGNMENT_RATIONALE);
      if (update !== undefined) plan.creations.push(update);
    }
  }
}
