import type { Component } from "../entities/index.ts";
import { compare } from "../issue.ts";

/** Ce que les avertissements lisent : des identifiants (cahier, tables, parcours, flux) et les composants entiers. */
export type ArchitectureInput = {
  features: readonly { value: { id: string } }[];
  tables: readonly { value: { id: string } }[];
  flows: readonly { value: { id: string } }[];
  components: readonly { value: Component }[];
  archFlows: readonly { value: { id: string } }[];
};

export type ArchitectureWarningCode =
  | "ARCH_TABLE_UNOWNED"
  | "ARCH_TABLE_MULTI_OWNER"
  | "ARCH_EXT_OWNS_TABLE"
  | "ARCH_FEATURE_UNSERVED"
  | "ARCH_FLOW_MISSING"
  | "ARCH_SYNC_CYCLE";

/** Avertissement d'architecture : jamais bloquant, `entityId` désigne la table, le composant, la fonctionnalité ou le parcours. */
export type ArchitectureWarning = {
  code: ArchitectureWarningCode;
  entityId: string;
  message: string;
};

type Warn = (code: ArchitectureWarningCode, entityId: string, message: string) => void;

/** Dépendance d'un composant telle que le graphe la lit : `mode: asynchrone` n'est pas une arête synchrone. */
type GraphDependency = { vers: string; mode?: string };
type GraphComponent = { id: string; depend_de?: readonly GraphDependency[] };

/** Ce que la couverture lit (TK-114b, B616 ; TK-114c, B633) : des identifiants, et des composants réduits à leurs liens. */
export type ArchitectureCoverageInput = {
  features: readonly { value: { id: string } }[];
  tables: readonly { value: { id: string } }[];
  flows: readonly { value: { id: string } }[];
  components: readonly {
    value: GraphComponent & {
      possede: readonly string[];
      sert: readonly string[];
      type?: string;
    };
  }[];
  archFlows: readonly { value: { id: string } }[];
};

export type CoverageCount = { covered: number; total: number };

/** Trous de l'architecture, dans l'ordre de l'entrée, et compteurs couverts / total. */
export type ArchitectureCoverage = {
  unservedFeatures: string[];
  missingFlows: string[];
  unownedTables: string[];
  /** Composants non externes sans lien vers ni depuis un autre composant connu (B633). */
  isolatedComponents: string[];
  counts: {
    features: CoverageCount;
    flows: CoverageCount;
    tables: CoverageCount;
    links: CoverageCount;
  };
};

/** Propriétaires de chaque table, dans l'ordre des composants. */
function ownersOf(spec: ArchitectureCoverageInput): Map<string, string[]> {
  const owners = new Map<string, string[]>();
  for (const { value } of spec.components) {
    for (const table of value.possede) owners.set(table, [...(owners.get(table) ?? []), value.id]);
  }
  return owners;
}

const idsOf = (items: readonly { value: { id: string } }[]) => items.map(({ value }) => value.id);

const countOf = (all: readonly unknown[], holes: readonly unknown[]): CoverageCount => ({
  covered: all.length - holes.length,
  total: all.length,
});

/** Composants reliés à un autre composant connu, dans un sens ou dans l'autre (soi-même exclu). */
function linkedOf(components: readonly { value: GraphComponent }[]): Set<string> {
  const known = new Set(components.map(({ value }) => value.id));
  const linked = new Set<string>();
  for (const { value } of components) {
    for (const { vers } of value.depend_de ?? []) {
      if (vers === value.id || !known.has(vers)) continue;
      linked.add(value.id);
      linked.add(vers);
    }
  }
  return linked;
}

/**
 * Couverture de l'architecture (TK-114b, B616) : fonctionnalités servies par aucun composant, parcours sans flux technique,
 * tables sans propriétaire, composants isolés (TK-114c, B633). Pure ; partagée par `architectureChecks` (avertissements) et la passe de couverture du worker.
 */
export function architectureCoverage(spec: ArchitectureCoverageInput): ArchitectureCoverage {
  const served = new Set(spec.components.flatMap(({ value }) => value.sert));
  const detailed = new Set(idsOf(spec.archFlows));
  const owners = ownersOf(spec);
  const unservedFeatures = idsOf(spec.features).filter((id) => !served.has(id));
  const missingFlows = idsOf(spec.flows).filter((id) => !detailed.has(id));
  const unownedTables = idsOf(spec.tables).filter((id) => (owners.get(id) ?? []).length === 0);
  const linked = linkedOf(spec.components);
  const internal = spec.components.filter(({ value }) => value.type !== "ext");
  const isolatedComponents = idsOf(internal).filter((id) => !linked.has(id));
  return {
    unservedFeatures,
    missingFlows,
    unownedTables,
    isolatedComponents,
    counts: {
      features: countOf(spec.features, unservedFeatures),
      flows: countOf(spec.flows, missingFlows),
      tables: countOf(spec.tables, unownedTables),
      links: countOf(internal, isolatedComponents),
    },
  };
}

function checkTables(spec: ArchitectureInput, warn: Warn): void {
  const owners = ownersOf(spec);
  for (const id of architectureCoverage(spec).unownedTables) {
    warn("ARCH_TABLE_UNOWNED", id, `La table ${id} n'a aucun composant propriétaire.`);
  }
  for (const { value: table } of spec.tables) {
    const own = owners.get(table.id) ?? [];
    if (own.length > 1) {
      warn(
        "ARCH_TABLE_MULTI_OWNER",
        table.id,
        `La table ${table.id} est possédée par plusieurs composants : ${own.join(", ")}.`,
      );
    }
  }
  for (const { value } of spec.components) {
    if (value.type === "ext" && value.possede.length > 0) {
      warn(
        "ARCH_EXT_OWNS_TABLE",
        value.id,
        `Le composant externe ${value.id} possède des tables : ${value.possede.join(", ")}.`,
      );
    }
  }
}

function checkCoverage(spec: ArchitectureInput, warn: Warn): void {
  const coverage = architectureCoverage(spec);
  for (const id of coverage.unservedFeatures) {
    warn("ARCH_FEATURE_UNSERVED", id, `La fonctionnalité ${id} n'est servie par aucun composant.`);
  }
  for (const id of coverage.missingFlows) {
    warn("ARCH_FLOW_MISSING", id, `Le parcours ${id} n'a pas de flux technique.`);
  }
}

/** Dépendances synchrones entre composants connus : `mode: asynchrone` n'est pas une arête. */
export function synchronousGraph(components: readonly GraphComponent[]): Map<string, string[]> {
  const known = new Set(components.map((component) => component.id));
  return new Map(
    components.map((component) => [
      component.id,
      (component.depend_de ?? [])
        .filter((dep) => dep.mode !== "asynchrone" && known.has(dep.vers))
        .map((dep) => dep.vers),
    ]),
  );
}

/** Nœuds atteignables par au moins une arête depuis `from` (lui-même seulement s'il est sur un cycle). */
function reachableFrom(graph: ReadonlyMap<string, readonly string[]>, from: string): Set<string> {
  const reached = new Set<string>();
  const pending = [...(graph.get(from) ?? [])];
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    if (reached.has(id)) continue;
    reached.add(id);
    pending.push(...(graph.get(id) ?? []));
  }
  return reached;
}

/**
 * Vrai si une dépendance synchrone `from` → `to` fermerait un cycle synchrone (TK-114c, B635) : `to` atteint déjà `from`,
 * ou `from` = `to`. Même graphe que `ARCH_SYNC_CYCLE`.
 */
export function closesSyncCycle(
  graph: ReadonlyMap<string, readonly string[]>,
  from: string,
  to: string,
): boolean {
  return from === to || reachableFrom(graph, to).has(from);
}

/** Groupes de composants qui s'atteignent mutuellement (ou un composant qui dépend de lui-même), ids triés. */
function cycles(graph: ReadonlyMap<string, readonly string[]>): string[][] {
  const ids = [...graph.keys()].sort(compare);
  const reach = new Map(ids.map((id) => [id, reachableFrom(graph, id)]));
  const seen = new Set<string>();
  const found: string[][] = [];
  for (const id of ids) {
    if (seen.has(id) || !reach.get(id)?.has(id)) continue;
    const members = ids.filter(
      (other) => other === id || (reach.get(id)?.has(other) && reach.get(other)?.has(id)),
    );
    for (const member of members) seen.add(member);
    found.push(members);
  }
  return found;
}

function checkCycles(spec: ArchitectureInput, warn: Warn): void {
  const components = spec.components.map(({ value }) => value);
  for (const members of cycles(synchronousGraph(components))) {
    const [first] = members;
    if (first === undefined) continue;
    warn(
      "ARCH_SYNC_CYCLE",
      first,
      `Dépendances synchrones circulaires entre ${members.join(", ")} : une panne se propage en boucle.`,
    );
  }
}

/**
 * Avertissements d'architecture (TK-111, B506) : table sans propriétaire ou à deux propriétaires, composant externe qui
 * possède une table, fonctionnalité non servie, parcours sans flux technique, cycle de dépendances synchrones (un cycle
 * asynchrone est permis). Pure, déterministe (triée par code puis identifiant), jamais bloquante : le lot s'enregistre.
 */
export function architectureChecks(spec: ArchitectureInput): ArchitectureWarning[] {
  const warnings: ArchitectureWarning[] = [];
  const warn: Warn = (code, entityId, message) => warnings.push({ code, entityId, message });
  checkTables(spec, warn);
  checkCoverage(spec, warn);
  checkCycles(spec, warn);
  return warnings.sort((a, b) => compare(a.code, b.code) || compare(a.entityId, b.entityId));
}
