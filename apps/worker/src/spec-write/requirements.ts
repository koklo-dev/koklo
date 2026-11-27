import { emitNfrYaml, type Nfr, TECHNICAL_PROPOSAL_VOCABULARY } from "@koklo/schema";
import { overlaid, readEntity, wordOf, writeEntity } from "./technical-files.ts";
import type { BatchOperation } from "./types.ts";
import { forbidDesigner, removeFile, type Workspace } from "./workspace.ts";

type Words = typeof TECHNICAL_PROPOSAL_VOCABULARY;

/** Champs d'une opération `nfr.create|update` (contrat 3.17.0), tous facultatifs ici. */
interface NfrPayload {
  category?: keyof Words["category"];
  title?: string;
  target?: string;
  statement?: string;
  verification?: keyof Words["verification"];
  verificationDetail?: string;
  links?: string[];
}

/** Chemin d'une exigence nouvelle : `nfr/NFR-nnn.yaml`. */
export const nfrPathOf = (id: string): string => `nfr/${id}.yaml`;

function overlay(base: Nfr, payload: NfrPayload): Nfr {
  const words = TECHNICAL_PROPOSAL_VOCABULARY;
  return overlaid(base, {
    categorie: wordOf(words.category, payload.category),
    titre: payload.title,
    cible: payload.target,
    enonce: payload.statement,
    verification: overlaid(base.verification, {
      mode: wordOf(words.verification, payload.verification),
      detail: payload.verificationDetail,
    }),
    liens: payload.links,
  });
}

const emptyNfr = (id: string): Nfr => ({
  id,
  categorie: "performance",
  titre: "",
  cible: "",
  enonce: "",
  verification: { mode: "a_definir" },
  liens: [],
});

/** `nfr.create|update|delete` : `path` est le fichier de l'exigence sur la tête (vide à la création). */
export function applyRequirement(
  workspace: Workspace,
  operation: BatchOperation,
  path: string | undefined,
): void {
  forbidDesigner(workspace);
  const id = operation.targetSpecId ?? "";
  const payload = operation.payload as NfrPayload;
  if (operation.kind === "nfr.create") {
    const next = overlay(emptyNfr(id), payload);
    writeEntity(workspace, nfrPathOf(id), id, () => emitNfrYaml(next));
  } else if (path !== undefined && operation.kind === "nfr.delete") {
    removeFile(workspace, path);
  } else if (path !== undefined) {
    const current = readEntity(workspace, path, (spec) => spec.nfrs);
    writeEntity(workspace, path, id, () => emitNfrYaml(overlay(current, payload)));
  }
}
