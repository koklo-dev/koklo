import { emitThreatYaml, SECURITY_PROPOSAL_VOCABULARY, type Threat } from "@koklo/schema";
import { overlaid, readEntity, wordOf, writeEntity } from "./technical-files.ts";
import type { BatchOperation } from "./types.ts";
import { forbidDesigner, removeFile, type Workspace } from "./workspace.ts";

type Words = typeof SECURITY_PROPOSAL_VOCABULARY;

/** Champs d'une opération `threat.create|update` (contrat 3.19.0), tous facultatifs ici. */
interface ThreatPayload {
  title?: string;
  surfaces?: Threat["surfaces"];
  category?: keyof Words["category"];
  severity?: keyof Words["severity"];
  risk?: string;
  measures?: string[];
  verification?: keyof Words["verification"];
  /** Vide : retiré. */
  verificationDetail?: string;
  scenario?: { when: string; expected: string };
  links?: Threat["liens"];
}

export const threatPathOf = (id: string): string => `security/threats/${id}.yaml`;

function verificationOf(base: Threat["verification"], payload: ThreatPayload) {
  const detail = payload.verificationDetail ?? base.detail;
  const mode = wordOf(SECURITY_PROPOSAL_VOCABULARY.verification, payload.verification) ?? base.mode;
  return detail ? { mode, detail } : { mode };
}

function overlay(base: Threat, payload: ThreatPayload): Threat {
  const words = SECURITY_PROPOSAL_VOCABULARY;
  const { scenario } = payload;
  return overlaid(base, {
    titre: payload.title,
    surfaces: payload.surfaces,
    categorie: wordOf(words.category, payload.category),
    gravite: wordOf(words.severity, payload.severity),
    risque: payload.risk,
    parades: payload.measures,
    verification: verificationOf(base.verification, payload),
    scenario: scenario && { quand: scenario.when, alors: scenario.expected },
    liens: payload.links,
  });
}

const emptyThreat = (id: string): Threat => ({
  id,
  titre: "",
  surfaces: [],
  categorie: "abus",
  gravite: "moyenne",
  risque: "",
  parades: [],
  verification: { mode: "scenario" },
  liens: [],
});

/** `threat.create|update|delete` : `path` est le fichier de la menace sur la tête (vide à la création). */
export function applyThreat(
  workspace: Workspace,
  operation: BatchOperation,
  path: string | undefined,
): void {
  forbidDesigner(workspace);
  const id = operation.targetSpecId ?? "";
  const payload = operation.payload as ThreatPayload;
  if (operation.kind === "threat.create") {
    const next = overlay(emptyThreat(id), payload);
    writeEntity(workspace, threatPathOf(id), id, () => emitThreatYaml(next));
  } else if (path !== undefined && operation.kind === "threat.delete") {
    removeFile(workspace, path);
  } else if (path !== undefined) {
    const current = readEntity(workspace, path, (spec) => spec.threats);
    writeEntity(workspace, path, id, () => emitThreatYaml(overlay(current, payload)));
  }
}
