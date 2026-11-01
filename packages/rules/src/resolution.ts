import { compareText } from "./compare.ts";
import type { Context, Entry } from "./compose-context.ts";
import { type Conflict, LAYER_LEVELS } from "./layer-types.ts";
import type { ProfileSelection } from "./profiles.ts";
import type { Resolution, ResolveInput } from "./resolve-types.ts";
import { matchesAny } from "./scope-match.ts";

const RANK: readonly string[] = LAYER_LEVELS;

interface Scope {
  readonly profiles: ReadonlySet<string>;
  readonly role: ResolveInput["role"];
  readonly path: string;
}

/** La règle vise-t-elle ce profil, ce rôle et ce chemin (portée `paths` / `excludePaths`) ? */
const applies = ({ rule }: Entry, scope: Scope): boolean =>
  rule.profiles.some((profile) => scope.profiles.has(profile)) &&
  rule.agents.includes(scope.role) &&
  (rule.paths.length === 0 || matchesAny(rule.paths, scope.path)) &&
  !matchesAny(rule.excludePaths, scope.path);

const byRuleId = <T extends { ruleId: string }>(a: T, b: T): number =>
  compareText(a.ruleId, b.ruleId);

const byConflict = (a: Conflict, b: Conflict): number =>
  RANK.indexOf(a.level) - RANK.indexOf(b.level) ||
  compareText(a.ruleId, b.ruleId) ||
  compareText(a.attempted, b.attempted);

interface Parts {
  readonly input: ResolveInput;
  readonly ctx: Context;
  readonly selection: ProfileSelection;
  readonly path: string;
}

/** Assemble la `Resolution` : règles actives triées par id, conflits, désactivations et dérogations. */
export const buildResolution = ({ input, ctx, selection, path }: Parts): Resolution => {
  const scope: Scope = { profiles: new Set(selection.profiles), role: input.role, path };
  const relevant = [...ctx.entries.values()].filter((entry) => applies(entry, scope));
  return {
    catalogVersion: input.catalog.catalogVersion,
    role: input.role,
    path,
    profiles: selection.profiles,
    rules: relevant
      .filter((e) => e.disabled === undefined && e.waivers.length === 0)
      .map((e) => e.rule)
      .sort((a, b) => compareText(a.id, b.id)),
    conflicts: [...selection.conflicts, ...ctx.conflicts].sort(byConflict),
    disabled: relevant.flatMap((e) => (e.disabled ? [e.disabled] : [])).sort(byRuleId),
    waivers: relevant.flatMap((e) => e.waivers).sort(byRuleId),
  };
};
