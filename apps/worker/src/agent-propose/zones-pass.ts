import type { AgentProposalKind } from "@koklo/domain";
import { jsonSchemaOf, PROPOSAL_SCHEMAS } from "@koklo/schema";
import { ask, type Run, timeUp } from "./call.ts";
import { discardReasonOf } from "./errors.ts";
import { batchPrompt } from "./prompts.ts";
import type { ZonePublication } from "./store.ts";
import { triageProposals } from "./triage.ts";

type JsonSchema = Record<string, unknown>;

/** Schéma sans la propriété `specId` ; inchangé quand il ne la porte pas. */
function withoutSpecId(schema: JsonSchema): JsonSchema {
  const properties = schema.properties as JsonSchema | undefined;
  if (properties === undefined || !("specId" in properties)) return schema;
  const { specId: _posed, ...kept } = properties;
  const required = (schema.required as string[] | undefined)?.filter((key) => key !== "specId");
  return { ...schema, properties: kept, ...(required === undefined ? {} : { required }) };
}

/**
 * Schéma d'un type demandé au modèle : `specId` n'est jamais demandé (B615, B655, TK-115, TK-117), le code seul le pose,
 * même dans l'exigence d'une proposition ASVS ; celui de `criteria` désigne sa fonctionnalité et reste.
 */
function modelSchemaOf(kind: AgentProposalKind) {
  const schema = jsonSchemaOf(PROPOSAL_SCHEMAS[kind]);
  if (kind === "criteria") return schema;
  const properties = schema.properties as Record<string, JsonSchema> | undefined;
  const nested = properties?.requirement;
  if (nested === undefined) return withoutSpecId(schema);
  return { ...schema, properties: { ...properties, requirement: withoutSpecId(nested) } };
}

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

/** Livrables dont les étapes viennent du code : une étape entièrement invalide y est écartée, pas comptée traitée. */
const CHECKED_STEPS: readonly string[] = ["technical", "security"];

/** Sortie triée d'une zone ; Technique et Sécurité : toutes ses entrées invalides, l'étape est écartée (B847). */
function publicationOf(
  deliverable: string,
  zone: string,
  { invalid, ...triaged }: ReturnType<typeof triageProposals>,
): ZonePublication {
  const entries = triaged.accepted.length + triaged.discarded;
  const rejected = CHECKED_STEPS.includes(deliverable) && invalid > 0 && invalid === entries;
  return { zone, ...triaged, ...(rejected ? { reason: "output_invalid" as const } : {}) };
}

/** Une zone : la sortie triée, ou la zone écartée avec son motif (sortie coupée, refusée, invalide, prompt refusé). */
async function zoneOf(run: Run, zone: string, kinds: Run["kinds"]): Promise<ZonePublication> {
  const context = { ...run.context, kinds };
  try {
    const triaged = await ask(run, {
      purpose: "proposal-batch",
      prompt: (nonce) =>
        batchPrompt(nonce, {
          sources: run.sources,
          instruction: run.launch.instruction,
          zone,
          kinds,
          mode: run.launch.mode,
          covered: [...(context.titles.stack ?? [])],
        }),
      schema: batchSchema(kinds),
      parse: (raw) => triageProposals(raw, context),
    });
    return publicationOf(run.launch.deliverable, zone, triaged);
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
  for (const [index, zone] of [...zones.entries()].slice(start)) {
    const up = timeUp(run);
    if (up !== undefined) return up;
    const kinds = run.kindsAt?.(index, zones) ?? run.kinds;
    const publication = await zoneOf(run, zone, kinds);
    if ((await run.deps.store.publishZone(run.launch, publication)) === "stopped") return "stopped";
    await afterPublish();
  }
  return "done";
}
