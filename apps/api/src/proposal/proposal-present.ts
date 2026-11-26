import type { AgentProposalKind } from "@koklo/domain";
import { presentAtHead, type SpecPathIndex, type SpecPathOperation } from "@koklo/schema";
import { componentIdOf, docSectionIdOf, flowIdOf } from "../spec-batch/spec-ids.ts";
import type { ProposalRecord } from "./proposal.repository.ts";

/** Ce qu'il faut d'une proposition pour savoir si sa création est déjà dans la spec. */
export type PresentCandidate = Pick<ProposalRecord, "id" | "payload"> & { kind: string };

/** Création visée : le `kind` d'opération de l'enregistrement et l'identifiant qu'elle prendrait. */
export interface PresentTarget extends SpecPathOperation {
  readonly targetSpecId: string;
}

const str = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * Mise à jour d'un composant (`C-`, B615) ou flux repris (`P-`, B659) : `specId` posé par le worker seul, comme le web
 * (`apps/web/src/lib/proposal-architecture.ts`) ; ce n'est pas une création.
 */
const UPDATE_ID: Partial<Record<string, RegExp>> = {
  component: /^C-[a-z0-9][a-z0-9-]*$/,
  archflow: /^P-[a-z0-9][a-z0-9-]*$/,
};

const TARGETS: Partial<
  Record<AgentProposalKind, (content: Record<string, unknown>) => PresentTarget | null>
> = {
  doc_section: (c) => ({ kind: "doc.section.create", targetSpecId: docSectionIdOf(c.title) }),
  component: (c) => ({ kind: "component.create", targetSpecId: componentIdOf(c.name) }),
  archflow: (c) =>
    str(c.flow) === "" ? null : { kind: "archflow.create", targetSpecId: str(c.flow) },
  flow: (c) => ({ kind: "flow.create", targetSpecId: flowIdOf(c.title) }),
};

/** Types dont une création peut être réglée « déjà présente » (TK-114g, B699). */
export const PRESENT_KINDS = Object.keys(TARGETS) as AgentProposalKind[];

/** Création visée par la proposition (TK-114g, B699) ; `null` pour une mise à jour ou un type jamais vérifié. */
export function presentTargetOf(record: PresentCandidate): PresentTarget | null {
  const target = TARGETS[record.kind as AgentProposalKind];
  if (target === undefined) return null;
  if (UPDATE_ID[record.kind]?.test(str(record.payload.specId))) return null;
  return target(record.payload);
}

/** Propositions dont la création est déjà à la tête de `index`, dans l'ordre de l'entrée. Fonction pure. */
export const alreadyPresentIds = (
  records: readonly PresentCandidate[],
  index: SpecPathIndex,
): string[] =>
  records.flatMap((record) => {
    const target = presentTargetOf(record);
    return target !== null && presentAtHead(index, target) === true ? [record.id] : [];
  });
