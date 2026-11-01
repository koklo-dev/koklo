import { addConflict, type Context, isExpired } from "./compose-context.ts";
import type { RuleLayer, Waiver } from "./layer-types.ts";
import { matchesPath } from "./scope-match.ts";

const applyOne = (ctx: Context, layer: RuleLayer, waiver: Waiver): void => {
  const entry = ctx.entries.get(waiver.ruleId);
  const refuse = (reason: "unknown-rule" | "expired" | "locked"): void =>
    addConflict(ctx, layer.level, waiver.ruleId, "waiver", reason);
  if (entry === undefined) refuse("unknown-rule");
  else if (isExpired(ctx, waiver.expires)) refuse("expired");
  else if (entry.rule.locked) refuse("locked");
  else if (matchesPath(waiver.file, ctx.path)) {
    const applied = { ...waiver, level: layer.level };
    ctx.entries.set(waiver.ruleId, { ...entry, waivers: [...entry.waivers, applied] });
  }
};

/** Dérogations tracées : valables pour leur fichier seulement, jamais sur une règle verrouillée. */
export const applyWaivers = (ctx: Context, layer: RuleLayer): void => {
  for (const waiver of layer.waivers ?? []) applyOne(ctx, layer, waiver);
};
