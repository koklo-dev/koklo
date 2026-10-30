import type { IncomingMessage } from "node:http";

/**
 * Faux API du kanban (TK-35) : sprint.list, ticket.list et ticket.transition, sans Postgres.
 * Piloté par le scénario : `board` (sprint.list / ticket.list) et `transition` (ticket.transition).
 * Le stub garde l'état des tickets : une transition acceptée est visible à la lecture suivante.
 */
export type BoardMode =
  | "loading"
  | "noSprint"
  | "noProject"
  | "empty"
  | "data"
  | "internal"
  | "unauthorized";
export type TransitionMode = "ok" | "invalid" | "forbidden" | "internal";
export type KanbanRole = "owner" | "admin" | "dev" | "designer" | "client" | "business";
export type KanbanScenario = { board?: BoardMode; transition?: TransitionMode };

type Reply = { status: number; body: string };
const reply = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) });

const SPRINT = {
  id: "01900000-0000-7000-8000-0000000000f1",
  key: "SP-7",
  goal: "Rendre le kanban utilisable",
  status: "active",
  startsOn: "2026-10-26",
  endsOn: "2026-11-06",
  definitionOfDone: "Le kanban déplace les tickets",
};

const ticket = (n: number, title: string, over: Record<string, unknown>) => ({
  id: `01900000-0000-7000-8000-${String(n).padStart(12, "0")}`,
  key: `TK-${n}`,
  title,
  description: "",
  type: "feature",
  status: "todo",
  priority: "medium",
  sprint: "SP-7",
  assignee: null,
  pkg: "web",
  labels: [],
  sensitivity: "safe",
  estimateHours: null,
  linkedFeatures: [],
  branch: null,
  pullRequest: null,
  attempts: 0,
  reviewRounds: 0,
  createdAt: "2026-10-26T08:00:00.000Z",
  ...over,
});

const seed = () => [
  ticket(101, "Préparer le jeu de données de démonstration", {
    status: "backlog",
    priority: "low",
  }),
  ticket(102, "Afficher les colonnes du kanban", { status: "todo", priority: "high" }),
  ticket(103, "Journaliser les transitions de ticket", {
    status: "todo",
    pkg: "api",
    sensitivity: "sensitive",
  }),
  ticket(104, "Déplacer une carte vers une autre colonne", {
    status: "in_progress",
    priority: "critical",
  }),
  ticket(105, "Ajouter les icônes de statut", { status: "in_review", pkg: "ui" }),
  ticket(106, "Attendre la clé de l'API partenaire", {
    status: "blocked",
    priority: "high",
    pkg: "api",
    sensitivity: "sensitive",
  }),
  ticket(107, "Choisir la bibliothèque de glisser-déposer", { status: "done", priority: "low" }),
  ticket(108, "Supprimer l'ancien tableau", { status: "cancelled", priority: "low", pkg: "infra" }),
];

let tickets = seed();
export let transitions: Array<{ key: string; to: string }> = [];

export function resetKanban(): void {
  tickets = seed();
  transitions = [];
}

/** Réponse de `sprint.list` selon le scénario. */
export function sprintsResponse(mode: BoardMode): Reply {
  switch (mode) {
    case "noSprint":
      return reply(200, []);
    case "noProject":
      return reply(404, { defined: true, code: "NOT_FOUND", message: "Not found" });
    case "unauthorized":
      return reply(401, { defined: false, code: "UNAUTHORIZED", message: "Unauthorized" });
    case "internal":
      return reply(500, { defined: false, code: "INTERNAL", message: "Internal error" });
    default:
      return reply(200, [SPRINT]);
  }
}

/** Réponse de `ticket.list` (une seule page) selon le scénario. */
export function ticketsResponse(mode: BoardMode): Reply {
  if (mode === "internal") {
    return reply(500, { defined: false, code: "INTERNAL", message: "Internal error" });
  }
  return reply(200, { items: mode === "empty" ? [] : tickets, nextCursor: null });
}

/** `ticket.transition` : "ok" accepte tout, "invalid" refuse tout avec départ et arrivée. */
export function transitionResponse(mode: TransitionMode, key: string, to: string): Reply {
  transitions.push({ key, to });
  const found = tickets.find((t) => t.key === key);
  if (!found) return reply(404, { defined: true, code: "NOT_FOUND", message: "Not found" });
  switch (mode) {
    case "invalid":
      return reply(409, {
        defined: true,
        code: "INVALID_TRANSITION",
        message: "Transition de statut interdite",
        data: { from: found.status, to },
      });
    case "forbidden":
      return reply(403, { defined: true, code: "FORBIDDEN", message: "Forbidden" });
    case "internal":
      return reply(500, { defined: false, code: "INTERNAL", message: "Internal error" });
    default:
      found.status = to;
      return reply(200, found);
  }
}

type Send = (reply: Reply) => void;

/**
 * Route les appels du kanban ; renvoie true quand la requête a été prise en charge.
 * `hold` retient une réponse jusqu'à POST /__release ; `expireSession` simule une session expirée.
 */
export function handleKanban(
  req: IncomingMessage,
  path: string,
  scenario: KanbanScenario,
  send: Send,
  hold: (release: () => void) => void,
  expireSession: () => void,
): boolean {
  const board = scenario.board ?? "data";
  if (path === "/__transitions") {
    send(reply(200, transitions));
    return true;
  }
  if (req.method === "GET" && path.endsWith("/sprints")) {
    if (board === "unauthorized") expireSession();
    if (board === "loading") hold(() => send(sprintsResponse("data")));
    else send(sprintsResponse(board));
    return true;
  }
  if (req.method === "GET" && path.endsWith("/tickets")) {
    send(ticketsResponse(board));
    return true;
  }
  const move = /\/tickets\/(TK-[1-9][0-9]*)\/transition$/.exec(path);
  if (req.method !== "POST" || !move) return false;
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", () => {
    const { to } = JSON.parse(raw || "{}") as { to: string };
    send(transitionResponse(scenario.transition ?? "ok", move[1] as string, to));
  });
  return true;
}
