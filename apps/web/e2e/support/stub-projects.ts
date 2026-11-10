import type { IncomingMessage } from "node:http";
import { creationForCard, type SpecRepoScenario } from "./stub-spec-repo.ts";

/**
 * Faux API de la liste des projets (TK-93 lot B, contrat 2.8.0) : `project.cards`, sans Postgres. Les cartes sont
 * dérivées des projets du faux API (un par phase, en tournant) ; `cardsSet: "five"` en ajoute deux, comme la planche 08.
 * `cardsAudience: "client"` rend la vue client (libellés tournés vers lui). Le filtre, la recherche, le tri, les
 * facettes et le curseur sont calculés ici comme le fait le serveur.
 */
export type ProjectsCardsScenario = SpecRepoScenario & {
  cardsSet?: "five";
  cardsAudience?: "client";
  /** Vue client avec un seul projet : la page serveur `/projects` redirige vers lui. */
  clientOneProject?: boolean;
  /** Nombre maximal de cartes par page (défaut 24), pour exercer « Charger la suite » avec peu de projets. */
  cardsPageSize?: number;
};

type Reply = { status: number; body: string };
type Project = { id: string; name: string };
type Phase = "idea" | "framing" | "iterations";

const EXTRA: Project[] = [
  { id: "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b04", name: "Application caisse" },
  { id: "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b05", name: "Site vitrine Hexa" },
];

const PHASES: Phase[] = ["framing", "idea", "iterations"];
const PROGRESS = {
  idea: { label: "Dossier d'idée", done: 5, total: 10, valueLabel: "5 pages stables sur 10" },
  framing: { label: "Livrables validés", done: 2, total: 7, valueLabel: "2 sur 7" },
  iterations: { label: "Sprint SP-7", done: 5, total: 8, valueLabel: "5 tickets sur 8" },
} as const;

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

function cardOf(project: Project, index: number, client: boolean, scenario: SpecRepoScenario) {
  const phase = PHASES[index % PHASES.length] ?? "idea";
  const attention = index % 2 === 0;
  return {
    id: project.id,
    name: project.name,
    initials: initialsOf(project.name),
    colorKey: (index % 5) + 1,
    clientContact: client || index % 3 === 2 ? null : "Marie Lefèvre · Salon Lumière",
    phase,
    progress: PROGRESS[phase],
    nextAction: attention
      ? { title: "Le cahier fonctionnel attend la validation de Marie", attention: true }
      : { title: "2 tickets attendent une revue de code", attention: false },
    people: [
      { initials: "ML", name: "Marie Lefèvre", client: true },
      { initials: "AK", name: "Awa Koné", client: false },
    ],
    lastActivity: {
      actor: "Marie",
      at: new Date(Date.now() - (index + 1) * 7_200_000).toISOString(),
    },
    creation: creationForCard(project.id, scenario),
  };
}

type Card = ReturnType<typeof cardOf>;
const norm = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function sorted(cards: Card[], sort: string | null): Card[] {
  if (sort === "name") return [...cards].sort((a, b) => a.name.localeCompare(b.name, "fr"));
  if (sort === "attention") {
    return [...cards].sort(
      (a, b) => Number(b.nextAction.attention) - Number(a.nextAction.attention),
    );
  }
  return cards;
}

export function cardsResponse(
  url: URL,
  projects: Project[],
  scenario: ProjectsCardsScenario,
): Reply {
  const client = scenario.cardsAudience === "client";
  const visibleProjects = scenario.clientOneProject ? projects.slice(0, 1) : projects;
  const all = [...visibleProjects, ...(scenario.cardsSet === "five" ? EXTRA : [])].map(
    (project, i) => cardOf(project, i, client, scenario),
  );
  const q = norm(url.searchParams.get("q") ?? "");
  const phase = url.searchParams.get("phase");
  const matching = all.filter(
    (card) => !q || norm(`${card.name} ${card.clientContact ?? ""}`).includes(q),
  );
  const facets = {
    all: matching.length,
    idea: matching.filter((card) => card.phase === "idea").length,
    framing: matching.filter((card) => card.phase === "framing").length,
    iterations: matching.filter((card) => card.phase === "iterations").length,
  };
  const visible = sorted(
    matching.filter((card) => !phase || card.phase === phase),
    url.searchParams.get("sort"),
  );
  const size = Math.min(Number(url.searchParams.get("limit") ?? 24), scenario.cardsPageSize ?? 24);
  const start = Number(url.searchParams.get("cursor") ?? 0);
  const items = visible.slice(start, start + size);
  const next = start + size < visible.length ? String(start + size) : null;
  return {
    status: 200,
    body: JSON.stringify({
      items,
      nextCursor: next,
      total: visible.length,
      facets,
      attention: all.filter((card) => card.nextAction.attention).length,
      audience: client ? "client" : "team",
    }),
  };
}

/** `GET /projects/cards` : vrai si la requête est traitée. */
export function handleProjectCards(
  req: IncomingMessage,
  url: URL,
  h: {
    scenario: ProjectsCardsScenario & { projects: string };
    projects: () => Project[];
    send: (reply: Reply) => void;
    hold: (release: () => void) => void;
    failure: (scenario: string) => Reply | null;
  },
): boolean {
  if (req.method !== "GET" || url.pathname !== "/projects/cards") return false;
  const failure = h.failure(h.scenario.projects);
  const answer = () => h.send(failure ?? cardsResponse(url, h.projects(), h.scenario));
  // `limit=2` : la sonde de la page serveur (client à un seul projet) ne doit jamais être retenue, sinon la page ne sort pas.
  const probe = url.searchParams.get("limit") === "2";
  if (h.scenario.projects === "loading" && !probe) h.hold(answer);
  else answer();
  return true;
}
