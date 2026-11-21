import { slugOf } from "@koklo/domain";
import { nextCounterValue } from "../tracker/counters.ts";
import type { Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { PreparedOperation } from "./spec-batch.repository.ts";

const numbered = (prefix: string, value: number): string =>
  `${prefix}-${String(value).padStart(3, "0")}`;

/** Identifiant d'un rôle nouveau : `RL-<slug du nom>`. Une collision est tranchée par le worker (`write_conflict`). */
export const roleIdOf = (name: unknown): string => `RL-${slugOf(name, "role")}`;
/** Identifiant d'un parcours nouveau : `P-<slug du titre>`. */
export const flowIdOf = (title: unknown): string => `P-${slugOf(title, "parcours")}`;

/** Identifiant d'une table nouvelle : `T-<slug du nom>` (B385). Une collision est tranchée par le worker (`write_conflict`). */
export const tableIdOf = (name: unknown): string => `T-${slugOf(name, "table")}`;
/** Identifiant d'un jeu d'exemple nouveau : `FX-<slug du titre>`. */
export const fixtureIdOf = (title: unknown): string => `FX-${slugOf(title, "jeu")}`;

/** Identifiant d'un composant nouveau : `C-<slug du nom>` (B514). Une collision est tranchée par le worker (`write_conflict`). */
export const componentIdOf = (name: unknown): string => `C-${slugOf(name, "composant")}`;
/** Identifiant d'une section du document nouvelle : `DOC-<slug du titre>` ; le worker pose le numéro NN du fichier. */
export const docSectionIdOf = (title: unknown): string => `DOC-${slugOf(title, "section")}`;

/**
 * Identifiant d'une création, attribué à l'enfilage : `F-nnn` et `R-nnn` par les compteurs du projet (jamais deux fois la
 * même valeur, même en concurrence), `ADR-nnn` par le compteur `adr` (TK-111), `RL-`, `P-`, `T-`, `FX-`, `C-` et `DOC-` d'après
 * le texte saisi ; un flux technique porte le `P-` du parcours qu'il détaille (`flow`).
 */
export async function createdSpecId(
  tx: Tx,
  scope: ProjectScope,
  operation: PreparedOperation,
): Promise<string> {
  const { kind, payload } = operation;
  if (kind === "rule.create") return numbered("R", await nextCounterValue(tx, scope, "rule"));
  if (kind === "role.create") return roleIdOf(payload.name);
  if (kind === "flow.create") return flowIdOf(payload.title);
  if (kind === "table.create") return tableIdOf(payload.name);
  if (kind === "fixture.create") return fixtureIdOf(payload.title);
  if (kind === "component.create") return componentIdOf(payload.name);
  if (kind === "archflow.create") return String(payload.flow ?? "");
  if (kind === "adr.create") return numbered("ADR", await nextCounterValue(tx, scope, "adr"));
  if (kind === "doc.section.create") return docSectionIdOf(payload.title);
  return numbered("F", await nextCounterValue(tx, scope, "feature"));
}
