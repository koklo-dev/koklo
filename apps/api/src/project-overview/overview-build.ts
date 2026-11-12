import type { ProjectOverview } from "@koklo/contract";
import { IDEA_WRITE_ROLES, MANAGER_ROLES, REVIEW_SUBMIT_ROLES } from "../auth/roles.ts";
import { hasClientOf } from "../project/client-presence.ts";
import { phaseOf } from "../project/project-shell.ts";
import { activityItemOf } from "./overview-activity.ts";
import {
  deliverableCards,
  type FunctionalState,
  functionalStateOf,
} from "./overview-deliverables.ts";
import { ideaLink, specLink, ticketsLink } from "./overview-links.ts";
import { ideaPagesOf, peopleOf, sprintTicketsOf, type TicketFact } from "./overview-main.ts";
import { type NextActionFacts, nextActionOf } from "./overview-next-action.ts";
import { statsOf } from "./overview-stats.ts";
import { phaseStepsOf } from "./overview-texts.ts";
import type { Audience, OverviewRecord } from "./project-overview.repository.ts";

export interface OverviewContext {
  role: string;
  audience: Audience;
  now: Date;
}

const includes = (roles: readonly string[], role: string): boolean => roles.includes(role);
const SHORT_SHA = 7;

/** Ce que la prochaine étape et la phase lisent d'un enregistrement : la liste des projets en cartes (TK-93) le fournit aussi. */
export interface NextFactsRecord {
  project: { id: string };
  phaseFacts: OverviewRecord["phaseFacts"];
  pages: Pick<OverviewRecord["pages"][number], "title" | "status" | "required">[];
  clients: OverviewRecord["clients"];
  spec: {
    failed: boolean;
    head: { sha: string; indexedAt: Date } | null;
    verdicts: OverviewRecord["spec"]["verdicts"];
  };
  sprint: { key: string; tickets: TicketFact[] } | null;
  pendingProposals: number;
  proposalAuthor: string | null;
  aiConfigured: boolean | null;
}

type Derived = ReturnType<typeof deriveOf>;

/** Faits dérivés de l'enregistrement, partagés par le fil, la prochaine étape, les indicateurs et le bloc principal. */
export function deriveOf(record: NextFactsRecord) {
  const { pages, clients, spec, sprint } = record;
  const phase = phaseOf(record.phaseFacts);
  const functional: FunctionalState = functionalStateOf(spec.verdicts, spec.head?.sha ?? null);
  const allEmpty = pages.every((page) => page.status === "empty");
  return {
    phase,
    functional,
    hasClient: hasClientOf(clients),
    stablePages: pages.filter((page) => page.status === "stable").length,
    fresh: phase === "idea" && allEmpty && record.pendingProposals === 0,
    allEmpty,
    validatedDeliverables: functional.status === "validated" ? 1 : 0,
    tickets: sprint?.tickets ?? [],
  };
}

function nextFacts(record: NextFactsRecord, ctx: OverviewContext, d: Derived): NextActionFacts {
  const missing = record.pages.filter((page) => page.required && page.status !== "stable");
  const clientName =
    record.clients.find((c) => c.role === "client")?.name ?? record.clients[0]?.name ?? null;
  return {
    projectId: record.project.id,
    audience: ctx.audience,
    manager: includes(MANAGER_ROLES, ctx.role),
    canDecideIdea: includes(IDEA_WRITE_ROLES, ctx.role),
    canValidate: includes(REVIEW_SUBMIT_ROLES, ctx.role),
    phase: d.phase,
    now: ctx.now,
    aiConfigured: record.aiConfigured ?? true,
    specFailed: record.spec.failed,
    fresh: d.fresh,
    proposals: { count: record.pendingProposals, authorName: record.proposalAuthor },
    missingRequired: { count: missing.length, firstTitle: missing[0]?.title ?? null },
    clientName,
    functional: {
      pending: d.functional.pending,
      pendingSince: record.spec.head?.indexedAt ?? null,
      revise: d.functional.revise,
      teamPending: !d.hasClient && d.functional.total > 0 && d.functional.status !== "validated",
    },
    // Sans source avant l'écran du livrable suivant et le lot 12 : écrites et testées, jamais déclenchées (B276).
    proposeNext: null,
    inReviewTickets: d.tickets.filter((ticket) => ticket.status === "in_review").length,
    changeRequest: null,
  };
}

/** Prochaine étape d'un projet, mêmes règles que la vue d'ensemble : `deriveOf` et `nextFacts` en un seul appel. */
export function nextActionFor(record: NextFactsRecord, ctx: OverviewContext) {
  return nextActionOf(nextFacts(record, ctx, deriveOf(record)));
}

function primaryActionOf(
  projectId: string,
  audience: Audience,
  d: Derived,
): ProjectOverview["primaryAction"] {
  if (d.phase === "idea") return { label: "Ouvrir l'espace Idée", href: ideaLink(projectId) };
  if (d.phase === "framing") {
    // Le client n'ouvre pas les routes spec.* (403) : jamais de lien qu'il ne peut suivre.
    return d.functional.status === "validated" || audience === "client"
      ? undefined
      : { label: "Continuer le cadrage", href: specLink(projectId) };
  }
  return audience === "team"
    ? { label: "Ouvrir les tickets", href: ticketsLink(projectId) }
    : undefined;
}

function mainOf(record: OverviewRecord, d: Derived, audience: Audience): ProjectOverview["main"] {
  if (d.phase === "idea") return { kind: "idea", pages: ideaPagesOf(record.pages) };
  if (d.phase === "framing") {
    return {
      kind: "deliverables",
      items: deliverableCards(record.project.id, d.functional, d.hasClient, audience),
    };
  }
  const { sprint } = record;
  return {
    kind: "sprint",
    ...(sprint ? { sprint: { key: sprint.key, goal: sprint.goal } } : {}),
    tickets: sprintTicketsOf(d.tickets),
  };
}

function statsFor(
  record: OverviewRecord,
  ctx: OverviewContext,
  d: Derived,
): ProjectOverview["stats"] {
  const { head } = record.spec;
  return statsOf({
    phase: d.phase,
    audience: ctx.audience,
    fresh: d.fresh,
    maturity: { stable: d.stablePages, total: record.pages.length },
    pendingProposals: record.pendingProposals,
    clientMessages: record.clientMessages,
    ideaVersion: record.ideaVersion,
    validatedDeliverables: d.validatedDeliverables,
    functional: d.functional,
    hasClient: d.hasClient,
    suggestions: record.suggestions,
    head: head && {
      shortSha: head.sha.slice(0, SHORT_SHA),
      indexedAt: head.indexedAt,
      versions: head.versions,
    },
    sprint: record.sprint && {
      key: record.sprint.key,
      done: d.tickets.filter((ticket) => ticket.status === "done").length,
      total: d.tickets.length,
    },
  });
}

/** Assemble la vue d'ensemble : tous les textes naissent ici, du côté serveur (03 §9). */
export function buildOverview(record: OverviewRecord, ctx: OverviewContext): ProjectOverview {
  const d = deriveOf(record);
  const { project } = record;
  const team = ctx.audience === "team";
  const clientContact = record.clients[0]?.name;
  const primaryAction = primaryActionOf(project.id, ctx.audience, d);
  return {
    project: {
      id: project.id,
      name: project.name,
      startedAt: project.createdAt.toISOString(),
      ...(team && clientContact ? { clientContact } : {}),
    },
    audience: ctx.audience,
    phase: d.phase,
    phaseSteps: phaseStepsOf({
      phase: d.phase,
      stablePages: d.stablePages,
      totalPages: record.pages.length,
      ideaUnused: d.allEmpty && record.ideaVersion === null,
      ideaVersion: record.ideaVersion,
      validatedDeliverables: d.validatedDeliverables,
      baselineAt: record.baselineAt,
      sprintKey: record.sprint?.key ?? null,
    }),
    ...(primaryAction ? { primaryAction } : {}),
    canInvite: includes(MANAGER_ROLES, ctx.role),
    nextAction: nextActionOf(nextFacts(record, ctx, d)),
    stats: statsFor(record, ctx, d),
    main: mainOf(record, d, ctx.audience),
    activity: { items: record.activity.rows.map(activityItemOf), total: record.activity.total },
    people: peopleOf(record.clients, record.staff),
  };
}
