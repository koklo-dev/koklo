import { stringify } from "yaml";
import { type TableV2, TableV2Schema } from "../entities/index.ts";
import { toPointer } from "../parse/zod-issues.ts";

/** Erreur typée : `path` est le pointeur JSON de la valeur refusée. */
export class EmitTableError extends Error {
  readonly path: string;

  constructor(message: string, path: string) {
    super(`${message} (${path === "" ? "racine" : path})`);
    this.name = "EmitTableError";
    this.path = path;
  }
}

type Field = TableV2["champs"][number];

const field = (value: Field) => ({
  nom: value.nom,
  type: value.type,
  ...(value.cle === undefined ? {} : { cle: value.cle }),
  ...(value.contraintes === undefined ? {} : { contraintes: value.contraintes }),
  ...(value.valeurs === undefined ? {} : { valeurs: [...value.valeurs] }),
  ...(value.regle === undefined ? {} : { regle: value.regle }),
  ...(value.donnees_personnelles === undefined
    ? {}
    : { donnees_personnelles: value.donnees_personnelles }),
});

/**
 * Table -> YAML canonique (`data/tables/<slug>.yaml`) : clés dans un ordre FIXE, objets neufs. Pure ; ne lève que
 * `EmitTableError`. `parseSpecFiles` rend la table émise, et l'émission est idempotente.
 */
export function emitTableYaml(table: TableV2): string {
  const checked = TableV2Schema.safeParse(table);
  if (!checked.success) {
    const issue = checked.error.issues[0];
    throw new EmitTableError(issue?.message ?? "table invalide", toPointer(issue?.path ?? []));
  }
  const value = checked.data;
  return stringify(
    {
      id: value.id,
      nom: value.nom,
      ...(value.description === undefined ? {} : { description: value.description }),
      ...(value.resume_client === undefined ? {} : { resume_client: [...value.resume_client] }),
      ...(value.source === undefined ? {} : { source: [...value.source] }),
      ...(value.zone === undefined ? {} : { zone: value.zone }),
      champs: value.champs.map(field),
      ...(value.relations === undefined
        ? {}
        : {
            relations: value.relations.map((r) => ({ vers: r.vers, cardinalite: r.cardinalite })),
          }),
    },
    { lineWidth: 0 },
  );
}
