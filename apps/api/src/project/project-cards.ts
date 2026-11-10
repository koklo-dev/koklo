import {
  type CreationStatus,
  PROJECT_CARDS_PAGE_SIZE,
  type ProjectCard,
  type ProjectCardsInput,
  type ProjectCardsOutput,
} from "@koklo/contract";
import { projectTileOf } from "@koklo/domain";
import {
  deriveOf,
  type NextFactsRecord,
  nextActionFor,
} from "../project-overview/overview-build.ts";
import type { MemberFact } from "../project-overview/overview-main.ts";
import { DELIVERABLE_TOTAL, initialsOf, plural } from "../project-overview/overview-texts.ts";
import { validation } from "../tracker/api-errors.ts";
import type { ProjectPhase } from "./project-shell.ts";

/**
 * Liste des projets en cartes (TK-93, B297 à B300) : fonctions pures sur des faits déjà lus en
 * groupe. Aucune lecture ici ; filtres, tri, facettes, total, « attention » et curseur sont calculés
 * côté serveur sur l'ensemble des projets visibles, jamais sur la page affichée.
 */
export type Audience = "team" | "client";

/** Faits d'un projet : ceux de la prochaine étape (mêmes règles que la vue d'ensemble) et de la carte. */
export interface CardFacts extends Omit<NextFactsRecord, "project" | "aiConfigured"> {
  project: { id: string; name: string; createdAt: Date };
  staff: MemberFact[];
  /** Dernier événement lisible du journal (liste fermée selon l'audience) ; `null` sans événement. */
  activity: { actor: string | null; at: Date } | null;
  creation: CreationStatus | null;
}

export interface CardContext {
  role: string;
  audience: Audience;
  now: Date;
  /** `null` : non lu (la règle « IA non configurée » ne s'applique qu'aux propriétaires et administrateurs). */
  aiConfigured: boolean | null;
}

type CardBase = Pick<NextFactsRecord, "pages" | "sprint">;

/** Avancement affiché sur la carte : une jauge et deux textes, selon la phase. */
export function progressOf(
  phase: ProjectPhase,
  pages: CardBase["pages"],
  validatedDeliverables: number,
  sprint: CardBase["sprint"],
): ProjectCard["progress"] {
  if (phase === "idea") {
    const done = pages.filter((page) => page.status === "stable").length;
    const noun = plural(done, "page stable", "pages stables");
    return {
      label: "Dossier d'idée",
      done,
      total: pages.length,
      valueLabel: `${done} ${noun} sur ${pages.length}`,
    };
  }
  if (phase === "framing") {
    return {
      label: "Livrables validés",
      done: validatedDeliverables,
      total: DELIVERABLE_TOTAL,
      valueLabel: `${validatedDeliverables} sur ${DELIVERABLE_TOTAL}`,
    };
  }
  if (!sprint) return { label: "Sprint", done: 0, total: 0, valueLabel: "Aucun sprint actif" };
  const done = sprint.tickets.filter((ticket) => ticket.status === "done").length;
  const total = sprint.tickets.length;
  return {
    label: `Sprint ${sprint.key}`,
    done,
    total,
    valueLabel: `${done} ${plural(done, "ticket", "tickets")} sur ${total}`,
  };
}

export interface BuiltCard {
  card: ProjectCard;
  attention: boolean;
  /** Instant de tri « activité » : le dernier événement, à défaut la création du projet. */
  at: number;
}

/** Personnes de la carte : le client d'abord, puis l'équipe par rôle ; trois au plus. */
function peopleOf(facts: CardFacts): ProjectCard["people"] {
  const everyone = [
    ...facts.clients.map((member) => ({ member, client: true })),
    ...facts.staff.map((member) => ({ member, client: false })),
  ];
  return everyone.slice(0, 3).map(({ member, client }) => ({
    initials: initialsOf(member.name),
    name: member.name,
    client,
  }));
}

/** Une carte, avec ce que le tri et le filtre en lisent. */
export function cardOf(facts: CardFacts, ctx: CardContext): BuiltCard {
  const { project } = facts;
  const record: NextFactsRecord = { ...facts, aiConfigured: ctx.aiConfigured };
  const derived = deriveOf(record);
  const next = nextActionFor(record, ctx);
  const attention = next.tone === "warning";
  const team = ctx.audience === "team";
  const card: ProjectCard = {
    id: project.id,
    name: project.name,
    ...projectTileOf(project.id, project.name),
    clientContact: team ? (facts.clients[0]?.name ?? null) : null,
    phase: derived.phase,
    progress: progressOf(derived.phase, facts.pages, derived.validatedDeliverables, facts.sprint),
    nextAction: { title: next.title, attention },
    people: peopleOf(facts),
    lastActivity: facts.activity
      ? { actor: facts.activity.actor, at: facts.activity.at.toISOString() }
      : null,
    creation: facts.creation,
  };
  const at = (facts.activity?.at ?? project.createdAt).getTime();
  return { card, attention, at };
}

type Sort = NonNullable<ProjectCardsInput["sort"]>;

interface Position {
  sort: Sort;
  attention: boolean;
  at: number;
  name: string;
  id: string;
}

const COLLATOR = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

function compare(sort: Sort, a: Position, b: Position): number {
  const byId = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  const byActivity = b.at - a.at;
  if (sort === "name") return COLLATOR.compare(a.name, b.name) || byId;
  if (sort === "attention") {
    return Number(b.attention) - Number(a.attention) || byActivity || byId;
  }
  return byActivity || byId;
}

const positionOf = (sort: Sort, built: BuiltCard): Position => ({
  sort,
  attention: built.attention,
  at: built.at,
  name: built.card.name,
  id: built.card.id,
});

const encode = (position: Position): string =>
  Buffer.from(JSON.stringify(position), "utf8").toString("base64url");

function decode(cursor: string, sort: Sort): Position {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const position = value as Partial<Position>;
    if (
      position.sort === sort &&
      typeof position.id === "string" &&
      typeof position.name === "string" &&
      typeof position.at === "number" &&
      typeof position.attention === "boolean"
    ) {
      return position as Position;
    }
  } catch {
    // Curseur illisible : refusé ci-dessous, sans citer sa valeur.
  }
  throw validation("cursor", "Curseur invalide pour ce tri.");
}

/** Recherche sans casse ni accents sur le nom du projet. */
const fold = (text: string): string =>
  text.normalize("NFD").replaceAll(/\p{M}/gu, "").toLowerCase();

/**
 * Page de cartes : recherche, facettes de phase (sans tenir compte du filtre de phase), compteur
 * d'attention, filtre de phase, tri, puis tranche après le curseur `(clé de tri, identifiant)` —
 * stable si des projets sont ajoutés ou retirés entre deux pages.
 */
export function pageOfCards(
  projects: readonly CardFacts[],
  ctx: CardContext,
  query: ProjectCardsInput,
): ProjectCardsOutput {
  const sort: Sort = query.sort ?? "activity";
  const needle = query.q === undefined ? null : fold(query.q.trim());
  const matching = projects
    .filter(({ project }) => needle === null || fold(project.name).includes(needle))
    .map((facts) => cardOf(facts, ctx));
  const countOf = (phase: ProjectPhase) =>
    matching.filter((built) => built.card.phase === phase).length;
  const wanted = matching.filter(
    (built) => query.phase === undefined || built.card.phase === query.phase,
  );
  const ordered = wanted
    .map((built) => ({ built, position: positionOf(sort, built) }))
    .sort((a, b) => compare(sort, a.position, b.position));
  const after = query.cursor === undefined ? null : decode(query.cursor, sort);
  const rest = after
    ? ordered.filter(({ position }) => compare(sort, position, after) > 0)
    : ordered;
  const requested = typeof query.limit === "number" ? query.limit : PROJECT_CARDS_PAGE_SIZE;
  const size = Math.min(requested, PROJECT_CARDS_PAGE_SIZE);
  const slice = rest.slice(0, size);
  const last = slice.at(-1);
  return {
    items: slice.map(({ built }) => built.card),
    nextCursor: rest.length > size && last ? encode(last.position) : null,
    total: wanted.length,
    facets: {
      all: matching.length,
      idea: countOf("idea"),
      framing: countOf("framing"),
      iterations: countOf("iterations"),
    },
    attention: matching.filter((built) => built.attention).length,
    audience: ctx.audience,
  };
}
