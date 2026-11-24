import type { GitInstallation, GitProvider, RepoRef } from "@koklo/domain";
import type { Logger } from "@koklo/observability";
import { docSectionSlugOf, parseDocSection } from "@koklo/schema";
import { errorNameOf } from "../job-support.ts";
import { relativeToSpec, withSpecPath } from "../spec-write/paths.ts";

/** Au plus 100 sections lues par lancement d'Architecture (TK-114e, B670). */
export const DOC_SECTIONS_MAX = 100;

/** Tête indexée de la spec : dépôt, installation, dossier de la spec et commit du snapshot. */
export interface SpecHead {
  readonly installation: GitInstallation;
  readonly repo: RepoRef;
  readonly specPath: string | null;
  readonly commitSha: string;
}

/** Section de la tête : `DOC-<slug du fichier>` (l'identifiant du worker) et son titre. */
export interface HeadDocSection {
  readonly specId: string;
  readonly title: string;
}

async function readSections(provider: GitProvider, head: SpecHead): Promise<HeadDocSection[]> {
  const auth = await provider.authenticate({ installation: head.installation });
  const listing = await provider.listFiles({ auth, repo: head.repo, ref: head.commitSha });
  const found = listing.files.flatMap((file) => {
    const path = relativeToSpec(head.specPath, file.path);
    const parsed = path === undefined ? undefined : docSectionSlugOf(path);
    return path === undefined || parsed === undefined ? [] : [{ path, slug: parsed.slug }];
  });
  const sections: HeadDocSection[] = [];
  for (const { path, slug } of found.slice(0, DOC_SECTIONS_MAX)) {
    const file = await provider.readFile({
      auth,
      repo: head.repo,
      ref: head.commitSha,
      path: withSpecPath(head.specPath, path),
    });
    sections.push({ specId: `DOC-${slug}`, title: parseDocSection(file.content).title || slug });
  }
  return sections;
}

/**
 * Sections du document d'architecture de la tête, lues dans git (les sections ne sont pas indexées, B508). Sans fournisseur
 * ni tête : liste vide. Une panne n'arrête pas le lancement : liste vide et avertissement (le nom de l'erreur seul, jamais le
 * texte du fournisseur) ; l'enregistrement rattrape un doublon.
 */
export async function headDocSections(
  provider: GitProvider | null,
  head: SpecHead | null,
  logger: Logger,
): Promise<HeadDocSection[]> {
  if (provider === null || head === null) return [];
  try {
    return await readSections(provider, head);
  } catch (error) {
    logger.warn({ errorName: errorNameOf(error) }, "agent-propose: doc sections unread");
    return [];
  }
}
