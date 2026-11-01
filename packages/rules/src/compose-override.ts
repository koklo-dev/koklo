import { addConflict, type Context, type Entry, isExpired, updateRule } from "./compose-context.ts";
import type {
  Attempt,
  EffectiveRule,
  LayerLevel,
  Override,
  RuleLayer,
  Trace,
} from "./layer-types.ts";
import { isLockedSafe, isWeaker } from "./strength.ts";

type Effect = readonly [Attempt, (rule: EffectiveRule, override: Override) => boolean];

/** Effets d'une surcharge qui affaiblissent la règle, par ordre de priorité d'affichage. */
const WEAKENING: readonly Effect[] = [
  ["disable", (_rule, o) => o.disabled === true],
  [
    "severity",
    (rule, o) =>
      o.severity !== undefined &&
      isWeaker(rule, { severity: o.severity, enforcement: rule.enforcement }),
  ],
  [
    "enforcement",
    (rule, o) =>
      o.enforcement !== undefined &&
      (isWeaker(rule, { severity: rule.severity, enforcement: o.enforcement }) ||
        (rule.locked && !isLockedSafe(rule.enforcement, o.enforcement))),
  ],
  ["agents", (rule, o) => rule.agents.some((agent) => o.agents?.includes(agent) === false)],
  ["exclude-paths", (_rule, o) => (o.excludePaths?.length ?? 0) > 0],
  ["unlock", (_rule, o) => o.protected === false],
];

const ATTEMPTS: readonly (readonly [Attempt, (o: Override) => boolean])[] = [
  ["disable", (o) => o.disabled !== undefined],
  ["severity", (o) => o.severity !== undefined],
  ["enforcement", (o) => o.enforcement !== undefined],
  ["agents", (o) => o.agents !== undefined],
  ["exclude-paths", (o) => o.excludePaths !== undefined],
  ["unlock", (o) => o.protected !== undefined],
];

/** Premier effet affaiblissant de la surcharge sur la règle, s'il y en a un. */
const weakeningOf = (rule: EffectiveRule, override: Override): Attempt | undefined =>
  WEAKENING.find(([, weakens]) => weakens(rule, override))?.[0];

/** Effet tenté, pour les conflits `expired` (et `override` si la surcharge n'a pas d'effet nommé). */
const attemptOf = (override: Override): Attempt =>
  ATTEMPTS.find(([, present]) => present(override))?.[0] ?? "override";

const union = (current: readonly string[], added: readonly string[] | undefined): string[] => [
  ...new Set([...current, ...(added ?? [])]),
];

const traceOf = (level: LayerLevel, override: Override, kind: Trace["kind"]): Trace => ({
  kind,
  level,
  author: override.author,
  justification: override.justification,
  ...(override.expires === undefined ? {} : { expires: override.expires }),
});

const applyChange = (ctx: Context, level: LayerLevel, entry: Entry, override: Override): void => {
  const rule = entry.rule;
  const next: Partial<EffectiveRule> = {
    severity: override.severity ?? rule.severity,
    enforcement: override.enforcement ?? rule.enforcement,
    agents: override.agents ?? rule.agents,
    excludePaths: union(rule.excludePaths, override.excludePaths),
  };
  const changed = (Object.keys(next) as (keyof typeof next)[]).some(
    (key) => JSON.stringify(next[key]) !== JSON.stringify(rule[key]),
  );
  if (!changed) return;
  const kind = weakeningOf(rule, override) === undefined ? "hardened" : "overridden";
  updateRule(ctx, rule.id, { ...next, trace: [...rule.trace, traceOf(level, override, kind)] });
};

const disable = (ctx: Context, level: LayerLevel, entry: Entry, override: Override): void => {
  const { ruleId, author, justification, expires } = override;
  const disabled = { ruleId, level, author, justification, ...(expires ? { expires } : {}) };
  ctx.entries.set(ruleId, { ...entry, disabled: entry.disabled ?? disabled });
};

const applyOne = (ctx: Context, level: LayerLevel, override: Override): void => {
  const entry = ctx.entries.get(override.ruleId);
  if (entry === undefined) {
    addConflict(ctx, level, override.ruleId, "override", "unknown-rule");
  } else if (isExpired(ctx, override.expires)) {
    addConflict(ctx, level, override.ruleId, attemptOf(override), "expired");
  } else if (entry.rule.locked && weakeningOf(entry.rule, override) !== undefined) {
    const attempted = weakeningOf(entry.rule, override) as Attempt;
    addConflict(ctx, level, override.ruleId, attempted, "locked");
  } else if (override.disabled === true) {
    disable(ctx, level, entry, override);
  } else {
    applyChange(ctx, level, entry, override);
  }
};

/** Applique les surcharges tracées ; une surcharge qui affaiblit une règle verrouillée est rejetée en bloc. */
export const applyOverrides = (ctx: Context, layer: RuleLayer): void => {
  for (const override of layer.override ?? []) applyOne(ctx, layer.level, override);
};
