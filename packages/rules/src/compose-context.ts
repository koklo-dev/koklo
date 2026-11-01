import type { Catalog, Rule } from "./catalog-types.ts";
import type {
  AppliedWaiver,
  Attempt,
  Conflict,
  ConflictReason,
  DisabledRule,
  EffectiveRule,
  LayerLevel,
  LayerRule,
} from "./layer-types.ts";

/** Une règle en cours de composition : désactivée ou dérogée, elle reste connue des couches suivantes. */
export interface Entry {
  readonly rule: EffectiveRule;
  readonly disabled?: DisabledRule;
  readonly waivers: readonly AppliedWaiver[];
}

/** État de travail interne d'une résolution (jamais exposé, jamais partagé entre appels). */
export interface Context {
  readonly entries: Map<string, Entry>;
  readonly conflicts: Conflict[];
  readonly knownProfiles: ReadonlySet<string>;
  readonly path: string;
  /** Jour de `now` (`YYYY-MM-DD`). */
  readonly today: string;
}

export const isExpired = (ctx: Context, expires: string | undefined): boolean =>
  expires !== undefined && expires < ctx.today;

export const addConflict = (
  ctx: Context,
  level: LayerLevel,
  ruleId: string,
  attempted: Attempt,
  reason: ConflictReason,
): void => {
  ctx.conflicts.push({ ruleId, level, attempted, reason });
};

export const updateRule = (ctx: Context, id: string, patch: Partial<EffectiveRule>): void => {
  const entry = ctx.entries.get(id);
  if (entry !== undefined) ctx.entries.set(id, { ...entry, rule: { ...entry.rule, ...patch } });
};

/** Règle du catalogue, verrouillée d'emblée si protégée (drapeau ou liste du catalogue). */
export const catalogEntry = (rule: Rule, catalog: Catalog): Entry => ({
  rule: {
    ...rule,
    origin: "catalog",
    locked: rule.protected || catalog.protectedRuleIds.includes(rule.id),
    paths: [],
    excludePaths: [],
    trace: [{ kind: "catalog", level: "catalog" }],
  },
  waivers: [],
});

/** Règle ajoutée par une couche (sans `replaces`) ; son éventuel verrou est posé en fin de couche. */
export const addedEntry = (rule: LayerRule, level: LayerLevel, author?: string): Entry => {
  const { paths, excludePaths, replaces: _replaces, ...base } = rule;
  return {
    rule: {
      ...base,
      origin: level,
      locked: false,
      paths: paths ?? [],
      excludePaths: excludePaths ?? [],
      trace: [author === undefined ? { kind: "added", level } : { kind: "added", level, author }],
    },
    waivers: [],
  };
};
