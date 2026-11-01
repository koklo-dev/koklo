import { applyAdds } from "./compose-add.ts";
import type { Context } from "./compose-context.ts";
import { applyLocks } from "./compose-lock.ts";
import { applyOverrides } from "./compose-override.ts";
import { applyWaivers } from "./compose-waiver.ts";
import type { RuleLayer } from "./layer-types.ts";
import type { RulesError } from "./rules-error.ts";

/** Compose les couches (déjà triées par niveau) sur le catalogue : ajouts, surcharges, dérogations,
 *  puis verrous de la couche, qui ne valent que pour les couches suivantes. */
export const composeLayers = (
  ctx: Context,
  layers: readonly RuleLayer[],
): RulesError | undefined => {
  for (const layer of layers) {
    const error = applyAdds(ctx, layer);
    if (error !== undefined) return error;
    applyOverrides(ctx, layer);
    applyWaivers(ctx, layer);
    applyLocks(ctx, layer);
  }
  return undefined;
};
