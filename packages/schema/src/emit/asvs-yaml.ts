import {
  type AsvsFile,
  type AsvsFileInput,
  AsvsFileSchema,
  type AsvsRequirement,
} from "../entities/index.ts";
import { EmitSecurityError } from "./security-error.ts";
import { emitYaml, listIf } from "./yaml-document.ts";

const requirement = (value: AsvsRequirement) => ({
  id: value.id,
  chapitre: value.chapitre,
  titre: value.titre,
  niveau: value.niveau,
  reponse: value.reponse,
  liens: value.liens,
});

/** Exigences ASVS -> YAML canonique (`security/asvs.yaml`). */
export const emitAsvsYaml = (file: AsvsFile | AsvsFileInput): string =>
  emitYaml(AsvsFileSchema, file, EmitSecurityError, (value) => ({
    niveau: value.niveau,
    exigences: listIf(value.exigences.map(requirement)),
    secrets_et_dependances: listIf(
      value.secrets_et_dependances.map((fact) => ({ libelle: fact.libelle, valeur: fact.valeur })),
    ),
  }));
