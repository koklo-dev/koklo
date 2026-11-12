import { readStatusFacts } from "../review/status-facts.ts";
import { type EntityHash, targetHashOf } from "../review/target-hash.ts";
import { VERDICT_SELECT, verdictOf } from "../review/verdicts.ts";
import { entitySource, entityWhere } from "../spec-read/entity-list.ts";
import type { Snapshot } from "../spec-read/spec-head-resolver.ts";
import { type ListWindow, loadWindow } from "../tracker/long-list.ts";
import type { Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type {
  EntityListRequest,
  EntityRow,
  FlowsRead,
  ProgressFacts,
  RolesRead,
  RulesRead,
} from "./client-space.repository.ts";
import type { LabelRows, LinkSources } from "./client-space-entities.ts";
import type { ReviewVerdict } from "./validation.ts";

/**
 * Lectures d'entités de l'espace client (B347) : parcours, règles, rôles et progression, dans l'index générique
 * `spec_entities` de la tête. Lecture seule, sous la transaction du périmètre ; la validation se juge sur le hachage du
 * contenu courant (`verdictOf`).
 */
const entityRowOf = ({ specId, path, data }: EntityRow): EntityRow => ({ specId, path, data });

async function window(
  tx: Tx,
  snapshot: Snapshot,
  kind: "rule" | "flow",
  request: EntityListRequest,
): Promise<ListWindow<EntityRow>> {
  const source = entitySource(tx, snapshot.id, kind, entityWhere(snapshot.id, kind, null));
  const page = await loadWindow(source, {
    limit: request.limit,
    ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
  });
  return { ...page, rows: page.rows.map(entityRowOf) };
}

/** Dernier verdict de chaque cible `kind` citée, jugé sur le hachage courant de son entité. */
async function verdictsOf(
  tx: Tx,
  scope: ProjectScope,
  snapshotId: string,
  kind: "flow",
  refs: readonly string[],
): Promise<Map<string, ReviewVerdict | undefined>> {
  const [hashes, reviews] = await Promise.all([
    tx.specEntity.findMany({
      where: { snapshotId, kind, specId: { in: [...refs] } },
      select: { specId: true, contentHash: true },
    }),
    tx.review.findMany({
      where: { projectId: scope.projectId, targetKind: kind, targetRef: { in: [...refs] } },
      select: VERDICT_SELECT,
    }),
  ]);
  const hashOf = new Map(hashes.map((row) => [row.specId, row.contentHash]));
  return new Map(
    refs.map((ref) => [
      ref,
      verdictOf(
        reviews.filter((review) => review.targetRef === ref),
        hashOf.get(ref) ?? null,
      ),
    ]),
  );
}

/** Verdict du bloc `rules` ou `roles` entier : hachage combiné de ses entités. */
async function blockVerdict(
  tx: Tx,
  scope: ProjectScope,
  snapshotId: string,
  block: "rules" | "roles",
): Promise<ReviewVerdict | undefined> {
  const kind = block === "rules" ? "rule" : "roles";
  const [entities, reviews] = await Promise.all([
    tx.specEntity.findMany({
      where: { snapshotId, kind },
      select: { kind: true, specId: true, contentHash: true },
    }),
    tx.review.findMany({
      where: { projectId: scope.projectId, targetKind: block, targetRef: block },
      select: VERDICT_SELECT,
    }),
  ]);
  const hashes: EntityHash[] = entities.map((e) => ({
    kind: e.kind,
    specId: e.specId,
    hash: e.contentHash,
  }));
  return verdictOf(reviews, targetHashOf(hashes, block, block));
}

export async function readFlows(
  tx: Tx,
  scope: ProjectScope,
  snapshot: Snapshot,
  request: EntityListRequest,
): Promise<FlowsRead> {
  const page = await window(tx, snapshot, "flow", request);
  const verdicts = await verdictsOf(
    tx,
    scope,
    snapshot.id,
    "flow",
    page.rows.map((row) => row.specId),
  );
  return { headSha: snapshot.commitSha, window: page, verdicts };
}

export async function readRules(
  tx: Tx,
  scope: ProjectScope,
  snapshot: Snapshot,
  request: EntityListRequest,
): Promise<RulesRead> {
  const page = await window(tx, snapshot, "rule", request);
  const block = await blockVerdict(tx, scope, snapshot.id, "rules");
  return { headSha: snapshot.commitSha, window: page, block };
}

export async function readRoles(
  tx: Tx,
  scope: ProjectScope,
  snapshot: Snapshot,
): Promise<RolesRead> {
  const file = await tx.specEntity.findFirst({
    where: { snapshotId: snapshot.id, kind: "roles", specId: "roles" },
    select: { data: true },
  });
  const block = await blockVerdict(tx, scope, snapshot.id, "roles");
  return { headSha: snapshot.commitSha, file: file?.data ?? null, block };
}

const firstName = (name: string): string | null => name.trim().split(/\s+/)[0] || null;

export async function readProgress(
  tx: Tx,
  scope: ProjectScope,
  snapshot: Snapshot,
): Promise<ProgressFacts> {
  const facts = await readStatusFacts(tx, scope, snapshot);
  const roles = await tx.specEntity.findFirst({
    where: { snapshotId: snapshot.id, kind: "roles", specId: "roles" },
    select: { data: true },
  });
  const links = await tx.projectClientAccess.findMany({
    where: { projectId: scope.projectId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { member: { select: { user: { select: { name: true } } } } },
  });
  const rolesData = roles?.data as { roles?: unknown } | null | undefined;
  return {
    facts,
    counts: {
      rules: facts.entities.filter((e) => e.kind === "rule").length,
      roles: Array.isArray(rolesData?.roles) ? rolesData.roles.length : 0,
    },
    hasClient: links.length > 0,
    clientFirstName: links[0] ? firstName(links[0].member.user.name) : null,
  };
}

/** Libellés des liens d'une fonctionnalité : une requête par famille, jamais une par lien. */
export async function readLinkLabels(
  tx: Tx,
  snapshot: Snapshot,
  featureId: string,
  source: LinkSources,
): Promise<LabelRows> {
  const byIds = async (kind: string, ids: readonly string[]) =>
    new Map(
      (ids.length === 0
        ? []
        : await tx.specEntity.findMany({
            where: { snapshotId: snapshot.id, kind, specId: { in: [...ids] } },
            select: { specId: true, data: true },
          })
      ).map((row) => [row.specId, row.data]),
    );
  const flows = await tx.specEntity.findMany({
    where: {
      snapshotId: snapshot.id,
      kind: "flow",
      data: { path: ["fonctionnalites"], array_contains: featureId },
    },
    orderBy: [{ sort: "asc" }, { id: "asc" }],
    select: { specId: true, data: true },
  });
  const rolesFile =
    source.roles.length === 0
      ? null
      : ((
          await tx.specEntity.findFirst({
            where: { snapshotId: snapshot.id, kind: "roles", specId: "roles" },
            select: { data: true },
          })
        )?.data ?? null);
  return {
    rules: await byIds("rule", source.rules),
    flows: new Map(flows.map((row) => [row.specId, row.data])),
    screens: await byIds("screen", source.screens),
    rolesFile,
  };
}
