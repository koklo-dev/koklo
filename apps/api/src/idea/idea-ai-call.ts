import type { AiPurpose } from "../ai/ai-budget.ts";
import { correlationIdOf } from "../ai/ai-call.ts";
import { rateLimited } from "../ai/ai-errors.ts";
import type { Clock } from "../clock.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { IdeaAgentRepository } from "./idea-agent.repository.ts";

/** Un appel d'IA à la fois par utilisateur et projet : le verrou vit 120 s et un refus invite à réessayer dans 5 s. */
export const LOCK_TTL_MS = 120_000;
export const LOCK_RETRY_SECONDS = 5;

/** Prend le verrou d'appel d'IA du projet pour cet utilisateur, ou refuse (`LLM_RATE_LIMITED`, réessayer dans 5 s). */
export async function acquireIdeaLock(
  repository: Pick<IdeaAgentRepository, "tryLock">,
  clock: Clock,
  scope: ProjectScope,
): Promise<Date> {
  const token = await repository.tryLock(scope, new Date(clock.now()), LOCK_TTL_MS);
  if (token === null) throw rateLimited(LOCK_RETRY_SECONDS);
  return token;
}

/** Ce que tout appel d'IA de l'espace Idée a en commun : acteur, corrélation, quota `ai` et ligne d'audit du projet. */
export function ideaCallBase(
  scope: ProjectScope,
  requestId: string,
  purpose: AiPurpose,
  action: string,
) {
  return {
    purpose,
    actor: {
      organizationId: scope.organizationId,
      userId: scope.userId,
      projectId: scope.projectId,
    },
    correlationId: correlationIdOf(requestId),
    quota: "ai" as const,
    entry: () => ({ action, targetKind: "project" as const, targetId: scope.projectId }),
  };
}
