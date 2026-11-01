import { z } from "zod";
import { checkLayer, checkWaivers } from "./layer-checks.ts";
import { layerSchema, waiverSchema } from "./layer-schema.ts";
import { LAYER_LEVELS, type RuleLayer, type Waiver } from "./layer-types.ts";
import { type RulesError, type RulesResult, rulesError } from "./rules-error.ts";

const failure = (error: RulesError): { ok: false; error: RulesError } => ({ ok: false, error });

const shapeError = (error: z.ZodError, prefix = ""): RulesError => {
  const issue = error.issues[0];
  const path = issue?.path.join(".") ?? "";
  return rulesError(
    "layer.invalid-shape",
    issue?.message ?? "invalid layer",
    path === "" ? undefined : `${prefix}${path}`,
  );
};

const checkLevel = (doc: unknown): RulesError | undefined => {
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    return rulesError("layer.invalid-shape", "a layer must be an object");
  }
  if (!("level" in doc)) return rulesError("layer.invalid-shape", "level is required", "level");
  const known = LAYER_LEVELS.some((level) => level === doc.level);
  return known
    ? undefined
    : rulesError("layer.invalid-level", "a layer has no right at this level", "level");
};

/** Valide une couche (camelCase, strict) ; ne lève jamais. */
export const parseLayer = (input: unknown): RulesResult<RuleLayer> => {
  const levelError = checkLevel(input);
  if (levelError !== undefined) return failure(levelError);
  const parsed = layerSchema.safeParse(input);
  if (!parsed.success) return failure(shapeError(parsed.error));
  const invalid = checkLayer(parsed.data);
  // Après `checkLayer`, chaque dérogation porte une `expires` valide : le type optionnel du schéma se resserre.
  return invalid === undefined ? { ok: true, value: parsed.data as RuleLayer } : failure(invalid);
};

/** Valide une liste de dérogations (`expires` obligatoire) ; ne lève jamais. */
export const parseWaivers = (input: unknown): RulesResult<readonly Waiver[]> => {
  const parsed = z.array(waiverSchema).safeParse(input);
  if (!parsed.success) return failure(shapeError(parsed.error));
  const invalid = checkWaivers(parsed.data, "");
  return invalid === undefined ? { ok: true, value: parsed.data as Waiver[] } : failure(invalid);
};
