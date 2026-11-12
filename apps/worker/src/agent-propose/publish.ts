import { AGENT_PROPOSE_LIMITS } from "@koklo/domain";
import type { LaunchContext } from "./store.ts";
import type { Candidate } from "./triage.ts";

/** Ligne de `agent_proposals` à écrire : toutes `pending`, `position` croissante dans le lancement. */
export interface ProposalRow {
  readonly organizationId: string;
  readonly projectId: string;
  readonly launchId: string;
  readonly deliverable: string;
  readonly kind: string;
  readonly zone: string;
  readonly position: number;
  readonly title: string;
  readonly rationale: string;
  readonly payload: Record<string, unknown>;
  readonly status: "pending";
}

/**
 * Lignes d'une zone, à la suite de ce qui est déjà publié. Le plafond du lancement (500) coupe l'excédent, écarté
 * et compté. Le worker n'écrit que ces lignes : jamais la spec, jamais `spec_write_batches`.
 */
export function rowsOf(
  launch: LaunchContext,
  zone: string,
  candidates: readonly Candidate[],
  published: number,
): { rows: ProposalRow[]; overflow: number } {
  const room = Math.max(0, AGENT_PROPOSE_LIMITS.perLaunch - published);
  const kept = candidates.slice(0, room);
  return {
    overflow: candidates.length - kept.length,
    rows: kept.map((candidate, index) => ({
      organizationId: launch.organizationId,
      projectId: launch.projectId,
      launchId: launch.id,
      deliverable: launch.deliverable,
      kind: candidate.kind,
      zone,
      position: published + index,
      title: candidate.title,
      rationale: candidate.rationale,
      payload: candidate.payload,
      status: "pending",
    })),
  };
}
