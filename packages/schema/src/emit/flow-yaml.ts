import { stringify } from "yaml";
import { type Flow, FlowSchema } from "../entities/index.ts";
import { toPointer } from "../parse/zod-issues.ts";

/** Erreur typée : `path` est le pointeur JSON de la valeur refusée. */
export class EmitFlowError extends Error {
  readonly path: string;

  constructor(message: string, path: string) {
    super(`${message} (${path === "" ? "racine" : path})`);
    this.name = "EmitFlowError";
    this.path = path;
  }
}

const step = (value: { libelle: string; ecran?: string | undefined }) => ({
  libelle: value.libelle,
  ...(value.ecran === undefined ? {} : { ecran: value.ecran }),
});

/**
 * Parcours -> YAML canonique (`design/flows/P-<slug>.yaml`) : clés dans un ordre FIXE, objets neufs (aucune ancre).
 * Pure ; ne lève que `EmitFlowError`. `parseFlowFile(emit(f))` rend `f`, et l'émission est idempotente.
 */
export function emitFlowYaml(flow: Flow): string {
  const checked = FlowSchema.safeParse(flow);
  if (!checked.success) {
    const issue = checked.error.issues[0];
    throw new EmitFlowError(issue?.message ?? "parcours invalide", toPointer(issue?.path ?? []));
  }
  const value = checked.data;
  return stringify(
    {
      id: value.id,
      titre: value.titre,
      acteur: value.acteur,
      depart: step(value.depart),
      etapes: value.etapes.map(step),
      erreurs: value.erreurs.map((error) => ({ etape: error.etape, texte: error.texte })),
      fonctionnalites: [...value.fonctionnalites],
    },
    { lineWidth: 0 },
  );
}
