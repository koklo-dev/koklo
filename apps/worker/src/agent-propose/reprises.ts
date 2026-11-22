import type { CurrentArchflow } from "@koklo/db";
import { AGENT_PROPOSE_LIMITS } from "@koklo/domain";
import {
  archflowProposalSchema,
  closesSyncCycle,
  DIRECT_COMPONENT_TYPES,
  entryAppsOf,
  exchangesOf,
  isDirectFlow,
  isRoleId,
  roleSideOf,
} from "@koklo/schema";
import { recordsOf, stringsOf } from "../job-support.ts";
import { type Additions, emptyAdditions, type Plan, pushTo, targetAdditions } from "./additions.ts";
import {
  actorsById,
  type CoverageCounts,
  type CoverageIndex,
  coverageComponentsOf,
  coverageOf,
  type Dependency,
  dependenciesById,
  fileItemsOf,
  flowsOf,
  knownComponents,
  liveProposals,
  type PublishedProposal,
  type RepriseCount,
  type RepriseSkipReason,
} from "./coverage.ts";
import { graphOf } from "./links.ts";
import { targetOf } from "./tables.ts";
import type { Candidate } from "./triage.ts";

/**
 * Flux repris (TK-114d, B655 à B658) : par le code, sans appel au modèle. Chaque message entre un rôle et un composant
 * `service`, `store` ou `queue` passe par l'application d'entrée du rôle : rôle → application (texte, retour) puis
 * application → composant (texte, retour, erreur) ; l'inverse : composant → application puis application → rôle. Le flux
 * repris est une proposition `archflow` qui porte le `specId` du flux indexé, relue par l'équipe ; jamais d'écriture directe.
 * Pur, sans I/O.
 */
export const REPRISE_RATIONALE = "Flux repris pour passer par l'application d'entrée.";
/** Zone de ligne d'un flux technique proposé par la couverture ou repris. */
export const ARCHFLOW_ZONE = "Flux techniques";
/** Canal d'une dépendance application → composant née d'une reprise (B657). */
export const CALL_VIA = "appel";

type Message = Record<string, unknown>;

export interface RepriseContext {
  /** Type de chaque composant connu (index, lancement, même réponse). */
  readonly types: ReadonlyMap<string, string>;
  /** Applications d'entrée de chaque rôle, dans l'ordre de `entryAppsOf`. */
  readonly entryApps: ReadonlyMap<string, readonly string[]>;
}

export interface Call {
  readonly app: string;
  readonly to: string;
}

export type Rewrite =
  | { readonly payload: Record<string, unknown>; readonly calls: readonly Call[] }
  | { readonly reason: Exclude<RepriseSkipReason, "cap"> };

const itemsOf = (payload: Record<string, unknown>): Message[] => recordsOf(payload.messages);

/** Rôle et composant direct d'un message, sinon `undefined`. */
function directSide(message: Message, types: ReadonlyMap<string, string>) {
  const side = roleSideOf({ de: String(message.from), vers: String(message.to) });
  return side !== undefined && DIRECT_COMPONENT_TYPES.has(types.get(side.component) ?? "")
    ? side
    : undefined;
}

/** Application de chaque rôle direct du flux : celle du flux avec laquelle il échange, sinon sa première d'entrée. */
function appsOfFlow(payload: Record<string, unknown>, context: RepriseContext) {
  const exchanges = exchangesOf(fileItemsOf(payload.messages));
  const apps = new Map<string, string | undefined>();
  for (const exchange of exchanges) {
    const side = roleSideOf(exchange);
    if (side === undefined || !DIRECT_COMPONENT_TYPES.has(context.types.get(side.component) ?? ""))
      continue;
    const inFlow = exchanges
      .map(roleSideOf)
      .find((other) => other?.role === side.role && context.types.get(other.component) === "app");
    apps.set(side.role, inFlow?.component ?? context.entryApps.get(side.role)?.[0]);
  }
  return apps;
}

const optional = (message: Message, key: "reply" | "error") =>
  typeof message[key] === "string" ? { [key]: message[key] } : {};

/** Un message direct devient deux messages par l'application ; tout autre message est inchangé. */
function splitMessage(
  message: Message,
  apps: ReadonlyMap<string, string | undefined>,
  calls: Call[],
  types: ReadonlyMap<string, string>,
): Message[] {
  const side = directSide(message, types);
  const app = side === undefined ? undefined : apps.get(side.role);
  if (side === undefined || app === undefined) return [message];
  calls.push({ app, to: side.component });
  const { from, to, text } = message;
  if (isRoleId(String(from))) {
    return [
      { from, to: app, text, ...optional(message, "reply") },
      { from: app, to, text, ...optional(message, "reply"), ...optional(message, "error") },
    ];
  }
  return [
    { from, to: app, text, ...optional(message, "reply"), ...optional(message, "error") },
    { from: app, to, text, ...optional(message, "reply") },
  ];
}

/** Participants : chaque application ajoutée juste après son rôle. */
function participantsWith(
  participants: readonly string[],
  apps: ReadonlyMap<string, string | undefined>,
): string[] {
  const out = [...participants];
  for (const [role, app] of apps) {
    if (app === undefined || out.includes(app)) continue;
    const at = out.indexOf(role);
    out.splice(at < 0 ? out.length : at + 1, 0, app);
  }
  return out;
}

/** Toutes les extrémités des messages sont déclarées dans les participants. */
function endsDeclared(payload: Record<string, unknown>): boolean {
  const declared = new Set(stringsOf(payload.participants));
  return exchangesOf(fileItemsOf(payload.messages)).every(
    (m) => declared.has(m.de) && declared.has(m.vers),
  );
}

/**
 * Flux réécrit pour passer par l'application d'entrée (B655, B658) : `undefined` si aucun message n'est direct ; motif
 * `no_entry_app` si un rôle direct n'a pas d'application, `too_long` si le flux repris dépasse `archflowProposalSchema`
 * (12 participants, 60 éléments, 20 messages par `alt`).
 */
export function rewriteFlow(
  payload: Record<string, unknown>,
  context: RepriseContext,
): Rewrite | undefined {
  const apps = appsOfFlow(payload, context);
  if (apps.size === 0) return undefined;
  if ([...apps.values()].some((app) => app === undefined)) return { reason: "no_entry_app" };
  const calls: Call[] = [];
  const split = (message: Message) => splitMessage(message, apps, calls, context.types);
  const messages = itemsOf(payload).flatMap((item) =>
    typeof item.block === "string"
      ? [
          item.block === "alt"
            ? { ...item, messages: recordsOf(item.messages).flatMap(split) }
            : item,
        ]
      : split(item),
  );
  const next = {
    ...payload,
    participants: participantsWith(stringsOf(payload.participants), apps),
    messages,
  };
  const parsed = archflowProposalSchema.safeParse(next);
  if (!parsed.success || !endsDeclared(parsed.data)) return { reason: "too_long" };
  return { payload: parsed.data, calls };
}

/** Charge de proposition d'un flux indexé : listes vides omises. */
function payloadOf(flow: CurrentArchflow): Record<string, unknown> {
  const listIf = (key: string, values: readonly string[] | undefined) =>
    values !== undefined && values.length > 0 ? { [key]: [...values] } : {};
  return {
    specId: flow.specId,
    flow: flow.specId,
    participants: [...(flow.participants ?? [])],
    messages: (flow.messages ?? []).map((item) => ({ ...item })),
    ...listIf("features", flow.features),
    ...listIf("rules", flow.rules),
    ...listIf("decisions", flow.decisions),
  };
}

/** Contexte d'une réécriture : types et applications d'entrée sur l'index et le lancement (non refusé). */
export function repriseContextOf(
  index: CoverageIndex,
  proposals: readonly PublishedProposal[],
): RepriseContext {
  const components = coverageComponentsOf(index, proposals).map(({ value }) => value);
  return {
    types: new Map(knownComponents(index, proposals).map(({ specId, type }) => [specId, type])),
    entryApps: entryAppsOf(components, [...flowsOf(index, proposals).values()]),
  };
}

/** Flux indexés directs (B652), dans l'ordre de l'index. */
function directIndexed(
  index: CoverageIndex,
  types: ReadonlyMap<string, string>,
): CurrentArchflow[] {
  return (index.technicalFlows ?? []).filter((flow) =>
    isDirectFlow({ id: flow.specId, messages: fileItemsOf(flow.messages) }, types),
  );
}

/** Parcours déjà repris dans le lancement (tous statuts : une reprise refusée n'est jamais reproposée). */
const reprisedOf = (proposals: readonly PublishedProposal[], live = false): Set<string> =>
  new Set(
    (live ? liveProposals(proposals) : proposals).flatMap(({ kind, payload }) =>
      kind === "archflow" && typeof payload.specId === "string" ? [payload.specId] : [],
    ),
  );

const SKIP_ORDER: readonly RepriseSkipReason[] = ["too_long", "no_entry_app", "cap"];

/** Compteur des flux repris (B660) : `total` = flux directs de l'index, `covered` = ceux repris (non refusés). */
export function repriseCountOf(
  index: CoverageIndex,
  proposals: readonly PublishedProposal[],
  skipped?: ReadonlyMap<RepriseSkipReason, number>,
): RepriseCount {
  const types = repriseContextOf(index, proposals).types;
  const direct = directIndexed(index, types);
  const live = reprisedOf(proposals, true);
  const reasons = SKIP_ORDER.flatMap((reason) => {
    const count = skipped?.get(reason) ?? 0;
    return count > 0 ? [{ reason, count }] : [];
  });
  return {
    covered: direct.filter((flow) => live.has(flow.specId)).length,
    total: direct.length,
    ...(reasons.length > 0 ? { skipped: reasons } : {}),
  };
}

/** Compteurs du bilan : la couverture et les flux repris. */
export const coverageCountsOf = (
  index: CoverageIndex,
  proposals: readonly PublishedProposal[],
  skipped?: ReadonlyMap<RepriseSkipReason, number>,
): CoverageCounts => ({
  ...coverageOf(index, proposals).counts,
  reprises: repriseCountOf(index, proposals, skipped),
});

/** Dépendances application → composant (B657) : `{ to, via: "appel" }` absente et sans cycle synchrone. */
function callDependencies(
  calls: readonly Call[],
  current: ReadonlyMap<string, readonly Dependency[]>,
  additions: Additions,
): void {
  const graph = graphOf(current);
  for (const { app, to } of calls) {
    const deps = [...(current.get(app) ?? []), ...(additions.dependsOn.get(app) ?? [])];
    if (deps.some((dep) => dep.to === to) || closesSyncCycle(graph, app, to)) continue;
    pushTo(additions.dependsOn, app, { to, via: CALL_VIA });
    graph.set(app, [...(graph.get(app) ?? []), to]);
  }
}

const repriseCandidate = (payload: Record<string, unknown>): Candidate => ({
  kind: "archflow",
  title: String(payload.flow),
  rationale: REPRISE_RATIONALE,
  zone: ARCHFLOW_ZONE,
  payload,
});

export interface ReprisePlan {
  readonly plan: Plan;
  readonly skipped: Map<RepriseSkipReason, number>;
}

/**
 * Reprises d'un lancement (B655, B657) : chaque flux direct de l'index pas encore repris, au plus 60 reprises par lancement
 * et 500 propositions ; motifs d'écart comptés. Les dépendances nées des appels s'écrivent comme B636.
 */
export function reprisePlan(
  index: CoverageIndex,
  proposals: readonly PublishedProposal[],
): ReprisePlan {
  const context = repriseContextOf(index, proposals);
  const done = reprisedOf(proposals);
  const plan: Plan = { creations: [], complements: [] };
  const skipped = new Map<RepriseSkipReason, number>();
  const skip = (reason: RepriseSkipReason) => skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
  const current = dependenciesById(index, proposals);
  const additions = emptyAdditions();
  const limits = AGENT_PROPOSE_LIMITS;
  for (const flow of directIndexed(index, context.types).filter((f) => !done.has(f.specId))) {
    const rewrite = rewriteFlow(payloadOf(flow), context);
    if (rewrite === undefined) continue;
    if ("reason" in rewrite) skip(rewrite.reason);
    else if (
      done.size + plan.creations.length >= limits.coverage.reprises ||
      proposals.length + plan.creations.length >= limits.perLaunch
    )
      skip("cap");
    else {
      plan.creations.push(repriseCandidate(rewrite.payload));
      callDependencies(rewrite.calls, current, additions);
    }
  }
  targetAdditions(plan, additions, {
    targetFor: (id) => targetOf(id, index, proposals),
    dependencies: current,
    actors: actorsById(index, proposals),
  });
  return { plan, skipped };
}
