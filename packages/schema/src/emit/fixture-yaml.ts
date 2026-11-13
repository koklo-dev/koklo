import { stringify } from "yaml";
import { type Fixture, FixtureSchema } from "../entities/index.ts";
import { toPointer } from "../parse/zod-issues.ts";

/** Erreur typée : `path` est le pointeur JSON de la valeur refusée. */
export class EmitFixtureError extends Error {
  readonly path: string;

  constructor(message: string, path: string) {
    super(`${message} (${path === "" ? "racine" : path})`);
    this.name = "EmitFixtureError";
    this.path = path;
  }
}

/**
 * Jeu d'exemple -> YAML canonique (`data/fixtures/FX-<slug>.yaml`) : clés dans un ordre FIXE. Pure ; ne lève que
 * `EmitFixtureError` (e-mail hors domaine réservé, plus de 200 lignes...).
 */
export function emitFixtureYaml(fixture: Fixture): string {
  const checked = FixtureSchema.safeParse(fixture);
  if (!checked.success) {
    const issue = checked.error.issues[0];
    throw new EmitFixtureError(issue?.message ?? "jeu invalide", toPointer(issue?.path ?? []));
  }
  const value = checked.data;
  return stringify(
    {
      id: value.id,
      titre: value.titre,
      table: value.table,
      locale: value.locale,
      lignes: value.lignes.map((row) => ({ ...row })),
    },
    { lineWidth: 0 },
  );
}
