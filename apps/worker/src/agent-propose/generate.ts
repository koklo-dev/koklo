import { randomBytes } from "node:crypto";
import {
  type AgentProposalKind,
  type AiProvider,
  type FramedPrompt,
  validateLlmOutput,
} from "@koklo/domain";
import { PROPOSAL_BUDGETS, type ProposalPurpose } from "@koklo/llm";
import { jsonSchemaOf, PROPOSAL_SCHEMAS } from "@koklo/schema";
import { AgentProposeFailure, isIgnorableZoneError, OutputInvalidError } from "./errors.ts";
import { batchPrompt, zonesPrompt } from "./prompts.ts";
import type { LaunchSources } from "./sources.ts";
import type { AgentProposeStore, LaunchContext } from "./store.ts";
import { titleKey, triageProposals, zonesOf } from "./triage.ts";

export interface GenerateDeps {
  readonly store: AgentProposeStore;
  readonly ai: AiProvider;
  /** Nonce neuf à chaque appel (le domaine n'a pas d'aléa). */
  readonly nonce?: () => string;
  /** Durée maximale d'un lancement, en ms : au-delà, le lancement échoue (`timeout`), ce qui est publié reste lisible. */
  readonly deadlineMs: number;
  readonly now: () => Date;
}

const randomNonce = (): string => randomBytes(24).toString("hex");

/** Types de proposition que chaque mode du Fonctionnel demande (TK-103, B342 : règles, rôles et parcours s'y ajoutent). */
const KINDS_OF_MODE: Readonly<Record<string, readonly AgentProposalKind[]>> = {
  complete: ["feature", "rule", "role", "flow"],
  update: ["feature", "rule", "role", "flow"],
  criteria: ["criteria"],
  all: ["feature", "criteria", "rule", "role", "flow"],
};

/** Données (TK-107, B387) : `complete` et `all` demandent les mêmes trois types, les tables d'abord. */
const DATA_KINDS: readonly AgentProposalKind[] = ["table", "relations", "fixtures"];
/** Longueur maximale d'une zone des Données : celle d'une table (`table.create`). */
const DATA_ZONE_MAX = 80;

export const kindsOfMode = (
  mode: string,
  deliverable = "functional",
): readonly AgentProposalKind[] =>
  deliverable === "data" ? DATA_KINDS : (KINDS_OF_MODE[mode] ?? KINDS_OF_MODE.complete ?? []);

const ZONES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["zones"],
  properties: { zones: { type: "array", items: { type: "string" } } },
} as const;

/** Schéma demandé au fournisseur : la structure seule, les bornes sont revérifiées par Zod à la validation. */
function batchSchema(kinds: readonly AgentProposalKind[]): Record<string, unknown> {
  const contents = kinds.map((kind) => jsonSchemaOf(PROPOSAL_SCHEMAS[kind]));
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

/** Un appel au modèle : battement, appel routé, arrêt normal exigé, sortie validée par `parse`. */
async function ask<T>(
  deps: GenerateDeps,
  launch: LaunchContext,
  euOnly: boolean,
  call: {
    purpose: ProposalPurpose;
    prompt: (nonce: string) => FramedPrompt;
    schema: Record<string, unknown>;
    parse: (raw: unknown) => T;
  },
): Promise<T> {
  await deps.store.heartbeat(launch);
  const response = await deps.ai.complete({
    organizationId: launch.organizationId,
    userId: launch.requestedBy,
    usage: "spec_deliverables",
    euOnly,
    prompt: call.prompt((deps.nonce ?? randomNonce)()),
    output: { kind: "json", schema: call.schema },
    budget: PROPOSAL_BUDGETS[call.purpose],
    trace: { purpose: call.purpose, correlationId: launch.id },
  });
  if (response.stop !== "end") throw new OutputInvalidError();
  return validateLlmOutput(response.output, call.parse).value;
}

/** Références que le modèle peut viser : fonctionnalités et règles du cahier, tables du modèle actuel. */
const dataRefs = (sources: LaunchSources) => ({
  specIds: new Set([...sources.features, ...sources.rules].map((item) => item.specId)),
  // Champs d'une table actuelle : au plus 100 lus (dossier-sources) ; au plafond, la liste peut être tronquée : non contrôlée.
  tables: new Map<string, ReadonlySet<string> | null>(
    (sources.tables ?? []).map((table) => [
      table.specId,
      table.fields.length >= 100 ? null : new Set(table.fields),
    ]),
  ),
});

/**
 * Déroulé d'un lancement : étape 1, les zones (douze au plus) ; étape 2, une zone par appel, chaque zone validée
 * publiée aussitôt. Retourne `false` si le lancement a été arrêté de l'extérieur (annulé, repris). Une zone dont
 * la sortie ou le prompt est refusé est ignorée et comptée ; toute autre erreur interrompt le lancement.
 */
export async function generate(
  deps: GenerateDeps,
  launch: LaunchContext,
  sources: LaunchSources,
  euOnly: boolean,
): Promise<boolean> {
  const kinds = kindsOfMode(launch.mode, launch.deliverable);
  const isData = launch.deliverable === "data";
  const started = deps.now().getTime();
  const zones = await ask(deps, launch, euOnly, {
    purpose: "proposal-zones",
    prompt: (nonce) => zonesPrompt(nonce, sources, launch.instruction),
    schema: ZONES_SCHEMA,
    parse: (raw) => (isData ? zonesOf(raw, DATA_ZONE_MAX) : zonesOf(raw)),
  });
  const context = {
    kinds,
    titles: {
      feature: new Set(sources.features.map((feature) => titleKey(feature.title))),
      rule: new Set(sources.rules.map((rule) => titleKey(rule.title))),
      role: new Set(sources.roles.map((role) => titleKey(role.title))),
      flow: new Set(sources.flows.map((flow) => titleKey(flow.title))),
      table: new Set((sources.tables ?? []).map((table) => titleKey(table.title))),
      fixtures: new Set((sources.fixtures ?? []).map((fixture) => titleKey(fixture.title))),
    },
    ...(isData ? { refs: dataRefs(sources) } : {}),
    missingCriteria: new Map(
      sources.features
        .filter((feature) => feature.criteria.length === 0)
        .map((feature) => [feature.specId, feature.title] as const),
    ),
  };
  for (const zone of zones) {
    if (deps.now().getTime() - started > deps.deadlineMs) throw new AgentProposeFailure("timeout");
    const triaged = await ask(deps, launch, euOnly, {
      purpose: "proposal-batch",
      prompt: (nonce) =>
        batchPrompt(nonce, { sources, instruction: launch.instruction, zone, kinds }),
      schema: batchSchema(kinds),
      parse: (raw) => triageProposals(raw, context),
    }).catch((error: unknown) => {
      if (isIgnorableZoneError(error)) return { accepted: [], discarded: 1 };
      throw error;
    });
    const outcome = await deps.store.publishZone(launch, zone, triaged.accepted, triaged.discarded);
    if (outcome === "stopped") return false;
  }
  return true;
}
