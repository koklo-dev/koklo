import type { QuotaScope, UsageCaps, UsagePolicy } from "./quota-policy.ts";
import type { QuotaState, WindowCount } from "./quota-state.ts";

type Level = "organization" | "project" | "agent";

interface ScopeLevel {
  readonly level: Level;
  readonly key: string;
}

/** Début de la fenêtre FIXE alignée qui contient `now`. */
export const windowStart = (now: number, windowMs: number): number =>
  Math.floor(now / windowMs) * windowMs;

/** Niveaux présents du scope et leurs clés `o:<org>`, `p:<org>/<projet>`, `a:<org>/<agent>`. */
export const scopeLevels = (scope: QuotaScope): readonly ScopeLevel[] => {
  const levels: ScopeLevel[] = [{ level: "organization", key: `o:${scope.organization}` }];
  if (scope.project !== undefined) {
    levels.push({ level: "project", key: `p:${scope.organization}/${scope.project}` });
  }
  if (scope.agent !== undefined) {
    levels.push({ level: "agent", key: `a:${scope.organization}/${scope.agent}` });
  }
  return levels;
};

/** Compteur de la fenêtre courante ; une fenêtre échue (ou absente) compte zéro. */
export const currentCount = (state: QuotaState, key: string, start: number): WindowCount => {
  const existing = state.windows[key];
  return existing !== undefined && existing.start === start
    ? existing
    : { start, runs: 0, tokens: 0 };
};

const isReached = (count: WindowCount, caps: UsageCaps): boolean =>
  (caps.maxRuns !== undefined && count.runs >= caps.maxRuns) ||
  (caps.maxTokens !== undefined && count.tokens >= caps.maxTokens);

/** `now` si aucun plafond applicable n'est atteint, sinon la fin de la fenêtre (le plus restrictif gagne). */
export const capsFreeAt = (
  state: QuotaState,
  now: number,
  scope: QuotaScope,
  policy: UsagePolicy,
): number => {
  const start = windowStart(now, policy.windowMs);
  const reached = scopeLevels(scope).some(({ level, key }) => {
    const caps = policy[level];
    return caps !== undefined && isReached(currentCount(state, key, start), caps);
  });
  return reached ? start + policy.windowMs : now;
};
