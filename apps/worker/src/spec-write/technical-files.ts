import { EmitError, type ParsedSpec, parseSpecFiles } from "@koklo/schema";
import { toStoredReport } from "./report.ts";
import { failed } from "./types.ts";
import { invalidEmit, stop, type Workspace, writeFile } from "./workspace.ts";

/**
 * Lecture et écriture des fichiers du cahier technique (TK-115) dans l'espace du plan : un fichier illisible ou d'un autre
 * format arrête le lot (`SPEC_INVALID`), une valeur refusée à l'émission aussi.
 */
export function readEntity<T>(
  workspace: Workspace,
  path: string,
  pick: (spec: ParsedSpec) => readonly { value: T }[],
): T {
  const content = workspace.files.get(path) ?? "";
  const { spec, issues } = parseSpecFiles([{ path, content }]);
  return pick(spec)[0]?.value ?? stop(failed("SPEC_INVALID", toStoredReport(issues)));
}

/** Émet puis écrit : `emit` lève une `EmitError` pour une valeur hors du format. */
export function writeEntity(workspace: Workspace, path: string, id: string, emit: () => string) {
  try {
    writeFile(workspace, path, emit());
  } catch (error) {
    if (!(error instanceof EmitError)) throw error;
    invalidEmit(path, id, error);
  }
}

/** Valeur de fichier d'une valeur anglaise du contrat ; absente : `undefined`. */
export const wordOf = <K extends string, V extends string>(
  words: Readonly<Record<K, V>>,
  value: K | undefined,
): V | undefined => (value === undefined ? undefined : words[value]);

/** Les champs définis de `patch` remplacent ceux de `base`. */
export function overlaid<T extends object>(base: T, patch: Partial<Record<keyof T, unknown>>): T {
  const defined = Object.entries(patch).filter(([, value]) => value !== undefined);
  return { ...base, ...Object.fromEntries(defined) };
}
