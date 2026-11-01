import { addConflict, type Context, updateRule } from "./compose-context.ts";
import type { RuleLayer } from "./layer-types.ts";

/** Verrou monotone : posé en fin de couche, il ne vaut que pour les niveaux strictement plus bas. */
export const applyLocks = (ctx: Context, layer: RuleLayer): void => {
  for (const rule of layer.add ?? []) {
    const entry = ctx.entries.get(rule.id);
    if (rule.protected && entry?.rule.origin === layer.level)
      updateRule(ctx, rule.id, { locked: true });
  }
  for (const id of layer.lock ?? []) {
    const entry = ctx.entries.get(id);
    if (entry === undefined) {
      addConflict(ctx, layer.level, id, "lock", "unknown-rule");
    } else if (!entry.rule.locked) {
      const author = layer.author === undefined ? {} : { author: layer.author };
      const trace = [
        ...entry.rule.trace,
        { kind: "locked" as const, level: layer.level, ...author },
      ];
      updateRule(ctx, id, { locked: true, trace });
    }
  }
};
