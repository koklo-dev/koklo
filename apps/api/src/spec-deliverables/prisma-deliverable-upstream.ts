import { createHash } from "node:crypto";
import { modelFields } from "@koklo/schema";
import type { SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import { OPERATIONS_ONLY } from "../spec-technical/operation-where.ts";
import type { Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type {
  SecurityUpstreamFacts,
  TechnicalUpstreamFacts,
  UpstreamEntity,
  UpstreamFacts,
} from "./deliverable-upstream.ts";

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

/** Dernière décision sur le livrable, et la tête courante lisible ; `null` : jamais décidé ou rien d'indexé. */
async function decidedHeads(tx: Tx, resolver: SpecHeadResolver, scope: ProjectScope, key: string) {
  const decision = await tx.review.findFirst({
    where: { projectId: scope.projectId, targetKind: "deliverable", targetRef: key },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { sha: true },
  });
  if (!decision) return null;
  const head = await resolver.resolve(tx, scope, {});
  if (!head || head.snapshot.status === "failed") return null;
  const decided = await resolver.resolve(tx, scope, { commitSha: decision.sha });
  const indexed = decided !== null && decided.snapshot.status !== "failed";
  return { headId: head.snapshot.id, decidedId: indexed ? decided.snapshot.id : null };
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
  const heads = await decidedHeads(tx, resolver, scope, key);
  if (heads === null) return null;
  const { headId, decidedId } = heads;
  const atHeadCited = await citationsAt(tx, headId, key);
  const sources = [...atHeadCited.keys()];
  if (key === "data" && sources.length === 0) return null;
  const base: UpstreamFacts = {
    sources,
    atDecision: decidedId === null ? null : await hashesAt(tx, decidedId, sources),
    atHead: await hashesAt(tx, headId, sources),
  };
  if (key === "data") return base;
  const atDecisionCited = decidedId === null ? new Map() : await citationsAt(tx, decidedId, key);
  return {
    ...base,
    tables: {
      atDecision: decidedId === null ? null : await tableIdsAt(tx, decidedId),
      atHead: await tableIdsAt(tx, headId),
    },
    citedBy: citedByOf(atHeadCited, atDecisionCited),
  };
}

/** Composants et décisions d'un instantané, avec leur hachage. */
async function architectureAt(tx: Tx, snapshotId: string) {
  const rows = await tx.specEntity.findMany({
    where: { snapshotId, kind: { in: ["component", "adr"] } },
    select: { specId: true, data: true, contentHash: true },
    take: MAX_ENTITIES,
  });
  return new Map<string, UpstreamEntity>(
    rows.map((row) => [
      row.specId,
      {
        hash: row.contentHash,
        accepted: (row.data as { statut?: unknown } | null)?.statut === "acceptee",
      },
    ]),
  );
}

/** Champs des fichiers techniques qui citent un composant ou une décision. */
const CITING_FIELDS = ["composants", "decisions", "liens"] as const;
const CITED = /^(C-[a-z0-9][a-z0-9-]*|ADR-\d{3,})$/;

function citedIn(data: unknown): string[] {
  const record = (data ?? {}) as Record<string, unknown>;
  const listed = CITING_FIELDS.flatMap((field) => {
    const value = record[field];
    return Array.isArray(value) ? value : [];
  });
  return [...listed, record.composant].filter(
    (id): id is string => typeof id === "string" && CITED.test(id),
  );
}

/** Faits de l'impact de l'architecture sur le cahier technique (TK-115, B735). */
export async function readTechnicalUpstreamFacts(
  tx: Tx,
  resolver: SpecHeadResolver,
  scope: ProjectScope,
): Promise<TechnicalUpstreamFacts | null> {
  const heads = await decidedHeads(tx, resolver, scope, "technical");
  if (heads === null) return null;
  const { headId, decidedId } = heads;
  const citing = await tx.specEntity.findMany({
    where: { snapshotId: headId, kind: { in: ["stack", "endpoint", "nfr"] } },
    select: { specId: true, data: true },
    take: MAX_ENTITIES,
  });
  return {
    atDecision: decidedId === null ? null : await architectureAt(tx, decidedId),
    atHead: await architectureAt(tx, headId),
    citing: citing.map((row) => ({ id: row.specId, cites: citedIn(row.data) })),
  };
}

const roleHash = (role: unknown): string =>
  createHash("sha256").update(JSON.stringify(role)).digest("hex");

/** Choix, opérations, tables (et leurs champs) et rôles d'un instantané. */
async function securityUpstreamAt(tx: Tx, snapshotId: string) {
  const rows = await tx.specEntity.findMany({
    where: {
      snapshotId,
      OR: [
        { kind: { in: ["stack", "table", "roles"] } },
        { kind: "endpoint", AND: OPERATIONS_ONLY },
      ],
    },
    select: { kind: true, specId: true, data: true, contentHash: true },
    take: MAX_ENTITIES * 4,
  });
  const hashes = new Map<string, string>();
  const tables: { id: string; champs: { nom: string }[] }[] = [];
  for (const row of rows) {
    const data = (row.data ?? {}) as { champs?: { nom: string }[]; roles?: { id: string }[] };
    if (row.kind === "table") tables.push({ id: row.specId, champs: data.champs ?? [] });
    if (row.kind === "roles") {
      for (const role of data.roles ?? []) hashes.set(role.id, roleHash(role));
    } else hashes.set(row.specId, row.contentHash);
  }
  return { hashes, fields: new Set(modelFields(tables)) };
}

async function threatLinksAt(tx: Tx, snapshotId: string) {
  const rows = await tx.specEntity.findMany({
    where: { snapshotId, kind: "threat" },
    select: { specId: true, data: true },
    take: MAX_ENTITIES,
  });
  return rows.map((row) => {
    const links = (row.data as { liens?: string[] } | null)?.liens;
    return { id: row.specId, links: links ?? [] };
  });
}

/** Faits de l'impact amont sur la Sécurité (TK-117, B805). */
export async function readSecurityUpstreamFacts(
  tx: Tx,
  resolver: SpecHeadResolver,
  scope: ProjectScope,
): Promise<SecurityUpstreamFacts | null> {
  const heads = await decidedHeads(tx, resolver, scope, "security");
  if (heads === null || heads.decidedId === null) return null;
  const before = await securityUpstreamAt(tx, heads.decidedId);
  const after = await securityUpstreamAt(tx, heads.headId);
  return {
    atDecision: before.hashes,
    atHead: after.hashes,
    fields: { atDecision: before.fields, atHead: after.fields },
    threats: await threatLinksAt(tx, heads.headId),
  };
}
