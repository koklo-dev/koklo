import type { IncomingMessage } from "node:http";
import { ideaPhase } from "./stub-idea-agent.ts";

/**
 * Faux API de la coquille (TK-88, contrat 2.1.0) : `project.shell`, `project.visit`, `project.recent` et
 * `search.query`, sans Postgres. Pilotage : `shell` (agrégat du projet), `recent` (projets déjà visités au départ).
 * Les visites reçues s'ajoutent en tête des récents ; `GET /__visits` les rend, dans l'ordre.
 */
export type ShellMode = "data" | "noSprint" | "internal" | "loading";
export type ShellScenario = {
  shell?: ShellMode;
  /** Identifiants de projets déjà visités, du plus récent au plus ancien. */
  recent?: string[];
  /** `search.query` : réponse normale (défaut), en échec (500) ou retenue jusqu'à `/__release`. */
  search?: "data" | "error" | "loading";
};

type Reply = { status: number; body: string };
type Send = (reply: Reply) => void;
const reply = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) });

const DELIVERABLES = [
  ["functional", true, null],
  ["data", true, null],
  ["architecture", false, "les données"],
  ["technical", false, "l'architecture"],
  ["security", false, "le technique"],
  ["design", true, null],
  ["quality", false, "le technique, la sécurité et le design"],
] as const;

const visits: string[] = [];
/** Requêtes `search.query` reçues (q et projet), dans l'ordre : le test d'anti-rebond les compte. */
const searches: Array<{ q: string; projectId: string | null }> = [];
let seeded: string[] = [];

export function resetShell(scenario: ShellScenario): void {
  visits.length = 0;
  searches.length = 0;
  seeded = scenario.recent ?? [];
}

type Handlers = {
  scenario: ShellScenario & { board?: string };
  projects: () => Array<{ id: string; name: string }>;
  send: Send;
  hold: (release: () => void) => void;
};

const SHELL = /^\/projects\/([^/]+)\/(shell|visit)$/;

/** Résultats de `search.query` : projets par nom, puis (avec un projet) fonctionnalités et tickets connus du faux API. */
const FEATURES = [
  { specId: "F-001", title: "Connexion par e-mail" },
  { specId: "F-002", title: "Tableau kanban" },
  { specId: "F-003", title: "Export des tickets" },
];
const TICKETS = [
  { key: "TK-102", title: "Afficher les colonnes du kanban", status: "todo" },
  { key: "TK-103", title: "Journaliser les transitions de ticket", status: "todo" },
  { key: "TK-1141", title: "Ticket à faire numéro 142 hors de la page", status: "todo" },
];

/** « beaucoup » : la page de 20 résultats d'un ensemble de 134 (le serveur plafonne à 20, le total reste vrai). */
const MANY = {
  items: Array.from({ length: 20 }, (_, i) => ({
    kind: "ticket",
    projectId: "p",
    key: `TK-${200 + i}`,
    title: `Ticket en nombre ${i + 1}`,
    status: "todo",
  })),
  nextCursor: null,
  previousCursor: null,
  offset: 0,
  total: 134,
};

function searchResponse(url: URL, h: Handlers): Reply {
  const q = (url.searchParams.get("q") ?? "").toLowerCase();
  const projectId = url.searchParams.get("projectId");
  if (q === "") return reply(422, { defined: true, code: "VALIDATION", message: "q" });
  searches.push({ q, projectId });
  if (q === "beaucoup") return reply(200, MANY);
  const has = (text: string) => text.toLowerCase().includes(q);
  const items = [
    ...h
      .projects()
      .filter((project) => has(project.name))
      .map((project) => ({ kind: "project", id: project.id, name: project.name })),
    ...(projectId
      ? [
          ...FEATURES.filter((f) => has(f.title) || has(f.specId)).map((f) => ({
            kind: "feature",
            projectId,
            ...f,
          })),
          ...TICKETS.filter((t) => has(t.title) || has(t.key)).map((t) => ({
            kind: "ticket",
            projectId,
            ...t,
          })),
        ]
      : []),
  ];
  return reply(200, {
    items,
    nextCursor: null,
    previousCursor: null,
    offset: 0,
    total: items.length,
  });
}

function shellResponse(projectId: string, h: Handlers): Reply {
  const mode = h.scenario.shell ?? "data";
  const project = h.projects().find((candidate) => candidate.id === projectId);
  if (!project) return reply(404, { defined: true, code: "NOT_FOUND", message: "Not found" });
  if (mode === "internal") {
    return reply(500, { defined: false, code: "INTERNAL", message: "Internal error" });
  }
  const noSprint = mode === "noSprint" || h.scenario.board === "noSprint";
  return reply(200, {
    id: project.id,
    name: project.name,
    phase: ideaPhase(),
    deliverables: DELIVERABLES.map(([key, available, after]) => ({ key, available, after })),
    validatedCount: 0,
    ticketCount: noSprint ? null : 8,
  });
}

function recentResponse(h: Handlers): Reply {
  const known = new Map(h.projects().map((project) => [project.id, project.name]));
  const ids = [...new Set([...visits, ...seeded])].filter((id) => known.has(id)).slice(0, 8);
  return reply(
    200,
    ids.map((id) => ({
      id,
      name: known.get(id),
      visitedAt: "2026-11-07T10:00:00.000Z",
      initials: String(known.get(id) ?? "")
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word.charAt(0).toUpperCase())
        .join(""),
      colorKey: (Number.parseInt(id.slice(-2), 16) % 5) + 1,
    })),
  );
}

/** Lectures sans projet dans le chemin : visites enregistrées (outil de test), projets récents, recherche. */
function handleReads(req: IncomingMessage, url: URL, h: Handlers): boolean {
  if (req.method !== "GET") return false;
  const replies: Record<string, () => Reply> = {
    "/__visits": () => reply(200, visits),
    "/__searches": () => reply(200, searches),
    "/project-visits": () => recentResponse(h),
  };
  if (url.pathname === "/search") {
    const mode = h.scenario.search ?? "data";
    if (mode === "error")
      h.send(reply(500, { defined: false, code: "INTERNAL", message: "Erreur" }));
    else if (mode === "loading") h.hold(() => h.send(searchResponse(url, h)));
    else h.send(searchResponse(url, h));
    return true;
  }
  const answer = replies[url.pathname];
  if (answer) h.send(answer());
  return answer !== undefined;
}

export function handleShell(req: IncomingMessage, url: URL, h: Handlers): boolean {
  if (handleReads(req, url, h)) return true;
  const match = SHELL.exec(url.pathname);
  if (!match) return false;
  const [, projectId = "", action] = match;
  if (action === "shell" && req.method === "GET") {
    if (h.scenario.shell === "loading") h.hold(() => h.send(shellResponse(projectId, h)));
    else h.send(shellResponse(projectId, h));
    return true;
  }
  if (action === "visit" && req.method === "POST") {
    const known = h.projects().some((project) => project.id === projectId);
    if (known) visits.unshift(projectId);
    h.send(
      known
        ? reply(200, { visitedAt: "2026-11-07T10:00:00.000Z" })
        : reply(404, { defined: true, code: "NOT_FOUND", message: "Not found" }),
    );
    return true;
  }
  return false;
}
