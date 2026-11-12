import type { TenantClient } from "./client.ts";

/**
 * Ce que l'agent lit pour le Fonctionnel (« L'agent lit », `AGENT_READS.functional`) : pages du dossier figées, synthèse
 * publiée, page des risques figée, cahier actuel. Ni commentaires, ni membres, ni autres projets, ni brouillons. Lectures
 * partagées par le job `agent-propose` (worker) et par `ai.proposeFeatures` (API) : une seule définition des sources.
 */
export type DossierClient = Pick<
  TenantClient,
  | "ideaVersion"
  | "ideaPage"
  | "ideaSynthesis"
  | "projectRepo"
  | "specHead"
  | "specFeature"
  | "specEntity"
>;

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

/** Règle, rôle ou parcours du cahier actuel : l'identifiant et le titre (le nom pour un rôle), pour éviter les doublons (TK-103). */
export interface CurrentTitle {
  readonly specId: string;
  readonly title: string;
}

export interface CurrentDomainTitles {
  readonly rules: readonly CurrentTitle[];
  readonly roles: readonly CurrentTitle[];
  readonly flows: readonly CurrentTitle[];
}

export interface DossierSources {
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

/** Versions des pages d'un gel : `{ slug: numéro }`, toute valeur qui n'est pas un nombre est ignorée. */
export const versionsOf = (value: unknown): Record<string, number> => {
  const versions: Record<string, number> = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) return versions;
  for (const [slug, version] of Object.entries(value)) {
    if (typeof version === "number") versions[slug] = version;
  }
  return versions;
};

/** Version figée lue : `baseVersion` s'il est donné, sinon la dernière dont le commit est réglé. */
export const frozenVersion = (
  client: DossierClient,
  projectId: string,
  baseVersion: number | null,
) =>
  client.ideaVersion.findFirst({
    where: {
      projectId,
      commitSha: { not: null },
      ...(baseVersion === null ? {} : { number: baseVersion }),
    },
    orderBy: { number: "desc" },
    select: { number: true, tag: true, pagesVersions: true },
  });

/** Version figée qui précède `number` ; `null` sans version précédente. */
export const previousVersion = (client: DossierClient, projectId: string, number: number) =>
  client.ideaVersion.findFirst({
    where: { projectId, commitSha: { not: null }, number: { lt: number } },
    orderBy: { number: "desc" },
    select: { tag: true, pagesVersions: true },
  });

/**
 * Pages figées : celles dont la version courante est celle du gel (une page modifiée depuis est exclue, jamais le contenu
 * non figé) ; `only` restreint aux pages citées (mode `update`).
 */
export async function frozenPages(
  client: DossierClient,
  projectId: string,
  frozen: Readonly<Record<string, number>>,
  only?: ReadonlySet<string>,
): Promise<FrozenPage[]> {
  const rows = await client.ideaPage.findMany({
    where: { projectId, deletedAt: null, slug: { in: Object.keys(frozen) } },
    orderBy: { position: "asc" },
    select: { slug: true, title: true, contentMd: true, version: true },
  });
  return rows
    .filter((row) => row.version === frozen[row.slug] && (!only || only.has(row.slug)))
    .map((row) => ({ slug: row.slug, title: row.title, content: row.contentMd }));
}

export async function publishedSynthesis(
  client: DossierClient,
  projectId: string,
): Promise<string | null> {
  const synthesis = await client.ideaSynthesis.findFirst({
    where: { projectId },
    select: { contentMd: true, source: true },
  });
  return synthesis?.source ? synthesis.contentMd : null;
}

/** Instantané de la tête de spec (branche de cadrage, sinon branche par défaut) ; `null` s'il n'y en a pas ou s'il a échoué. */
async function headSnapshotId(client: DossierClient, projectId: string): Promise<string | null> {
  const repo = await client.projectRepo.findFirst({
    where: { projectId, OR: [{ role: "spec" }, { specPath: { not: null } }] },
    select: { id: true, defaultBranch: true },
  });
  if (!repo) return null;
  for (const branch of [WORKING_BRANCH, repo.defaultBranch]) {
    const head = await client.specHead.findFirst({
      where: { repoId: repo.id, branch },
      include: { snapshot: { select: { id: true, status: true } } },
    });
    if (!head) continue;
    return head.snapshot.status === "failed" ? null : head.snapshot.id;
  }
  return null;
}

/** Cahier actuel : les 300 premières fonctionnalités de la tête de spec (branche de cadrage, sinon branche par défaut). */
export async function currentFeatures(
  client: DossierClient,
  projectId: string,
): Promise<CurrentFeature[]> {
  const snapshotId = await headSnapshotId(client, projectId);
  if (snapshotId === null) return [];
  const rows = await client.specFeature.findMany({
    where: { snapshotId },
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

const DOMAIN_TITLES_MAX = 300;

const textOf = (value: unknown): string => (typeof value === "string" ? value : "");
const recordOf = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Rôles d'un fichier `roles` de l'index : `{ id, nom }` par rôle. */
const rolesOf = (data: unknown): CurrentTitle[] => {
  const roles = recordOf(data).roles;
  return Array.isArray(roles)
    ? roles.map((role) => ({
        specId: textOf(recordOf(role).id),
        title: textOf(recordOf(role).nom),
      }))
    : [];
};

/** Règles, rôles et parcours de la tête de spec (index d'entités) : seuls les titres, jamais le contenu (TK-103, B342). */
export async function currentDomainTitles(
  client: DossierClient,
  projectId: string,
): Promise<CurrentDomainTitles> {
  const none = { rules: [], roles: [], flows: [] };
  const snapshotId = await headSnapshotId(client, projectId);
  if (snapshotId === null) return none;
  const rows = await client.specEntity.findMany({
    where: { snapshotId, kind: { in: ["rule", "roles", "flow"] } },
    orderBy: [{ kind: "asc" }, { sort: "asc" }, { id: "asc" }],
    select: { kind: true, specId: true, data: true },
  });
  const titled = (kind: string) =>
    rows
      .filter((row) => row.kind === kind)
      .slice(0, DOMAIN_TITLES_MAX)
      .map((row) => ({ specId: row.specId, title: textOf(recordOf(row.data).titre) }));
  return {
    rules: titled("rule"),
    roles: rows.filter((row) => row.kind === "roles").flatMap((row) => rolesOf(row.data)),
    flows: titled("flow"),
  };
}

/**
 * Sources de la génération complète, sans diff : le dossier figé (dernière version dont le commit est réglé), la
 * synthèse publiée, la page des risques et le cahier actuel. `null` sans version figée : rien n'est envoyé au modèle.
 */
export async function readFrozenDossier(
  client: DossierClient,
  projectId: string,
): Promise<DossierSources | null> {
  const version = await frozenVersion(client, projectId, null);
  if (!version) return null;
  const pages = await frozenPages(client, projectId, versionsOf(version.pagesVersions));
  return {
    tag: version.tag,
    pages: pages.filter((page) => page.slug !== RISKS_SLUG),
    synthesis: await publishedSynthesis(client, projectId),
    risks: pages.find((page) => page.slug === RISKS_SLUG)?.content ?? null,
    features: await currentFeatures(client, projectId),
  };
}
