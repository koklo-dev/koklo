import {
  countOpenQuestions,
  framingReadiness,
  type IdeaPageStatus,
  ideaModifiedSince,
} from "@koklo/domain";
import type { Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { IdeaListing, IdeaPageRecord } from "./idea.repository.ts";

/** Page des questions ouvertes (TK-91, B258) : son slug ne change jamais, même si elle est renommée. */
const QUESTIONS_SLUG = "hypotheses-risques";

type ActivePage = Pick<IdeaPageRecord, "slug" | "title" | "required" | "version"> & {
  status: string;
};

/**
 * Maturité et version du dossier pour `idea.list` (TK-91) : seuil des pages requises, questions ouvertes de la page
 * « Hypothèses et risques » (hors corbeille), dernière version dont le lot est commité et « modifié depuis ».
 */
export async function maturityOf(
  tx: Tx,
  scope: ProjectScope,
  pages: readonly ActivePage[],
): Promise<Pick<IdeaListing, "maturity" | "version">> {
  const readiness = framingReadiness(
    pages.map((page) => ({
      title: page.title,
      required: page.required,
      status: page.status as IdeaPageStatus,
    })),
  );
  const [questions, latest] = await Promise.all([
    tx.ideaPage.findFirst({
      where: { projectId: scope.projectId, slug: QUESTIONS_SLUG, deletedAt: null },
      select: { contentMd: true },
    }),
    tx.ideaVersion.findFirst({
      where: { projectId: scope.projectId, commitSha: { not: null } },
      orderBy: { number: "desc" },
      select: { number: true, tag: true, commitSha: true, frozenAt: true, pagesVersions: true },
    }),
  ]);
  const current = Object.fromEntries(pages.map((page) => [page.slug, page.version]));
  return {
    maturity: {
      stable: readiness.stable,
      total: readiness.total,
      missingRequired: [...readiness.missing],
      openQuestions: countOpenQuestions(questions?.contentMd ?? ""),
    },
    version: {
      latest:
        latest === null
          ? null
          : {
              number: latest.number,
              tag: latest.tag,
              commitSha: latest.commitSha ?? "",
              frozenAt: latest.frozenAt,
            },
      modifiedSince:
        latest !== null &&
        ideaModifiedSince(latest.pagesVersions as Record<string, number>, current),
    },
  };
}
