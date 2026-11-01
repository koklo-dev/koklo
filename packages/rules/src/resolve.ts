import { AGENT_ROLES, type Catalog } from "./catalog-types.ts";
import { composeLayers } from "./compose.ts";
import { type Context, catalogEntry } from "./compose-context.ts";
import { frozenCopy } from "./freeze.ts";
import { dayOfIso } from "./iso-date.ts";
import { LAYER_LEVELS, type RuleLayer } from "./layer-types.ts";
import { parseLayer } from "./parse-layer.ts";
import { checkSelections, effectiveProfiles } from "./profiles.ts";
import { buildResolution } from "./resolution.ts";
import type { Resolution, ResolveInput } from "./resolve-types.ts";
import { type RulesError, type RulesResult, rulesError } from "./rules-error.ts";
import { normalizePath } from "./scope-match.ts";

const fail = (error: RulesError): RulesResult<never> => ({ ok: false, error });

/** Revalide chaque couche, refuse les doublons de niveau et les trie par rang (org < groupe < projet). */
const orderLayers = (layers: readonly unknown[]): RulesResult<readonly RuleLayer[]> => {
  const parsed: RuleLayer[] = [];
  for (const [index, raw] of layers.entries()) {
    const result = parseLayer(raw);
    if (!result.ok) {
      const path = result.error.path === undefined ? `${index}` : `${index}.${result.error.path}`;
      return fail({ ...result.error, path });
    }
    if (parsed.some((layer) => layer.level === result.value.level)) {
      return fail(
        rulesError(
          "layer.duplicate-level",
          `two layers at level ${result.value.level}`,
          `${index}.level`,
        ),
      );
    }
    parsed.push(result.value);
  }
  return {
    ok: true,
    value: parsed.sort((a, b) => LAYER_LEVELS.indexOf(a.level) - LAYER_LEVELS.indexOf(b.level)),
  };
};

const checkInput = (input: ResolveInput): RulesError | undefined => {
  if (!AGENT_ROLES.some((role) => role === input.role)) {
    return rulesError("resolve.invalid-role", `unknown role "${input.role}"`, "role");
  }
  if (normalizePath(input.path) === undefined) {
    return rulesError("resolve.invalid-path", `invalid path "${input.path}"`, "path");
  }
  if (dayOfIso(input.now) === undefined) {
    return rulesError("resolve.invalid-now", `now must be an ISO date: "${input.now}"`, "now");
  }
  return checkSelections(input);
};

const initialContext = (catalog: Catalog, path: string, today: string): Context => ({
  entries: new Map(catalog.rules.map((rule) => [rule.id, catalogEntry(rule, catalog)])),
  conflicts: [],
  knownProfiles: new Set(Object.keys(catalog.profiles)),
  path,
  today,
});

/** Règles effectives pour un rôle et un chemin ; pure, déterministe, ne lève jamais.
 *  `now` est injecté : aucune horloge dans le paquet. La sortie est gelée et ne partage rien avec l'entrée. */
export const resolveEffectiveRules = (input: ResolveInput): RulesResult<Resolution> => {
  const invalid = checkInput(input);
  if (invalid !== undefined) return fail(invalid);
  const layers = orderLayers(input.layers);
  if (!layers.ok) return layers;
  const path = normalizePath(input.path) as string;
  const today = dayOfIso(input.now) as string;
  const selection = effectiveProfiles(input, layers.value, path);
  const ctx = initialContext(input.catalog, path, today);
  const failed = composeLayers(ctx, layers.value);
  if (failed !== undefined) return fail(failed);
  const resolution = buildResolution({ input, ctx, selection, path });
  return { ok: true, value: frozenCopy(resolution) };
};
