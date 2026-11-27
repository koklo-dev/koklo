import { type Stack, type StackInput, StackSchema } from "../entities/index.ts";
import { EmitError } from "./errors.ts";
import { emitYaml, listIf } from "./yaml-document.ts";

export class EmitStackError extends EmitError {
  static readonly fallback = "choix technique invalide";
  constructor(message: string, path: string) {
    super("EmitStackError", message, path);
  }
}

const criterion = (value: Stack["criteres"][number]) => ({
  nom: value.nom,
  estimation: value.estimation,
  valeurs: [...value.valeurs],
});

/** Choix technique -> YAML canonique (`tech/stack/<slug>.yaml`). Relu par `parseSpecFiles`, l'émission est idempotente. */
export const emitStackYaml = (stack: Stack | StackInput): string =>
  emitYaml(StackSchema, stack, EmitStackError, (value) => ({
    id: value.id,
    couche: value.couche,
    icone: value.icone,
    role: value.role,
    statut: value.statut,
    choix: value.choix,
    recommande: value.recommande,
    composants: listIf(value.composants),
    options: [...value.options],
    criteres: listIf(value.criteres.map(criterion)),
    pourquoi: value.pourquoi,
    en_clair: value.en_clair,
    exigences: listIf(value.exigences),
    decisions: listIf(value.decisions),
  }));
