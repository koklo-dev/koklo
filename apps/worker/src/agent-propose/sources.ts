import {
  type CurrentArchitecture,
  type CurrentDomainTitles,
  type CurrentFeature,
  type CurrentTable,
  type CurrentTitle,
  currentArchitecture,
  currentDataModel,
  currentDomainTitles,
  currentFeatures,
  currentTableIds,
  type FrozenPage,
  frozenPages,
  frozenVersion,
  previousVersion,
  publishedSynthesis,
  RISKS_SLUG,
  type TenantClient,
  versionsOf,
  withOrganization,
} from "@koklo/db";
import { ideaPagesDiff } from "@koklo/domain";
import type { HeadDocSection, SpecHead } from "./doc-sections.ts";
import type { LaunchContext } from "./store.ts";

/**
 * Ce que l'agent lit pour le Fonctionnel, et rien d'autre (« L'agent lit », `AGENT_READS.functional`) :
 * pages figées, synthèse publiée, page des risques figée, cahier actuel. Ni commentaires, ni membres, ni autres
 * projets, ni brouillons. Les lectures sont celles de `@koklo/db` (`dossier-sources`), partagées avec l'API.
 */
export interface LaunchSources {
  readonly tag: string;
  /** Mode `update` : la version précédente et les pages retirées ; `pages` ne porte alors que les pages ajoutées ou modifiées. */
  readonly diff?: { readonly from: string; readonly removed: readonly string[] };
  readonly pages: readonly FrozenPage[];
  readonly synthesis: string | null;
  readonly risks: string | null;
  readonly features: readonly CurrentFeature[];
  /** Titres des règles, rôles et parcours déjà au cahier (TK-103) : jamais redemandés, jamais dupliqués. */
  readonly rules: CurrentDomainTitles["rules"];
  readonly roles: CurrentDomainTitles["roles"];
  readonly flows: CurrentDomainTitles["flows"];
  /** Livrable Données (TK-107) : le modèle actuel ; absent pour le Fonctionnel. Sa présence choisit les prompts des Données. */
  readonly tables?: readonly CurrentTable[];
  readonly fixtures?: readonly CurrentTitle[];
  /** Livrable Architecture (TK-111) : composants, flux, décisions et exigences connues ; sa présence choisit les prompts de l'architecture. */
  readonly architecture?: CurrentArchitecture;
  /** Architecture (TK-114b) : identifiants de toutes les tables, pour la couverture ; jamais envoyés au modèle. */
  readonly tableIds?: readonly string[];
  /** Architecture (TK-114e, B670) : sections du document de la tête, lues dans git (100 au plus). */
  readonly docSections?: readonly HeadDocSection[];
}

/** Lecture des sections de la tête (fournisseur git du worker) ; liste vide sans fournisseur. */
export type DocSectionsReader = (head: SpecHead | null) => Promise<readonly HeadDocSection[]>;
export const noDocSections: DocSectionsReader = async () => [];

/** Branche de travail lue d'abord, comme `headSnapshotId` de `@koklo/db` (`dossier-sources`). */
const WORKING_BRANCH = "cadrage";

/** Tête indexée de la spec (branche de cadrage, sinon branche par défaut) ; `null` sans tête ou sur un snapshot échoué. */
export async function specHeadOf(
  client: TenantClient,
  projectId: string,
): Promise<SpecHead | null> {
  const repo = await client.projectRepo.findFirst({
    where: { projectId, OR: [{ role: "spec" }, { specPath: { not: null } }] },
    include: { installation: true },
  });
  if (!repo) return null;
  for (const branch of [WORKING_BRANCH, repo.defaultBranch]) {
    const head = await client.specHead.findFirst({
      where: { repoId: repo.id, branch },
      include: { snapshot: { select: { commitSha: true, status: true } } },
    });
    if (!head) continue;
    if (head.snapshot.status === "failed") return null;
    const owner = { kind: repo.installation.ownerKind, login: repo.installation.ownerLogin };
    return {
      installation: { id: repo.installation.externalId, owner },
      repo: { owner: { kind: owner.kind, login: repo.ownerLogin }, name: repo.name },
      specPath: repo.specPath,
      commitSha: head.snapshot.commitSha,
    };
  }
  return null;
}

/** Diff `idea-vN-1` vers `idea-vN` du mode `update` ; `null` sans version précédente, `undefined` hors mode `update`. */
async function updateDiff(
  client: TenantClient,
  launch: LaunchContext,
  version: { number: number; pagesVersions: unknown },
) {
  if (launch.mode !== "update") return undefined;
  const previous = await previousVersion(client, launch.projectId, version.number);
  if (!previous) return null;
  const diff = ideaPagesDiff(versionsOf(previous.pagesVersions), versionsOf(version.pagesVersions));
  return { ...diff, from: previous.tag };
}

/**
 * Sources des Données (B387) : le Fonctionnel indexé (fonctionnalités, règles, rôles, parcours) et le modèle actuel ; ni
 * dossier d'idée, ni synthèse, ni version figée (`tag` est celui du modèle).
 */
function readDataSources(client: TenantClient, launch: LaunchContext): Promise<LaunchSources> {
  return withOrganization(launch.organizationId, async () => ({
    tag: "model",
    pages: [],
    synthesis: null,
    risks: null,
    features: await currentFeatures(client, launch.projectId),
    ...(await currentDomainTitles(client, launch.projectId)),
    ...(await currentDataModel(client, launch.projectId)),
  }));
}

/**
 * Sources de l'Architecture (B512) : le Fonctionnel indexé, les tables, l'architecture actuelle, les exigences connues et les
 * sections du document de la tête (TK-114e) ; ni
 * dossier d'idée, ni synthèse, ni lignes de jeux (`tag` est celui de l'architecture).
 */
function readArchitectureSources(
  client: TenantClient,
  launch: LaunchContext,
  docSections: DocSectionsReader,
): Promise<LaunchSources> {
  return withOrganization(launch.organizationId, async () => ({
    tag: "architecture",
    pages: [],
    synthesis: null,
    risks: null,
    features: await currentFeatures(client, launch.projectId),
    ...(await currentDomainTitles(client, launch.projectId)),
    tables: (await currentDataModel(client, launch.projectId)).tables,
    architecture: await currentArchitecture(client, launch.projectId),
    tableIds: await currentTableIds(client, launch.projectId),
    docSections: await docSections(await specHeadOf(client, launch.projectId)),
  }));
}

/** Lit les sources du lancement ; `null` sans version figée (le lancement échoue, rien n'est envoyé). */
export function readSources(
  client: TenantClient,
  launch: LaunchContext,
  docSections: DocSectionsReader = noDocSections,
): Promise<LaunchSources | null> {
  if (launch.deliverable === "data") return readDataSources(client, launch);
  if (launch.deliverable === "architecture") {
    return readArchitectureSources(client, launch, docSections);
  }
  return withOrganization(launch.organizationId, async () => {
    const version = await frozenVersion(client, launch.projectId, launch.baseVersion);
    if (!version) return null;
    // Mode `update` : le diff seul ; sans version précédente, il n'y a rien à mettre à jour.
    const diff = await updateDiff(client, launch, version);
    if (diff === null) return null;
    const changed = diff && new Set([...diff.added, ...diff.modified]);
    const pages = await frozenPages(
      client,
      launch.projectId,
      versionsOf(version.pagesVersions),
      changed || undefined,
    );
    const domain = await currentDomainTitles(client, launch.projectId);
    return {
      tag: version.tag,
      ...(diff ? { diff: { from: diff.from, removed: diff.removed } } : {}),
      pages: pages.filter((page) => page.slug !== RISKS_SLUG),
      synthesis: diff ? null : await publishedSynthesis(client, launch.projectId),
      risks: pages.find((page) => page.slug === RISKS_SLUG)?.content ?? null,
      features: await currentFeatures(client, launch.projectId),
      ...domain,
    };
  });
}
