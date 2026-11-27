import {
  type MatrixRow,
  type RightsFile,
  type RightsFileInput,
  RightsFileSchema,
} from "../entities/index.ts";
import { EmitSecurityError } from "./security-error.ts";
import { emitYaml, listIf } from "./yaml-document.ts";

const row = (value: MatrixRow) => ({
  action: value.action,
  libelle: value.libelle,
  cases: value.cases.map((cell) => ({
    role: cell.role,
    acces: cell.acces,
    restriction: cell.restriction,
  })),
});

/** Droits -> YAML canonique (`security/rights.yaml`). */
export const emitRightsYaml = (file: RightsFile | RightsFileInput): string =>
  emitYaml(RightsFileSchema, file, EmitSecurityError, (value) => ({
    matrice: value.matrice.map(row),
    restrictions: listIf(
      value.restrictions.map((r) => ({
        role: r.role,
        permission: r.permission,
        restriction: r.restriction,
      })),
    ),
    propriete: listIf(value.propriete),
  }));
