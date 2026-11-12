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

/**
 * Identifiant d'une création, attribué à l'enfilage : `F-nnn` et `R-nnn` par les compteurs du projet (jamais deux fois la
 * même valeur, même en concurrence), `RL-` et `P-` d'après le texte saisi.
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
  return numbered("F", await nextCounterValue(tx, scope, "feature"));
}
