import { type TenantClient, withOrganization } from "@koklo/db";
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
    select: { tag: true, pagesVersions: true },
  });
}

/** Pages dont la version diffère de celle du lancement terminé précédent (mode `update`) ; `undefined` : aucune base. */
async function changedSinceLastLaunch(
  client: TenantClient,
  launch: LaunchContext,
  current: Record<string, number>,
): Promise<Set<string> | undefined> {
  const previous = await client.agentLaunch.findFirst({
    where: {
      projectId: launch.projectId,
      deliverable: launch.deliverable,
      status: "done",
      baseVersion: { not: null },
      id: { not: launch.id },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { baseVersion: true },
  });
  if (previous?.baseVersion == null) return undefined;
  const before = await client.ideaVersion.findFirst({
    where: { projectId: launch.projectId, number: previous.baseVersion },
    select: { pagesVersions: true },
  });
  if (!before) return undefined;
  const old = versionsOf(before.pagesVersions);
  return new Set(
    Object.entries(current)
      .filter(([slug, v]) => old[slug] !== v)
      .map(([s]) => s),
  );
}

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

/** Lit les sources du lancement ; `null` sans version figée (le lancement échoue, rien n'est envoyé). */
export function readSources(
  client: TenantClient,
  launch: LaunchContext,
): Promise<LaunchSources | null> {
  return withOrganization(launch.organizationId, async () => {
    const version = await frozenVersion(client, launch);
    if (!version) return null;
    const frozen = versionsOf(version.pagesVersions);
    const changed =
      launch.mode === "update" ? await changedSinceLastLaunch(client, launch, frozen) : undefined;
    const rows = await client.ideaPage.findMany({
      where: { projectId: launch.projectId, deletedAt: null, slug: { in: Object.keys(frozen) } },
      orderBy: { position: "asc" },
      select: { slug: true, title: true, contentMd: true, version: true },
    });
    // Une page modifiée depuis le gel (version différente) est exclue : jamais le contenu non figé.
    const pages = rows
      .filter((row) => row.version === frozen[row.slug])
      .map((row) => ({ slug: row.slug, title: row.title, content: row.contentMd }));
    const synthesis = await client.ideaSynthesis.findFirst({
      where: { projectId: launch.projectId },
      select: { contentMd: true, source: true },
    });
    return {
      tag: version.tag,
      pages: pages.filter(
        (page) => page.slug !== RISKS_SLUG && (changed === undefined || changed.has(page.slug)),
      ),
      synthesis: synthesis?.source ? synthesis.contentMd : null,
      risks: pages.find((page) => page.slug === RISKS_SLUG)?.content ?? null,
      features: await currentFeatures(client, launch.projectId),
    };
  });
}
