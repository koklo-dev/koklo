import { isIsoDay } from "./iso-date.ts";
import type { RawLayer, RawWaiver } from "./layer-schema.ts";
import { type RulesError, rulesError } from "./rules-error.ts";
import { isValidPattern } from "./scope-match.ts";

type Check = RulesError | undefined;

const checkPatterns = (list: readonly string[] | undefined, base: string): Check => {
  const index = (list ?? []).findIndex((pattern) => !isValidPattern(pattern));
  return index < 0
    ? undefined
    : rulesError(
        "layer.invalid-pattern",
        `invalid path pattern "${list?.[index]}"`,
        `${base}.${index}`,
      );
};

const checkExpires = (expires: string | undefined, path: string, required: boolean): Check => {
  if (expires === undefined) {
    return required ? rulesError("waiver.missing-expires", "expires is required", path) : undefined;
  }
  return isIsoDay(expires)
    ? undefined
    : rulesError("waiver.invalid-expires", `expires must be a YYYY-MM-DD date: "${expires}"`, path);
};

/** Contrôles de fond des dérogations (date obligatoire et valide, fichier valide). */
export const checkWaivers = (waivers: readonly RawWaiver[], prefix: string): Check => {
  for (const [index, waiver] of waivers.entries()) {
    const base = `${prefix}${index}`;
    const found =
      checkExpires(waiver.expires, `${base}.expires`, true) ??
      (isValidPattern(waiver.file)
        ? undefined
        : rulesError("layer.invalid-pattern", `invalid file "${waiver.file}"`, `${base}.file`));
    if (found !== undefined) return found;
  }
  return undefined;
};

const checkAdds = (layer: RawLayer): Check => {
  for (const [index, rule] of (layer.add ?? []).entries()) {
    const base = `add.${index}`;
    const found =
      checkPatterns(rule.paths, `${base}.paths`) ??
      checkPatterns(rule.excludePaths, `${base}.excludePaths`);
    if (found !== undefined) return found;
  }
  return undefined;
};

const checkOverrides = (layer: RawLayer): Check => {
  for (const [index, override] of (layer.override ?? []).entries()) {
    const base = `override.${index}`;
    const found =
      checkExpires(override.expires, `${base}.expires`, false) ??
      checkPatterns(override.excludePaths, `${base}.excludePaths`);
    if (found !== undefined) return found;
  }
  return undefined;
};

/** Contrôles de fond d'une couche déjà conforme au schéma. */
export const checkLayer = (layer: RawLayer): Check =>
  checkAdds(layer) ?? checkOverrides(layer) ?? checkWaivers(layer.waivers ?? [], "waivers.");
