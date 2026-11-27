import { type Threat, type ThreatInput, ThreatSchema } from "../entities/index.ts";
import { EmitSecurityError } from "./security-error.ts";
import { emitYaml, listIf } from "./yaml-document.ts";

/** Menace -> YAML canonique (`security/threats/SEC-Txx.yaml`). */
export const emitThreatYaml = (threat: Threat | ThreatInput): string =>
  emitYaml(ThreatSchema, threat, EmitSecurityError, (value) => ({
    id: value.id,
    titre: value.titre,
    surfaces: [...value.surfaces],
    categorie: value.categorie,
    gravite: value.gravite,
    risque: value.risque,
    parades: listIf(value.parades),
    verification: { mode: value.verification.mode, detail: value.verification.detail },
    scenario: value.scenario && { quand: value.scenario.quand, alors: value.scenario.alors },
    liens: listIf(value.liens),
  }));
