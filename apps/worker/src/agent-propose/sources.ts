import {
  type CurrentFeature,
  currentFeatures,
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

/** Lit les sources du lancement ; `null` sans version figée (le lancement échoue, rien n'est envoyé). */
export function readSources(
  client: TenantClient,
  launch: LaunchContext,
): Promise<LaunchSources | null> {
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
