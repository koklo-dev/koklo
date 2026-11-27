import { type Operation, type OperationInput, OperationSchema } from "../entities/index.ts";
import { EmitError } from "./errors.ts";
import { emitYaml, listIf, recordIf } from "./yaml-document.ts";

export class EmitOperationError extends EmitError {
  static readonly fallback = "opération invalide";
  constructor(message: string, path: string) {
    super("EmitOperationError", message, path);
  }
}

const input = (value: Operation["entree"][string]) => ({
  type: value.type,
  contrainte: value.contrainte,
});
const output = (value: Operation["sortie"][string]) => ({ type: value.type, note: value.note });
const failure = (value: Operation["erreurs"][number]) => ({
  code: value.code,
  quand: value.quand,
  regle: value.regle,
});

/** Opération -> YAML canonique (`api/endpoints/<zone.verbe>.yaml`), ordre des champs conservé. */
export const emitOperationYaml = (operation: Operation | OperationInput): string =>
  emitYaml(OperationSchema, operation, EmitOperationError, (value) => ({
    id: value.id,
    type: value.type,
    zone: value.zone,
    composant: value.composant,
    permission: value.permission,
    resume: value.resume,
    entree: recordIf(value.entree, input),
    sortie: recordIf(value.sortie, output),
    erreurs: listIf(value.erreurs.map(failure)),
    regles: listIf(value.regles),
    sert: listIf(value.sert),
    limite: value.limite,
  }));
