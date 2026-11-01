import { addConflict, addedEntry, type Context } from "./compose-context.ts";
import type { LayerLevel, LayerRule, RuleLayer } from "./layer-types.ts";
import { type RulesError, rulesError } from "./rules-error.ts";

type Verdict = "go" | "skip";

/** `replaces` : la cible doit exister et ne pas être verrouillée. */
const checkReplaced = (ctx: Context, level: LayerLevel, rule: LayerRule): Verdict => {
  const target = rule.replaces;
  if (target === undefined || target === rule.id) return "go";
  const entry = ctx.entries.get(target);
  if (entry === undefined) addConflict(ctx, level, target, "replace", "unknown-rule");
  else if (entry.rule.locked) addConflict(ctx, level, target, "replace", "locked");
  else return "go";
  return "skip";
};

const addOne = (ctx: Context, layer: RuleLayer, rule: LayerRule): RulesError | undefined => {
  if (!rule.profiles.every((profile) => ctx.knownProfiles.has(profile))) {
    addConflict(ctx, layer.level, rule.id, "override", "unknown-profile");
    return undefined;
  }
  if (checkReplaced(ctx, layer.level, rule) === "skip") return undefined;
  const existing = ctx.entries.get(rule.id);
  if (existing?.rule.locked) {
    addConflict(ctx, layer.level, rule.id, "re-add", "locked");
    return undefined;
  }
  if (existing !== undefined && rule.replaces !== rule.id) {
    return rulesError("layer.collision", `rule ${rule.id} already exists`, `add.${rule.id}`);
  }
  if (rule.replaces !== undefined) ctx.entries.delete(rule.replaces);
  ctx.entries.set(rule.id, addedEntry(rule, layer.level, layer.author));
  return undefined;
};

/** Applique les règles ajoutées par la couche ; seule une collision d'id interrompt la résolution. */
export const applyAdds = (ctx: Context, layer: RuleLayer): RulesError | undefined => {
  for (const rule of layer.add ?? []) {
    const error = addOne(ctx, layer, rule);
    if (error !== undefined) return error;
  }
  return undefined;
};
