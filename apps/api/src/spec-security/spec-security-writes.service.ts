import type {
  SecurityDataClassifyInput,
  SpecBatchOutput,
  SpecBatchSubmitInput,
  ThreatCreateInput,
  ThreatUpdateInput,
} from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import {
  PROPOSAL_REPOSITORY,
  type ProposalRecord,
  type ProposalRepository,
} from "../proposal/proposal.repository.ts";
import { validContent } from "../proposal/proposal-content.ts";
import { SpecBatchService } from "../spec-batch/spec-batch.service.ts";
import { conflict, notFound, orNotFound, validation } from "../tracker/api-errors.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { SpecSecurityService } from "./spec-security.service.ts";

type Operation = SpecBatchSubmitInput["operations"][number];

/** Enveloppe d'un lot d'une page : tout le reste de l'entrée est la charge de l'opération. */
interface Envelope {
  projectId: string;
  idempotencyKey: string;
  branch?: string | undefined;
  baseSha?: string | undefined;
}

const envelopeOf = ({ projectId, idempotencyKey, branch, baseSha }: Envelope) => ({
  projectId,
  idempotencyKey,
  ...(branch === undefined ? {} : { branch }),
  ...(baseSha === undefined ? {} : { baseSha }),
});

const fieldsOf = <T extends Envelope>(input: T) => {
  const { projectId, idempotencyKey, branch, baseSha, ...fields } = input;
  return fields;
};

/**
 * Écritures de la page Sécurité (B807) : chacune soumet un lot d'une seule opération par le chemin ordinaire, comme
 * « Choisir ». La cible d'une modification doit exister sur la branche du lot (404 sinon).
 */
@Injectable()
export class SpecSecurityWritesService {
  constructor(
    @Inject(SpecSecurityService) private readonly reads: SpecSecurityService,
    @Inject(SpecBatchService) private readonly batches: SpecBatchService,
    @Inject(PROPOSAL_REPOSITORY) private readonly proposals: ProposalRepository,
  ) {}

  private submit(
    scope: ProjectScope,
    role: string,
    input: Envelope,
    operation: Record<string, unknown>,
    proposalIds?: string[],
  ): Promise<SpecBatchOutput> {
    return this.batches.submit(scope, role, {
      ...envelopeOf(input),
      operations: [operation as Operation],
      ...(proposalIds === undefined ? {} : { proposalIds }),
    });
  }

  createThreat(scope: ProjectScope, role: string, input: ThreatCreateInput) {
    return this.submit(scope, role, input, { kind: "threat.create", ...fieldsOf(input) });
  }

  async updateThreat(scope: ProjectScope, role: string, input: ThreatUpdateInput) {
    const { threatId, ...fields } = fieldsOf(input);
    await this.reads.threat(scope, { branch: input.branch }, threatId);
    return this.submit(scope, role, input, {
      kind: "threat.update",
      specId: threatId,
      ...fields,
    });
  }

  /** « Classer » ou « Décider » : une entrée nouvelle, ou l'entrée dont `id` est le premier champ. */
  async classify(scope: ProjectScope, role: string, input: SecurityDataClassifyInput) {
    const { id, ...fields } = fieldsOf(input);
    if (id === undefined) {
      return this.submit(scope, role, input, { kind: "sensitive.create", ...fields });
    }
    await this.reads.entry(scope, { branch: input.branch }, id);
    return this.submit(scope, role, input, { kind: "sensitive.update", specId: id, ...fields });
  }

  setLevel(scope: ProjectScope, role: string, input: Envelope & { level: number }) {
    return this.submit(scope, role, input, { kind: "asvs.set_level", level: input.level });
  }

  /** La proposition de résumé du projet, encore applicable. */
  private async summaryProposal(scope: ProjectScope, id: string): Promise<ProposalRecord> {
    const current = orNotFound(await this.proposals.find(scope, id));
    if (current.deliverable !== "security" || current.kind !== "summary") {
      throw validation("proposalId", "Cette proposition ne porte pas le résumé client.");
    }
    if (current.appliedBatchId !== null) throw conflict("proposal_applied");
    if (current.discardReason !== null) throw conflict("proposal_already_present");
    return current;
  }

  /** « Accepter » dans l'onglet Résumé : la proposition est acceptée et part dans un lot d'une `summary.update`. */
  async acceptSummary(scope: ProjectScope, role: string, input: Envelope & { proposalId: string }) {
    const current = await this.summaryProposal(scope, input.proposalId);
    const { payload } = validContent("summary", current.payload, "proposalId", current.title);
    const outcome = await this.proposals.decide(scope, current.id, "accept", undefined);
    if (outcome.kind === "missing") throw notFound();
    if (outcome.kind !== "decided") throw conflict("proposal_applied");
    return this.submit(scope, role, input, { kind: "summary.update", ...payload }, [current.id]);
  }
}
