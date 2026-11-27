import { type Nfr, type NfrInput, NfrSchema } from "../entities/index.ts";
import { EmitError } from "./errors.ts";
import { emitYaml, listIf } from "./yaml-document.ts";

export class EmitNfrError extends EmitError {
  static readonly fallback = "exigence invalide";
  constructor(message: string, path: string) {
    super("EmitNfrError", message, path);
  }
}

/** Exigence -> YAML canonique (`nfr/NFR-nnn.yaml`). */
export const emitNfrYaml = (nfr: Nfr | NfrInput): string =>
  emitYaml(NfrSchema, nfr, EmitNfrError, (value) => ({
    id: value.id,
    categorie: value.categorie,
    titre: value.titre,
    cible: value.cible,
    enonce: value.enonce,
    verification: { mode: value.verification.mode, detail: value.verification.detail },
    liens: listIf(value.liens),
  }));
