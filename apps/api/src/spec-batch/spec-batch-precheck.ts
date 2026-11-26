import {
  conflictsOf,
  genreOf,
  presentAtHead,
  type SpecConflictReason,
  type SpecPathIndex,
} from "@koklo/schema";
import type { PreparedOperation } from "./spec-batch.repository.ts";
import { slugSpecIdOf } from "./spec-ids.ts";

/** Opération écartée par la pré-vérification : position de l'entrée (base 0), identifiant visé (`null` : numéroté par compteur). */
export interface SkippedOperation {
  position: number;
  kind: string;
  specId: string | null;
  reason: SpecConflictReason;
  proposalId: string;
  /** TK-114g (B698) : `already_present` si tous les conflits propres de sa proposition sont `exists`, sinon `to_review`. */
  outcome: SkipOutcome;
}

export type SkipOutcome = "already_present" | "to_review";

export interface Precheck {
  /** Opérations qui partent, dans l'ordre de l'entrée. */
  kept: PreparedOperation[];
  /** Propositions des opérations qui partent, sans doublon, dans l'ordre de l'entrée. */
  keptProposalIds: string[];
  skipped: SkippedOperation[];
  /** Propositions écartées déjà présentes dans la spec (TK-114g, B698), sans doublon, dans l'ordre de l'entrée. */
  alreadyPresentProposalIds: string[];
}

/**
 * Genres vérifiés (B671) : jamais le rôle (lu dans le contenu de `domain/roles.yaml`), la mise en page (le dernier écrit
 * gagne), la table ni le jeu d'exemple (une spec v1 migrée dans le lot change leurs chemins).
 */
const CHECKED = new Set(["feature", "rule", "flow", "component", "archflow", "adr", "doc"]);

const targetOf = (operation: PreparedOperation): string | null =>
  operation.specId ?? slugSpecIdOf(operation);

/** Issue de chaque proposition en conflit : déjà présente ssi tous ses conflits propres sont `exists` (B698). */
function outcomesOf(
  conflicts: readonly { position: number; reason: SpecConflictReason }[],
  proposals: readonly string[],
): Map<string, { reason: SpecConflictReason; outcome: SkipOutcome }> {
  const byProposal = new Map<string, { reason: SpecConflictReason; outcome: SkipOutcome }>();
  for (const { position, reason } of conflicts) {
    const proposalId = proposals[position] ?? "";
    const known = byProposal.get(proposalId);
    const present =
      reason === "exists" && (known === undefined || known.outcome === "already_present");
    const outcome = present ? "already_present" : "to_review";
    byProposal.set(proposalId, { reason: known?.reason ?? reason, outcome });
  }
  return byProposal;
}

/**
 * Pré-vérification d'un enregistrement de propositions (TK-114e, B671, B672) contre l'index par chemins de la branche :
 * toute opération en conflit écarte toutes les opérations de sa proposition (`proposals[i]` : proposition de l'opération i).
 * Une opération écartée sans conflit propre porte le motif du premier conflit de sa proposition, et l'issue de celle-ci
 * (TK-114g, B698). Fonction pure.
 */
export function precheckBatch(
  operations: readonly PreparedOperation[],
  proposals: readonly string[],
  index: SpecPathIndex,
): Precheck {
  const targets = operations.map((operation) => ({
    kind: operation.kind,
    targetSpecId: targetOf(operation),
  }));
  const conflicts = conflictsOf(targets, (target) =>
    CHECKED.has(genreOf(target)) && target.targetSpecId !== null
      ? presentAtHead(index, target)
      : undefined,
  );
  const own = new Map(conflicts.map(({ position, reason }) => [position, reason]));
  const byProposal = outcomesOf(conflicts, proposals);
  const result: Precheck = {
    kept: [],
    keptProposalIds: [],
    skipped: [],
    alreadyPresentProposalIds: [],
  };
  operations.forEach((operation, position) => {
    const proposalId = proposals[position] ?? "";
    const settled = byProposal.get(proposalId);
    if (settled === undefined) {
      result.kept.push(operation);
      if (!result.keptProposalIds.includes(proposalId)) result.keptProposalIds.push(proposalId);
      return;
    }
    const { kind } = operation;
    const reason = own.get(position) ?? settled.reason;
    const { outcome } = settled;
    result.skipped.push({
      position,
      kind,
      specId: targetOf(operation),
      reason,
      proposalId,
      outcome,
    });
    const present = result.alreadyPresentProposalIds;
    if (outcome === "already_present" && !present.includes(proposalId)) present.push(proposalId);
  });
  return result;
}
