import {
  type DataEntry,
  type SecurityData,
  type SecurityDataInput,
  SecurityDataSchema,
} from "../entities/index.ts";
import { EmitSecurityError } from "./security-error.ts";
import { emitYaml, listIf } from "./yaml-document.ts";

const entry = (value: DataEntry) => ({
  donnee: value.donnee,
  champs: [...value.champs],
  categorie: value.categorie,
  conservation: value.conservation,
  conservation_proposee: value.conservation_proposee,
  acces: listIf(value.acces),
  protection: value.protection,
});

/** Données classées -> YAML canonique (`security/data.yaml`), ordre des entrées conservé. */
export const emitSecurityDataYaml = (file: SecurityData | SecurityDataInput): string =>
  emitYaml(SecurityDataSchema, file, EmitSecurityError, (value) => ({
    transferts: value.transferts,
    donnees: value.donnees.map(entry),
  }));
