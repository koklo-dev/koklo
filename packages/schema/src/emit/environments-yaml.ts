import {
  type Environment,
  type EnvironmentsFile,
  type EnvironmentsFileInput,
  EnvironmentsFileSchema,
} from "../entities/index.ts";
import { EmitError } from "./errors.ts";
import { emitYaml, listIf } from "./yaml-document.ts";

export class EmitEnvironmentsError extends EmitError {
  static readonly fallback = "environnements invalides";
  constructor(message: string, path: string) {
    super("EmitEnvironmentsError", message, path);
  }
}

const environment = (value: Environment) => ({
  id: value.id,
  nom: value.nom,
  adresse: value.adresse,
  hebergement: value.hebergement,
  base: value.base,
  donnees: value.donnees,
  deploiement: value.deploiement,
  acces: value.acces,
  lignes: listIf((value.lignes ?? []).map((row) => ({ libelle: row.libelle, valeur: row.valeur }))),
});

/** Environnements -> YAML canonique (`tech/environments.yaml`), ordre des listes conservé. */
export const emitEnvironmentsYaml = (file: EnvironmentsFile | EnvironmentsFileInput): string =>
  emitYaml(EnvironmentsFileSchema, file, EmitEnvironmentsError, (value) => ({
    environnements: listIf(value.environnements.map(environment)),
    variables: listIf(value.variables.map((v) => ({ nom: v.nom, usage: v.usage }))),
    integrations: listIf(
      value.integrations.map((i) => ({ service: i.service, usage: i.usage, statut: i.statut })),
    ),
  }));
