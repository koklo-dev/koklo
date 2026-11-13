import { parse, stringify } from "yaml";
import { z } from "zod";
import { toPointer } from "../parse/zod-issues.ts";
import { tableId } from "./ids.ts";

/** Fichier de mise en page du diagramme du modèle de données (TK-108, B418) : hors modèle, `kindOf` l'ignore. */
export const LAYOUT_PATH = "data/_layout.yaml";
/** Bornes : coordonnées entières de 0 à 20000, 500 tables au plus. */
export const LAYOUT_COORD_MAX = 20000;
export const LAYOUT_MAX_ENTRIES = 500;

const coordinate = z.number().int().min(0).max(LAYOUT_COORD_MAX);

/** `data/_layout.yaml` : `positions` par identifiant de table (T-<slug>), jamais d'autre clé. */
export const LayoutSchema = z.strictObject({
  positions: z
    .record(tableId, z.strictObject({ x: coordinate, y: coordinate }))
    .refine((positions) => Object.keys(positions).length <= LAYOUT_MAX_ENTRIES, {
      message: `au plus ${LAYOUT_MAX_ENTRIES} tables positionnées`,
    }),
});

export type Layout = z.output<typeof LayoutSchema>;
export type LayoutPositions = Layout["positions"];

/** Erreur typée : `path` est le pointeur JSON de la valeur refusée. */
export class EmitLayoutError extends Error {
  readonly path: string;

  constructor(message: string, path: string) {
    super(`${message} (${path === "" ? "racine" : path})`);
    this.name = "EmitLayoutError";
    this.path = path;
  }
}

/**
 * Positions -> `data/_layout.yaml` canonique : tables triées par identifiant, `x` puis `y`, entiers. Pure ; ne lève que
 * `EmitLayoutError`.
 */
export function emitLayoutYaml(positions: LayoutPositions): string {
  const checked = LayoutSchema.safeParse({ positions });
  if (!checked.success) {
    const issue = checked.error.issues[0];
    throw new EmitLayoutError(
      issue?.message ?? "mise en page invalide",
      toPointer(issue?.path ?? []),
    );
  }
  const sorted = Object.keys(checked.data.positions)
    .sort()
    .map((id) => {
      const { x, y } = checked.data.positions[id] as { x: number; y: number };
      return [id, { x, y }] as const;
    });
  return stringify({ positions: Object.fromEntries(sorted) }, { lineWidth: 0 });
}

/** Relit `data/_layout.yaml` ; un texte illisible ou hors schéma est refusé sans exception. */
export function parseLayout(
  text: string,
): { ok: true; positions: LayoutPositions } | { ok: false; message: string } {
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "YAML illisible" };
  }
  const checked = LayoutSchema.safeParse(raw);
  return checked.success
    ? { ok: true, positions: checked.data.positions }
    : { ok: false, message: checked.error.issues[0]?.message ?? "mise en page invalide" };
}
