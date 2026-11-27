import {
  type AsvsFile,
  type AsvsLevel,
  type AsvsRequirement,
  emitAsvsYaml,
  SECURITY_PROPOSAL_VOCABULARY,
} from "@koklo/schema";
import { overlaid, readEntity, wordOf, writeEntity } from "./technical-files.ts";
import { type BatchOperation, conflicted } from "./types.ts";
import { forbidDesigner, stop, type Workspace } from "./workspace.ts";

export const ASVS_PATH = "security/asvs.yaml";
const NUMBERED = /^EX-(\d+)$/;

/** Charge d'une opération `asvs.set_level|create|update` (contrat 3.19.0). */
interface AsvsPayload {
  level?: AsvsLevel;
  requirementId?: string;
  chapter?: keyof (typeof SECURITY_PROPOSAL_VOCABULARY)["chapter"];
  title?: string;
  answer?: string;
  links?: AsvsRequirement["liens"];
  facts?: { label: string; value: string }[];
}

export const readAsvs = (workspace: Workspace): AsvsFile =>
  workspace.files.has(ASVS_PATH)
    ? readEntity(workspace, ASVS_PATH, (spec) => spec.asvs)
    : { exigences: [], secrets_et_dependances: [] };

/** Identifiant d'une exigence ajoutée sans identifiant : `EX-nnn`, après le plus grand pris (B817). */
function nextId(requirements: readonly AsvsRequirement[]): string {
  const taken = requirements.map((entry) => Number(NUMBERED.exec(entry.id)?.[1] ?? 0));
  return `EX-${String(Math.max(0, ...taken) + 1).padStart(3, "0")}`;
}

const overlay = (base: AsvsRequirement, payload: AsvsPayload): AsvsRequirement =>
  overlaid(base, {
    chapitre: wordOf(SECURITY_PROPOSAL_VOCABULARY.chapter, payload.chapter),
    titre: payload.title,
    niveau: payload.level,
    reponse: payload.answer,
    liens: payload.links,
  });

function created(file: AsvsFile, payload: AsvsPayload): AsvsFile {
  const base: AsvsRequirement = {
    id: payload.requirementId ?? nextId(file.exigences),
    chapitre: "api",
    titre: "",
    niveau: 1,
  };
  return { ...file, exigences: [...file.exigences, overlay(base, payload)] };
}

/** Faits « Secrets et dépendances » : ajoutés ou remplacés par leur libellé. */
function withFacts(file: AsvsFile, facts: NonNullable<AsvsPayload["facts"]>): AsvsFile {
  const byLabel = new Map(file.secrets_et_dependances.map((fact) => [fact.libelle, fact]));
  for (const { label, value } of facts) byLabel.set(label, { libelle: label, valeur: value });
  return { ...file, secrets_et_dependances: [...byLabel.values()] };
}

function updated(file: AsvsFile, payload: AsvsPayload): AsvsFile {
  if (payload.facts !== undefined) return withFacts(file, payload.facts);
  const id = payload.requirementId;
  if (!file.exigences.some((entry) => entry.id === id)) {
    return stop(conflicted("write_conflict"));
  }
  const exigences = file.exigences.map((entry) =>
    entry.id === id ? overlay(entry, payload) : entry,
  );
  return { ...file, exigences };
}

function asvsAfter(file: AsvsFile, { kind, payload }: BatchOperation): AsvsFile {
  const values = payload as AsvsPayload;
  if (kind === "asvs.set_level") return { ...file, niveau: values.level };
  return kind === "asvs.create" ? created(file, values) : updated(file, values);
}

/** `asvs.*` sur `security/asvs.yaml` : le niveau n'est écrit que par un choix (A6). */
export function applyAsvs(workspace: Workspace, operation: BatchOperation): void {
  forbidDesigner(workspace);
  const next = asvsAfter(readAsvs(workspace), operation);
  writeEntity(workspace, ASVS_PATH, "asvs", () => emitAsvsYaml(next));
}
