import type { FileChange } from "@koklo/domain";
import { EmitIdeaError, emitIdeaIndex, emitIdeaPage, emitIdeaSynthesis } from "@koklo/schema";
import {
  ideaDeleteSlug,
  ideaIndexPayload,
  ideaPagePayload,
  ideaSynthesisPayload,
  ideaTagName,
} from "./idea-payload.ts";
import { IDEA_INDEX_PATH, IDEA_SYNTHESIS_PATH, ideaPagePath } from "./paths.ts";
import { toStoredReport } from "./report.ts";
import { type BatchOperation, failed, type Outcome } from "./types.ts";

/** Gabarit d'origine écrit en tête de `idea/_index.yaml` (seul gabarit du lot 2a). */
const STRUCTURE = "cadrage-par-defaut";

/** Résultat du plan d'une publication : les changements à commiter, ou un résultat métier. */
export type IdeaPlan = { readonly changes: readonly FileChange[] } | { readonly outcome: Outcome };

function invalid(path: string, error: EmitIdeaError): IdeaPlan {
  return {
    outcome: failed(
      "SPEC_INVALID",
      toStoredReport([
        {
          rule: "structure",
          code: "STRUCT_SCHEMA_VIOLATION",
          severity: "error",
          path,
          pointer: error.path,
          message: error.message,
        },
      ]),
    ),
  };
}

const payloadError = (): IdeaPlan => ({ outcome: failed("INTERNAL") });

/** Écritures et retraits accumulés ; un retrait n'efface jamais une page réécrite dans le même lot. */
interface Draft {
  readonly changes: Map<string, FileChange>;
  readonly removals: string[];
}

function emitted(path: string, build: () => string): FileChange | IdeaPlan {
  try {
    return { path, content: build() };
  } catch (error) {
    if (error instanceof EmitIdeaError) return invalid(path, error);
    throw error;
  }
}

const isPlan = (value: FileChange | IdeaPlan): value is IdeaPlan => "outcome" in value;

function record(draft: Draft, path: string, change: FileChange | IdeaPlan): IdeaPlan | undefined {
  if (isPlan(change)) return change;
  draft.changes.set(path, change);
  return undefined;
}

function applySynthesis(draft: Draft, payload: BatchOperation["payload"]): IdeaPlan | undefined {
  const synthesis = ideaSynthesisPayload(payload);
  if (synthesis === undefined) return payloadError();
  const change = emitted(IDEA_SYNTHESIS_PATH, () =>
    emitIdeaSynthesis({
      source: synthesis.source,
      updatedAt: synthesis.generatedAt,
      contentMd: synthesis.contentMd,
    }),
  );
  return record(draft, IDEA_SYNTHESIS_PATH, change);
}

function applyOperation(draft: Draft, operation: BatchOperation): IdeaPlan | undefined {
  const { kind, payload } = operation;
  if (kind === "idea.page.delete") {
    const slug = ideaDeleteSlug(payload);
    if (slug === undefined) return payloadError();
    draft.removals.push(ideaPagePath(slug));
    return undefined;
  }
  // Le tag n'écrit aucun fichier : le worker le pose après le commit (`execute.ts`).
  if (kind === "idea.version.tag")
    return ideaTagName(payload) === undefined ? payloadError() : undefined;
  if (kind === "idea.synthesis.write") return applySynthesis(draft, payload);
  const page = kind === "idea.page.write" ? ideaPagePayload(payload) : undefined;
  const index = kind === "idea.index.write" ? ideaIndexPayload(payload) : undefined;
  if (page === undefined && index === undefined) return payloadError();
  const path = page ? ideaPagePath(page.slug) : IDEA_INDEX_PATH;
  const change = emitted(path, () =>
    page ? emitIdeaPage(page) : emitIdeaIndex({ structure: STRUCTURE, pages: index?.pages ?? [] }),
  );
  return record(draft, path, change);
}

/**
 * Publication de l'espace Idée : une écriture par page (`idea/<slug>.md`, nom stable au
 * réordonnancement), les retraits des pages présentes, puis `idea/_index.yaml`. Pur ; aucune
 * validation de spec (`checkSpec` ne regarde pas `idea/`) ; les droits sont vérifiés par l'API.
 * `existingPaths` : tous les fichiers de l'arbre (relatifs à la spec), `idea/` compris, que la lecture
 * de la spec ne remonte pas.
 */
export function planIdeaBatch(
  operations: readonly BatchOperation[],
  existingPaths: readonly string[],
): IdeaPlan {
  const present = new Set(existingPaths);
  const draft: Draft = { changes: new Map(), removals: [] };
  for (const operation of operations) {
    const stopped = applyOperation(draft, operation);
    if (stopped) return stopped;
  }
  for (const path of draft.removals) {
    if (present.has(path) && !draft.changes.has(path)) {
      draft.changes.set(path, { path, delete: true });
    }
  }
  return { changes: [...draft.changes.values()] };
}
