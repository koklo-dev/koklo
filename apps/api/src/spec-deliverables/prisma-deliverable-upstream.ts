import type { SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import type { Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { UpstreamFacts } from "./deliverable-upstream.ts";

/** Livrables dont l'impact amont est calculé : les Données (B449) et l'Architecture (TK-113). */
export type UpstreamKey = "data" | "architecture";

const SOURCE = /^(F-\d{3,}|R-\d{3,}|T-[a-z0-9][a-z0-9-]*)$/;
/** Un livrable compte au plus quelques centaines d'éléments (le diagramme en borne 500) : lecture bornée. */
const MAX_ENTITIES = 1000;

type Citations = Map<string, { components: Set<string>; flows: Set<string> }>;
type Row = { specId: string; data: unknown };

const idsIn = (data: unknown, field: string, only?: RegExp): string[] => {
  const value = (data as Record<string, unknown> | null)?.[field];
  return Array.isArray(value)
    ? value.filter(
        (id): id is string => typeof id === "string" && SOURCE.test(id) && (only?.test(id) ?? true),
      )
    : [];
};

/** Données : les fonctionnalités et règles citées par `source` des tables. */
function dataCitations(tables: readonly Row[]): Citations {
  const cited: Citations = new Map();
  for (const row of tables) {
    for (const id of idsIn(row.data, "source", /^[FR]-/)) {
      if (!cited.has(id)) cited.set(id, { components: new Set(), flows: new Set() });
    }
  }
  return cited;
}

/** Architecture : F de `sert` et T de `possede` des composants, F de `fonctionnalites` et R de `regles` des flux. */
function architectureCitations(components: readonly Row[], flows: readonly Row[]): Citations {
  const cited: Citations = new Map();
  const add = (id: string, side: "components" | "flows", by: string) => {
    const entry = cited.get(id) ?? { components: new Set<string>(), flows: new Set<string>() };
    entry[side].add(by);
    cited.set(id, entry);
  };
  for (const { specId, data } of components) {
    for (const id of [...idsIn(data, "sert", /^F-/), ...idsIn(data, "possede", /^T-/)]) {
      add(id, "components", specId);
    }
  }
  for (const { specId, data } of flows) {
    for (const id of [...idsIn(data, "fonctionnalites", /^F-/), ...idsIn(data, "regles", /^R-/)]) {
      add(id, "flows", specId);
    }
  }
  return cited;
}

async function citationsAt(tx: Tx, snapshotId: string, key: UpstreamKey): Promise<Citations> {
  const read = (kind: string): Promise<Row[]> =>
    tx.specEntity.findMany({
      where: { snapshotId, kind },
      select: { specId: true, data: true },
      take: MAX_ENTITIES,
    });
  if (key === "data") return dataCitations(await read("table"));
  return architectureCitations(await read("component"), await read("archflow"));
}

async function hashesAt(tx: Tx, snapshotId: string, ids: readonly string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const rows = await tx.specEntity.findMany({
    where: { snapshotId, kind: { in: ["feature", "rule", "table"] }, specId: { in: [...ids] } },
    select: { specId: true, contentHash: true },
    take: ids.length * 3,
  });
  return new Map(rows.map((row) => [row.specId, row.contentHash]));
}

async function tableIdsAt(tx: Tx, snapshotId: string): Promise<Set<string>> {
  const rows = await tx.specEntity.findMany({
    where: { snapshotId, kind: "table" },
    select: { specId: true },
    take: MAX_ENTITIES,
  });
  return new Set(rows.map((row) => row.specId));
}

/** Qui cite chaque amont : la tête courante, plus la tête de la décision (une table retirée n'est plus citée à la tête). */
function citedByOf(...all: Citations[]): NonNullable<UpstreamFacts["citedBy"]> {
  const merged = new Map<string, { components: string[]; flows: string[] }>();
  for (const citations of all) {
    for (const [id, by] of citations) {
      const entry = merged.get(id) ?? { components: [], flows: [] };
      entry.components.push(...by.components);
      entry.flows.push(...by.flows);
      merged.set(id, entry);
    }
  }
  return merged;
}

/**
 * Faits de l'impact amont (B449, TK-113) : sources citées par les éléments de la tête, hachages de ces amonts à la tête de
 * la dernière décision et à la tête courante, et pour l'Architecture les tables des deux têtes. `null` : jamais décidé, rien
 * d'indexé, ou (Données) aucune source citée ; la tête de la décision hors index donne `atDecision` nul (aucun impact,
 * jamais de faux « À revoir »).
 */
export async function readUpstreamFacts(
  tx: Tx,
  resolver: SpecHeadResolver,
  scope: ProjectScope,
  key: UpstreamKey = "data",
): Promise<UpstreamFacts | null> {
  const decision = await tx.review.findFirst({
    where: { projectId: scope.projectId, targetKind: "deliverable", targetRef: key },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { sha: true },
  });
  if (!decision) return null;
  const head = await resolver.resolve(tx, scope, {});
  if (!head || head.snapshot.status === "failed") return null;
  const atHeadCited = await citationsAt(tx, head.snapshot.id, key);
  const sources = [...atHeadCited.keys()];
  if (key === "data" && sources.length === 0) return null;
  const decided = await resolver.resolve(tx, scope, { commitSha: decision.sha });
  const indexed = decided !== null && decided.snapshot.status !== "failed";
  const base: UpstreamFacts = {
    sources,
    atDecision: indexed ? await hashesAt(tx, decided.snapshot.id, sources) : null,
    atHead: await hashesAt(tx, head.snapshot.id, sources),
  };
  if (key === "data") return base;
  const atDecisionCited = indexed ? await citationsAt(tx, decided.snapshot.id, key) : new Map();
  return {
    ...base,
    tables: {
      atDecision: indexed ? await tableIdsAt(tx, decided.snapshot.id) : null,
      atHead: await tableIdsAt(tx, head.snapshot.id),
    },
    citedBy: citedByOf(atHeadCited, atDecisionCited),
  };
}
