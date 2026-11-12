import { type TenantClient, withOrganization } from "@koklo/db";
import { ideaPagesDiff } from "@koklo/domain";
import { isRecord } from "../job-support.ts";
import type { LaunchContext } from "./store.ts";

/** Page du dossier au moment du gel : jamais un contenu modifié depuis. */
export interface FrozenPage {
  readonly slug: string;
  readonly title: string;
  readonly content: string;
}

export interface CurrentFeature {
  readonly specId: string;
  readonly title: string;
  readonly criteria: readonly string[];
}

/**
 * Ce que l'agent lit pour le Fonctionnel, et rien d'autre (« L'agent lit », `AGENT_READS.functional`) :
 * pages figées, synthèse publiée, page des risques figée, cahier actuel. Ni commentaires, ni membres, ni autres
 * projets, ni brouillons.
 */
export interface LaunchSources {
  readonly tag: string;
  /** Mode `update` : la version précédente et les pages retirées ; `pages` ne porte alors que les pages ajoutées ou modifiées. */
  readonly diff?: { readonly from: string; readonly removed: readonly string[] };
  readonly pages: readonly FrozenPage[];
  readonly synthesis: string | null;
  readonly risks: string | null;
  readonly features: readonly CurrentFeature[];
}

/** Page dont le contenu est lu comme « hypothèses et risques » (source `idea.risks`), exclue des pages générales. */
export const RISKS_SLUG = "hypotheses-risques";
const WORKING_BRANCH = "cadrage";
const FEATURES_MAX = 300;

const versionsOf = (value: unknown): Record<string, number> => {
  const versions: Record<string, number> = {};
  if (!isRecord(value)) return versions;
  for (const [slug, version] of Object.entries(value)) {
    if (typeof version === "number") versions[slug] = version;
  }
  return versions;
};

/** Version figée lue : celle du lancement (`baseVersion`), sinon la dernière dont le commit est réglé. */
async function frozenVersion(client: TenantClient, launch: LaunchContext) {
  return client.ideaVersion.findFirst({
    where: {
      projectId: launch.projectId,
      commitSha: { not: null },
      ...(launch.baseVersion === null ? {} : { number: launch.baseVersion }),
    },
    orderBy: { number: "desc" },
    select: { number: true, tag: true, pagesVersions: true },
  });
}

/** Version figée qui précède celle du lancement (mode `update`) ; `null` sans version précédente. */
const previousVersion = (client: TenantClient, launch: LaunchContext, number: number) =>
  client.ideaVersion.findFirst({
    where: { projectId: launch.projectId, commitSha: { not: null }, number: { lt: number } },
    orderBy: { number: "desc" },
    select: { tag: true, pagesVersions: true },
  });

async function currentFeatures(client: TenantClient, projectId: string): Promise<CurrentFeature[]> {
  const repo = await client.projectRepo.findFirst({
    where: { projectId, OR: [{ role: "spec" }, { specPath: { not: null } }] },
    select: { id: true, defaultBranch: true },
  });
  if (!repo) return [];
  for (const branch of [WORKING_BRANCH, repo.defaultBranch]) {
    const head = await client.specHead.findFirst({
      where: { repoId: repo.id, branch },
      include: { snapshot: { select: { id: true, status: true } } },
    });
    if (!head) continue;
    if (head.snapshot.status === "failed") return [];
    const rows = await client.specFeature.findMany({
      where: { snapshotId: head.snapshot.id },
      orderBy: [{ specNumber: "asc" }, { id: "asc" }],
      take: FEATURES_MAX,
      select: {
        specId: true,
        title: true,
        criteria: { orderBy: { position: "asc" }, select: { title: true } },
      },
    });
    return rows.map((row) => ({
      specId: row.specId,
      title: row.title,
      criteria: row.criteria.map((criterion) => criterion.title),
    }));
  }
  return [];
}

/** Diff `idea-vN-1` vers `idea-vN` du mode `update` ; `null` sans version précédente, `undefined` hors mode `update`. */
async function updateDiff(
  client: TenantClient,
  launch: LaunchContext,
  version: { number: number; pagesVersions: unknown },
) {
  if (launch.mode !== "update") return undefined;
  const previous = await previousVersion(client, launch, version.number);
  if (!previous) return null;
  const diff = ideaPagesDiff(versionsOf(previous.pagesVersions), versionsOf(version.pagesVersions));
  return { ...diff, from: previous.tag };
}

async function publishedSynthesis(client: TenantClient, projectId: string) {
  const synthesis = await client.ideaSynthesis.findFirst({
    where: { projectId },
    select: { contentMd: true, source: true },
  });
  return synthesis?.source ? synthesis.contentMd : null;
}

/** Lit les sources du lancement ; `null` sans version figée (le lancement échoue, rien n'est envoyé). */
export function readSources(
  client: TenantClient,
  launch: LaunchContext,
): Promise<LaunchSources | null> {
  return withOrganization(launch.organizationId, async () => {
    const version = await frozenVersion(client, launch);
    if (!version) return null;
    const frozen = versionsOf(version.pagesVersions);
    // Mode `update` : le diff seul ; sans version précédente, il n'y a rien à mettre à jour.
    const diff = await updateDiff(client, launch, version);
    if (diff === null) return null;
    const changed = diff && new Set([...diff.added, ...diff.modified]);
    const rows = await client.ideaPage.findMany({
      where: { projectId: launch.projectId, deletedAt: null, slug: { in: Object.keys(frozen) } },
      orderBy: { position: "asc" },
      select: { slug: true, title: true, contentMd: true, version: true },
    });
    // Une page modifiée depuis le gel (version différente) est exclue : jamais le contenu non figé.
    const pages = rows
      .filter((row) => row.version === frozen[row.slug] && (!changed || changed.has(row.slug)))
      .map((row) => ({ slug: row.slug, title: row.title, content: row.contentMd }));
    return {
      tag: version.tag,
      ...(diff ? { diff: { from: diff.from, removed: diff.removed } } : {}),
      pages: pages.filter((page) => page.slug !== RISKS_SLUG),
      synthesis: diff ? null : await publishedSynthesis(client, launch.projectId),
      risks: pages.find((page) => page.slug === RISKS_SLUG)?.content ?? null,
      features: await currentFeatures(client, launch.projectId),
    };
  });
}
