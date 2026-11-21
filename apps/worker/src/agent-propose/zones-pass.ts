import type { AgentProposalKind } from "@koklo/domain";
import { componentProposalSchema, jsonSchemaOf, PROPOSAL_SCHEMAS } from "@koklo/schema";
import { ask, type Run, timeUp } from "./call.ts";
import { discardReasonOf } from "./errors.ts";
import { batchPrompt } from "./prompts.ts";
import type { ZonePublication } from "./store.ts";
import { triageProposals } from "./triage.ts";

/** Schéma d'un type demandé au modèle : `specId` n'est jamais demandé (B615), le code seul le pose. */
const modelSchemaOf = (kind: AgentProposalKind) =>
  kind === "component"
    ? jsonSchemaOf(componentProposalSchema.omit({ specId: true }))
    : jsonSchemaOf(PROPOSAL_SCHEMAS[kind]);

/** Schéma demandé au fournisseur : la structure seule, les bornes sont revérifiées par Zod à la validation. */
export function batchSchema(kinds: readonly AgentProposalKind[]): Record<string, unknown> {
  const contents = kinds.map(modelSchemaOf);
  return {
    type: "object",
    additionalProperties: false,
    required: ["proposals"],
    properties: {
      proposals: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "rationale", "content"],
          properties: {
            kind: { type: "string", enum: kinds },
            rationale: { type: "string" },
            content: contents.length === 1 ? contents[0] : { anyOf: contents },
          },
        },
      },
    },
  };
}

export type ZonesOutcome = "done" | "stopped" | "handoff" | "deadline";

/** Une zone : la sortie triée, ou la zone écartée avec son motif (sortie coupée, refusée, invalide, prompt refusé). */
async function zoneOf(run: Run, zone: string): Promise<ZonePublication> {
  try {
    const triaged = await ask(run, {
      purpose: "proposal-batch",
      prompt: (nonce) =>
        batchPrompt(nonce, {
          sources: run.sources,
          instruction: run.launch.instruction,
          zone,
          kinds: run.kinds,
        }),
      schema: batchSchema(run.kinds),
      parse: (raw) => triageProposals(raw, run.context),
    });
    return { zone, ...triaged };
  } catch (error) {
    const reason = discardReasonOf(error);
    if (reason === undefined) throw error;
    return { zone, accepted: [], discarded: 1, reason };
  }
}

/**
 * Étape 2 : une zone par appel, à partir de la première non traitée (reprise d'un segment), chaque zone publiée aussitôt.
 * Le temps du segment est vérifié avant chaque appel. `afterPublish` tient la couverture à jour (Architecture).
 */
export async function zonesPass(
  run: Run,
  zones: readonly string[],
  afterPublish: () => Promise<void>,
): Promise<ZonesOutcome> {
  const start = run.progress.zonesDone + run.progress.zonesDiscarded;
  for (const zone of zones.slice(start)) {
    const up = timeUp(run);
    if (up !== undefined) return up;
    const publication = await zoneOf(run, zone);
    if ((await run.deps.store.publishZone(run.launch, publication)) === "stopped") return "stopped";
    await afterPublish();
  }
  return "done";
}
