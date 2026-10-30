import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KanbanPage } from "../src/components/kanban-page.tsx";
import { renderWithQuery } from "./support/render.tsx";
import { findNamed } from "./support/wait.ts";
import {
  apiError,
  getSession,
  NO_SESSION,
  navigations,
  ORG_ID,
  organization,
  polyfillRadix,
  procedures,
  resetWebMocks,
  router,
  sessionWith,
} from "./support/web-mocks.ts";

vi.mock("next/navigation", async () => {
  const m = await import("./support/web-mocks.ts");
  return { useRouter: () => m.router, usePathname: () => m.pathname.current };
});
vi.mock("../src/lib/auth-client.ts", async () => ({
  authClient: (await import("./support/web-mocks.ts")).authClient,
}));
vi.mock("../src/lib/orpc.ts", async () => ({
  orpc: (await import("./support/web-mocks.ts")).orpc,
}));

type Status = "backlog" | "todo" | "in_progress" | "in_review" | "blocked" | "done" | "cancelled";

const COLUMNS: Array<{ status: Status; label: string }> = [
  { status: "backlog", label: "Backlog" },
  { status: "todo", label: "À faire" },
  { status: "in_progress", label: "En cours" },
  { status: "in_review", label: "En revue" },
  { status: "blocked", label: "Bloqué" },
  { status: "done", label: "Terminé" },
  { status: "cancelled", label: "Annulé" },
];
const LABEL = Object.fromEntries(COLUMNS.map((c) => [c.status, c.label])) as Record<Status, string>;

const SPRINT = {
  id: "01900000-0000-7000-8000-0000000000f1",
  key: "SP-7",
  goal: "Rendre le kanban utilisable",
  status: "active",
  startsOn: "2026-10-26",
  endsOn: "2026-11-06",
  definitionOfDone: "",
};

const ticket = (key: string, status: Status, over: Record<string, unknown> = {}) => ({
  id: `01900000-0000-7000-8000-${key.replace("TK-", "").padStart(12, "0")}`,
  key,
  title: `Titre de ${key}`,
  description: "",
  type: "feature",
  status,
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

type Ticket = ReturnType<typeof ticket>;
const initialBoard = (): Ticket[] => [
  ticket("TK-101", "backlog", { priority: "low" }),
  ticket("TK-102", "todo", { priority: "high" }),
  ticket("TK-103", "todo", { priority: "medium", pkg: "api", sensitivity: "sensitive" }),
  ticket("TK-110", "todo", { priority: "critical", pkg: "ui" }),
  ticket("TK-111", "todo", { priority: "high" }),
  ticket("TK-104", "in_progress", { priority: "critical" }),
  ticket("TK-105", "in_review", { pkg: "ui" }),
  ticket("TK-106", "blocked", { priority: "high", pkg: "api", sensitivity: "sensitive" }),
  ticket("TK-107", "done", { priority: "low" }),
  ticket("TK-108", "cancelled", { priority: "low", pkg: "infra" }),
];

/** Faux serveur à état : `ticket.list` reflète les `ticket.transition` acceptés. */
let board: Ticket[] = [];
function serve(): void {
  board = initialBoard();
  procedures.sprintList.mockResolvedValue([SPRINT]);
  procedures.ticketList.mockImplementation(async () => ({
    items: board.map((t) => ({ ...t })),
    nextCursor: null,
  }));
  procedures.ticketTransition.mockImplementation(async (input: { key: string; to: Status }) => {
    const found = board.find((t) => t.key === input.key);
    if (!found) throw apiError("NOT_FOUND");
    found.status = input.to;
    return { ...found };
  });
}

function asRole(role: string) {
  getSession.mockResolvedValue(sessionWith(ORG_ID));
  procedures.organizationList.mockResolvedValue([organization({ role })]);
}

const column = (status: Status) => screen.getByTestId(`kanban-column-${status}`);
const card = (key: string) => screen.getByTestId(`kanban-card-${key}`);
const moveButton = (key: string) => screen.getByRole("button", { name: `Déplacer ${key}` });
/** Le bouton n'existe qu'une fois le rôle chargé (session puis organisation) : on l'attend par son texte. */
const findMoveButton = async (key: string) => {
  await within(card(key)).findByText("Déplacer");
  return moveButton(key);
};
const keysIn = (status: Status) =>
  within(column(status))
    .queryAllByTestId(/^kanban-card-/)
    .map((el) => el.getAttribute("data-testid")?.replace("kanban-card-", ""));

async function renderBoard() {
  renderWithQuery(<KanbanPage />);
  await screen.findByTestId("kanban-board");
}

/**
 * Tableau affiché ET rôle chargé (par défaut propriétaire) : les contrôles de déplacement dépendent de la
 * session puis de la liste d'organisations, qui arrivent indépendamment des tickets.
 */
async function renderEditableBoard() {
  await renderBoard();
  await findMoveButton("TK-102");
}

/** jsdom n'a pas de DataTransfer : un double minimal suffit aux événements de glisser HTML5. */
function dataTransfer() {
  const data = new Map<string, string>();
  return {
    data,
    setData: (type: string, value: string) => void data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
    effectAllowed: "uninitialized",
    dropEffect: "none",
    types: [] as string[],
  };
}

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  serve();
});

describe("KanbanPage — colonnes et compteurs (C1)", () => {
  it("affiche 7 colonnes dans l'ordre du cycle de vie, chacune titrée par un h2", async () => {
    await renderBoard();
    const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual(COLUMNS.map((c) => c.label));
    for (const { status, label } of COLUMNS) {
      const section = column(status);
      expect(section.tagName).toBe("SECTION");
      expect(section).toHaveAccessibleName(label);
    }
  });

  it("chaque colonne affiche son compteur, nommé en toutes lettres", async () => {
    await renderBoard();
    expect(within(column("backlog")).getByLabelText("1 ticket")).toHaveTextContent("1");
    expect(within(column("todo")).getByLabelText("4 tickets")).toHaveTextContent("4");
    expect(within(column("done")).getByLabelText("1 ticket")).toHaveTextContent("1");
  });

  it("chaque en-tête porte une icône distincte : le statut n'est jamais donné par la couleur seule", async () => {
    await renderBoard();
    await waitFor(() => {
      const paths = COLUMNS.map(({ label }) => {
        const heading = screen.getByRole("heading", { level: 2, name: label });
        return heading.parentElement?.querySelector("svg path")?.getAttribute("d") ?? "";
      });
      expect(paths.every((d) => d !== "")).toBe(true);
      expect(new Set(paths).size).toBe(7);
    });
  });

  it("le tableau défile dans une région nommée, atteignable au clavier", async () => {
    await renderBoard();
    const scroller = screen.getByRole("region", { name: "Colonnes du kanban" });
    expect(scroller).toHaveAttribute("tabindex", "0");
    expect(scroller).toContainElement(column("backlog"));
    expect(scroller).toContainElement(column("cancelled"));
  });

  it("le sous-titre donne le sprint, son objectif et le nombre de tickets", async () => {
    await renderBoard();
    expect(screen.getByText("Sprint SP-7 · Rendre le kanban utilisable")).toBeInTheDocument();
    expect(screen.getByText("10 tickets")).toBeInTheDocument();
  });

  it("charge le sprint actif puis ses tickets (sprint.list status=active, ticket.list sprintId)", async () => {
    await renderBoard();
    expect(procedures.sprintList).toHaveBeenCalledWith({ status: "active" });
    expect(procedures.ticketList).toHaveBeenCalledWith(
      expect.objectContaining({ sprintId: "SP-7" }),
    );
  });

  it("trie chaque colonne par priorité décroissante puis par clé", async () => {
    await renderBoard();
    expect(keysIn("todo")).toEqual(["TK-110", "TK-102", "TK-111", "TK-103"]);
  });
});

describe("KanbanPage — cartes (C2)", () => {
  it("affiche clé, titre, paquet, sensibilité et priorité en texte", async () => {
    await renderBoard();
    const c = card("TK-102");
    expect(within(c).getByText("TK-102")).toBeInTheDocument();
    expect(within(c).getByText("Titre de TK-102")).toBeInTheDocument();
    expect(within(c).getByText("web")).toBeInTheDocument();
    expect(within(c).getByTestId("kanban-sensitivity")).toHaveTextContent("Sûr");
    expect(within(c).getByText("Priorité haute")).toBeInTheDocument();
  });

  it.each([
    ["TK-110", "Priorité critique"],
    ["TK-102", "Priorité haute"],
    ["TK-103", "Priorité moyenne"],
    ["TK-101", "Priorité basse"],
  ])("%s : priorité « %s »", async (key, text) => {
    await renderBoard();
    expect(within(card(key)).getByText(text)).toBeInTheDocument();
  });

  it("un ticket sensible affiche « Sensible » avec l'icône cadenas ; un ticket sûr n'en a pas", async () => {
    await renderBoard();
    const sensitive = within(card("TK-103")).getByTestId("kanban-sensitivity");
    expect(sensitive).toHaveTextContent("Sensible");
    await waitFor(() =>
      expect(sensitive.querySelector("svg path")?.getAttribute("d")).toBeTruthy(),
    );
    const safe = within(card("TK-102")).getByTestId("kanban-sensitivity");
    expect(safe).toHaveTextContent("Sûr");
    expect(safe.querySelector("svg")).toBeNull();
  });

  it("n'affiche ni type ni assigné en v1", async () => {
    board = [ticket("TK-120", "todo", { type: "bug", assignee: "Moussa Diallo" })];
    await renderBoard();
    const c = card("TK-120");
    expect(c).not.toHaveTextContent("Moussa Diallo");
    expect(c).not.toHaveTextContent(/bug/i);
  });

  it("les cartes sont des éléments de liste dans la colonne", async () => {
    await renderBoard();
    const list = within(column("todo")).getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un écran, un test par comportement
describe("KanbanPage — états (C3)", () => {
  it("chargement : zone status aria-busy « Chargement du kanban… »", () => {
    procedures.sprintList.mockReturnValue(new Promise(() => undefined));
    renderWithQuery(<KanbanPage />);
    const loading = screen.getByTestId("kanban-loading");
    expect(loading).toHaveAttribute("role", "status");
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading).toHaveTextContent("Chargement du kanban…");
  });

  it("erreur de chargement : alerte + « Réessayer » qui relance et affiche le tableau", async () => {
    procedures.sprintList.mockRejectedValueOnce(new Error("boom"));
    renderWithQuery(<KanbanPage />);
    const error = await screen.findByTestId("kanban-error");
    expect(within(error).getByRole("alert")).toHaveTextContent("Impossible de charger le kanban");
    expect(error).toHaveTextContent(
      "Une erreur est survenue. Vérifiez votre connexion puis réessayez.",
    );
    expect(router.replace).not.toHaveBeenCalled();
    await userEvent.click(within(error).getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByTestId("kanban-board")).toBeInTheDocument();
    expect(procedures.sprintList).toHaveBeenCalledTimes(2);
  });

  it("erreur sur les tickets : même état d'erreur", async () => {
    procedures.ticketList.mockRejectedValue(new Error("boom"));
    renderWithQuery(<KanbanPage />);
    expect(await screen.findByTestId("kanban-error")).toBeInTheDocument();
  });

  it("aucun sprint actif : carte dédiée, pas de colonnes, pas d'appel aux tickets", async () => {
    procedures.sprintList.mockResolvedValue([]);
    renderWithQuery(<KanbanPage />);
    const empty = await screen.findByTestId("kanban-no-sprint");
    expect(within(empty).getByRole("heading", { name: "Aucun sprint actif" })).toBeInTheDocument();
    expect(empty).toHaveTextContent(
      "Le kanban affiche les tickets du sprint en cours. Il apparaîtra dès qu'un sprint sera démarré.",
    );
    expect(screen.queryByTestId("kanban-board")).not.toBeInTheDocument();
    expect(procedures.ticketList).not.toHaveBeenCalled();
  });

  it("sprint sans ticket : 7 colonnes à 0, bandeau et « Aucun ticket » dans chaque colonne", async () => {
    board = [];
    await renderBoard();
    expect(screen.getByText("Ce sprint ne contient encore aucun ticket.")).toBeInTheDocument();
    for (const { status } of COLUMNS) {
      expect(within(column(status)).getByText("Aucun ticket")).toBeInTheDocument();
      expect(within(column(status)).getByLabelText("0 ticket")).toBeInTheDocument();
    }
  });

  it("une colonne vide affiche « Aucun ticket » alors que les autres sont remplies", async () => {
    board = board.filter((t) => t.status !== "blocked");
    await renderBoard();
    expect(within(column("blocked")).getByText("Aucun ticket")).toBeInTheDocument();
    expect(within(column("todo")).queryByText("Aucun ticket")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Ce sprint ne contient encore aucun ticket."),
    ).not.toBeInTheDocument();
  });

  it("NOT_FOUND (organisation sans projet) : « Aucun projet pour le moment » et lien vers /projects", async () => {
    procedures.sprintList.mockImplementation(() => Promise.reject(apiError("NOT_FOUND")));
    renderWithQuery(<KanbanPage />);
    const empty = await screen.findByTestId("kanban-no-project");
    expect(
      within(empty).getByRole("heading", { name: "Aucun projet pour le moment" }),
    ).toBeInTheDocument();
    expect(within(empty).getByRole("link", { name: "Voir les projets" })).toHaveAttribute(
      "href",
      "/projects",
    );
    expect(screen.queryByTestId("kanban-error")).not.toBeInTheDocument();
  });

  it("UNAUTHORIZED sans session : redirige vers /login, sans message", async () => {
    getSession.mockResolvedValue(NO_SESSION);
    procedures.sprintList.mockImplementation(() => Promise.reject(apiError("UNAUTHORIZED")));
    renderWithQuery(<KanbanPage />);
    await waitFor(() => expect(navigations()).toContain("/login"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("KanbanPage — pagination (C4)", () => {
  it("suit nextCursor jusqu'à épuisement et affiche toutes les cartes", async () => {
    const pages: Record<string, { items: Ticket[]; nextCursor: string | null }> = {
      first: {
        items: [ticket("TK-201", "todo"), ticket("TK-202", "todo")],
        nextCursor: "c1",
      },
      c1: { items: [ticket("TK-203", "in_progress")], nextCursor: "c2" },
      c2: { items: [ticket("TK-204", "done")], nextCursor: null },
    };
    procedures.ticketList.mockImplementation(async (input: { cursor?: string }) => {
      const page = pages[input?.cursor ?? "first"];
      if (!page) throw new Error(`curseur inattendu ${String(input?.cursor)}`);
      return page;
    });
    await renderBoard();
    await waitFor(() => expect(screen.getByText("4 tickets")).toBeInTheDocument());
    expect(keysIn("todo")).toEqual(["TK-201", "TK-202"]);
    expect(keysIn("in_progress")).toEqual(["TK-203"]);
    expect(keysIn("done")).toEqual(["TK-204"]);
    const cursors = procedures.ticketList.mock.calls.map((call) => call[0]?.cursor);
    expect(cursors).toContain("c1");
    expect(cursors).toContain("c2");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un écran, un test par comportement
describe("KanbanPage — « Déplacer » au clavier (C5)", () => {
  it("la carte contient un vrai bouton nommé « Déplacer TK-102 » avec menu", async () => {
    await renderEditableBoard();
    const button = moveButton("TK-102");
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    expect(button).toHaveTextContent("Déplacer");
    expect(within(card("TK-102")).getByRole("button", { name: "Déplacer TK-102" })).toBe(button);
  });

  it("Entrée ouvre le menu « Déplacer TK-102 vers » : les 6 autres statuts, dans l'ordre", async () => {
    await renderEditableBoard();
    moveButton("TK-102").focus();
    await userEvent.keyboard("{Enter}");
    const menu = await findNamed("menu", "Déplacer TK-102 vers");
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual([
      "Backlog",
      "En cours",
      "En revue",
      "Bloqué",
      "Terminé",
      "Annulé",
    ]);
    expect(moveButton("TK-102")).toHaveAttribute("aria-expanded", "true");
  });

  it("flèche bas navigue, Entrée choisit : ticket.transition reçoit { key, to }", async () => {
    await renderEditableBoard();
    moveButton("TK-102").focus();
    await userEvent.keyboard("{Enter}");
    const menu = await findNamed("menu", "Déplacer TK-102 vers");
    await waitFor(() =>
      expect(within(menu).getByRole("menuitem", { name: "Backlog" })).toHaveFocus(),
    );
    await userEvent.keyboard("{ArrowDown}");
    expect(within(menu).getByRole("menuitem", { name: "En cours" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(procedures.ticketTransition).toHaveBeenCalled());
    expect(procedures.ticketTransition.mock.calls[0]?.[0]).toEqual({
      key: "TK-102",
      to: "in_progress",
    });
  });

  it("Espace choisit aussi un statut", async () => {
    await renderEditableBoard();
    moveButton("TK-104").focus();
    await userEvent.keyboard(" ");
    const menu = await findNamed("menu", "Déplacer TK-104 vers");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "En revue" }));
    await waitFor(() =>
      expect(procedures.ticketTransition.mock.calls[0]?.[0]).toEqual({
        key: "TK-104",
        to: "in_review",
      }),
    );
  });

  it("Échap ferme le menu sans appel et rend le focus au bouton", async () => {
    await renderEditableBoard();
    moveButton("TK-102").focus();
    await userEvent.keyboard("{Enter}");
    await findNamed("menu", "Déplacer TK-102 vers");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(moveButton("TK-102")).toHaveFocus();
    expect(procedures.ticketTransition).not.toHaveBeenCalled();
  });

  it("le menu n'est pas proposé pour le statut courant", async () => {
    await renderEditableBoard();
    moveButton("TK-107").focus();
    await userEvent.keyboard("{Enter}");
    const menu = await findNamed("menu", "Déplacer TK-107 vers");
    expect(within(menu).queryByRole("menuitem", { name: "Terminé" })).not.toBeInTheDocument();
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(6);
  });
});

async function moveWithMenu(key: string, to: string) {
  moveButton(key).focus();
  await userEvent.keyboard("{Enter}");
  const menu = await findNamed("menu", `Déplacer ${key} vers`);
  await userEvent.click(within(menu).getByRole("menuitem", { name: to }));
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un écran, un test par comportement
describe("KanbanPage — déplacement, succès et refus (C6)", () => {
  it("pendant l'appel : carte aria-busy, bouton désactivé « Déplacement… », non glissable", async () => {
    procedures.ticketTransition.mockReturnValue(new Promise(() => undefined));
    await renderEditableBoard();
    await moveWithMenu("TK-102", "En cours");
    await waitFor(() => expect(card("TK-102")).toHaveAttribute("aria-busy", "true"));
    expect(within(card("TK-102")).getByText("Déplacement…")).toBeInTheDocument();
    expect(within(card("TK-102")).getByRole("button")).toBeDisabled();
    expect(card("TK-102").getAttribute("draggable")).not.toBe("true");
    expect(keysIn("todo")).toContain("TK-102");
  });

  it("succès : la carte change de colonne, compteurs à jour, annonce role=status, focus sur « Déplacer »", async () => {
    await renderEditableBoard();
    await moveWithMenu("TK-102", "En cours");
    await waitFor(() => expect(keysIn("in_progress")).toContain("TK-102"));
    expect(keysIn("todo")).not.toContain("TK-102");
    expect(within(column("in_progress")).getByLabelText("2 tickets")).toBeInTheDocument();
    expect(within(column("todo")).getByLabelText("3 tickets")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("TK-102 déplacé vers En cours.");
    await waitFor(() => expect(moveButton("TK-102")).toHaveFocus());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("refus INVALID_TRANSITION : message nommant départ et arrivée, carte dans sa colonne d'origine", async () => {
    procedures.ticketTransition.mockImplementation(() =>
      Promise.reject(apiError("INVALID_TRANSITION", { from: "todo", to: "done" })),
    );
    await renderEditableBoard();
    await moveWithMenu("TK-102", "Terminé");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Déplacement impossible");
    expect(alert).toHaveTextContent(
      "Transition interdite : TK-102 ne peut pas passer de « À faire » à « Terminé ».",
    );
    expect(keysIn("todo")).toContain("TK-102");
    expect(keysIn("done")).not.toContain("TK-102");
    await waitFor(() => expect(moveButton("TK-102")).toHaveFocus());
    expect(card("TK-102")).not.toHaveAttribute("aria-busy", "true");
  });

  it("le message de refus se ferme avec « Fermer le message »", async () => {
    procedures.ticketTransition.mockImplementation(() =>
      Promise.reject(apiError("INVALID_TRANSITION", { from: "todo", to: "done" })),
    );
    await renderEditableBoard();
    await moveWithMenu("TK-102", "Terminé");
    const alert = await screen.findByRole("alert");
    await userEvent.click(within(alert).getByRole("button", { name: "Fermer le message" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("un seul message d'erreur à la fois : le dernier remplace le précédent", async () => {
    procedures.ticketTransition
      .mockImplementationOnce(() =>
        Promise.reject(apiError("INVALID_TRANSITION", { from: "todo", to: "done" })),
      )
      .mockImplementationOnce(() => Promise.reject(apiError("FORBIDDEN")));
    await renderEditableBoard();
    await moveWithMenu("TK-102", "Terminé");
    await screen.findByText(/Transition interdite/);
    await moveWithMenu("TK-102", "En cours");
    await screen.findByText(/Vous n'avez pas le droit de déplacer les tickets/);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryByText(/Transition interdite/)).not.toBeInTheDocument();
  });

  it("FORBIDDEN : message de droits", async () => {
    procedures.ticketTransition.mockImplementation(() => Promise.reject(apiError("FORBIDDEN")));
    await renderEditableBoard();
    await moveWithMenu("TK-102", "En cours");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Vous n'avez pas le droit de déplacer les tickets. Demandez à un propriétaire, un administrateur, un développeur ou un designer.",
    );
  });

  it("CONFLICT : « Ce ticket a changé entre-temps » avec « Recharger »", async () => {
    procedures.ticketTransition.mockImplementation(() => Promise.reject(apiError("CONFLICT")));
    await renderEditableBoard();
    await moveWithMenu("TK-102", "En cours");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Ce ticket a changé entre-temps");
    expect(alert).toHaveTextContent("Rechargez le kanban puis réessayez.");
    const before = procedures.ticketList.mock.calls.length;
    await userEvent.click(within(alert).getByRole("button", { name: "Recharger" }));
    await waitFor(() => expect(procedures.ticketList.mock.calls.length).toBeGreaterThan(before));
  });

  it("CONFLICT ticket_has_active_lease : message dédié (agent en cours)", async () => {
    procedures.ticketTransition.mockImplementation(() =>
      Promise.reject(apiError("CONFLICT", { reason: "ticket_has_active_lease" })),
    );
    await renderEditableBoard();
    await moveWithMenu("TK-102", "En cours");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ce ticket est en cours de traitement par un agent. Réessayez quand il aura terminé.",
    );
  });

  it("NOT_FOUND sur le ticket : « Ce ticket n'existe plus. » et rechargement du tableau", async () => {
    procedures.ticketTransition.mockImplementation(() => Promise.reject(apiError("NOT_FOUND")));
    await renderEditableBoard();
    const before = procedures.ticketList.mock.calls.length;
    await moveWithMenu("TK-102", "En cours");
    expect(await screen.findByRole("alert")).toHaveTextContent("Ce ticket n'existe plus.");
    await waitFor(() => expect(procedures.ticketList.mock.calls.length).toBeGreaterThan(before));
  });

  it("INTERNAL : « Le déplacement a échoué » et « Réessayer » relance la même transition", async () => {
    procedures.ticketTransition.mockImplementationOnce(() => Promise.reject(apiError("INTERNAL")));
    await renderEditableBoard();
    await moveWithMenu("TK-102", "En cours");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Le déplacement a échoué");
    expect(alert).toHaveTextContent("Une erreur est survenue. Réessayez dans un instant.");
    await userEvent.click(within(alert).getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(procedures.ticketTransition).toHaveBeenCalledTimes(2));
    expect(procedures.ticketTransition.mock.calls[1]?.[0]).toEqual({
      key: "TK-102",
      to: "in_progress",
    });
    await waitFor(() => expect(keysIn("in_progress")).toContain("TK-102"));
  });

  it("erreur réseau (sans code) : même message que INTERNAL", async () => {
    procedures.ticketTransition.mockImplementation(() => Promise.reject(new Error("réseau")));
    await renderEditableBoard();
    await moveWithMenu("TK-102", "En cours");
    expect(await screen.findByRole("alert")).toHaveTextContent("Le déplacement a échoué");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un écran, un test par comportement
describe("KanbanPage — glisser-déposer natif (C6)", () => {
  it("les cartes de l'équipe sont draggable", async () => {
    await renderEditableBoard();
    expect(card("TK-102")).toHaveAttribute("draggable", "true");
  });

  it("déposer sur une autre colonne appelle ticket.transition avec la clé et la cible", async () => {
    await renderEditableBoard();
    const dt = dataTransfer();
    fireEvent.dragStart(card("TK-102"), { dataTransfer: dt });
    fireEvent.dragOver(column("in_review"), { dataTransfer: dt });
    expect(
      within(column("in_review")).getByText("Déposer ici pour passer en En revue"),
    ).toBeVisible();
    fireEvent.drop(column("in_review"), { dataTransfer: dt });
    await waitFor(() => expect(procedures.ticketTransition).toHaveBeenCalled());
    expect(procedures.ticketTransition.mock.calls[0]?.[0]).toEqual({
      key: "TK-102",
      to: "in_review",
    });
    await waitFor(() => expect(keysIn("in_review")).toContain("TK-102"));
    expect(screen.getByRole("status")).toHaveTextContent("TK-102 déplacé vers En revue.");
  });

  it("la colonne d'origine n'offre pas de retour de dépôt et déposer dessus ne fait rien", async () => {
    await renderEditableBoard();
    const dt = dataTransfer();
    fireEvent.dragStart(card("TK-102"), { dataTransfer: dt });
    fireEvent.dragOver(column("todo"), { dataTransfer: dt });
    expect(screen.queryByText(/Déposer ici pour passer en/)).not.toBeInTheDocument();
    fireEvent.drop(column("todo"), { dataTransfer: dt });
    expect(procedures.ticketTransition).not.toHaveBeenCalled();
  });

  it("une colonne vide reste une cible de dépôt", async () => {
    board = board.filter((t) => t.status !== "blocked");
    await renderEditableBoard();
    const dt = dataTransfer();
    fireEvent.dragStart(card("TK-102"), { dataTransfer: dt });
    fireEvent.dragOver(column("blocked"), { dataTransfer: dt });
    fireEvent.drop(column("blocked"), { dataTransfer: dt });
    await waitFor(() =>
      expect(procedures.ticketTransition.mock.calls[0]?.[0]).toEqual({
        key: "TK-102",
        to: "blocked",
      }),
    );
  });

  it("un dépôt refusé par le serveur nomme départ et arrivée et laisse la carte en place", async () => {
    procedures.ticketTransition.mockImplementation(() =>
      Promise.reject(apiError("INVALID_TRANSITION", { from: "todo", to: "done" })),
    );
    await renderEditableBoard();
    const dt = dataTransfer();
    fireEvent.dragStart(card("TK-102"), { dataTransfer: dt });
    fireEvent.dragOver(column("done"), { dataTransfer: dt });
    fireEvent.drop(column("done"), { dataTransfer: dt });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      `Transition interdite : TK-102 ne peut pas passer de « ${LABEL.todo} » à « ${LABEL.done} ».`,
    );
    expect(keysIn("todo")).toContain("TK-102");
  });
});

describe("KanbanPage — rôles (C7)", () => {
  it.each(["client", "business"])(
    "rôle %s : lecture seule, aucun bouton « Déplacer », cartes non glissables, mention",
    async (role) => {
      asRole(role);
      await renderBoard();
      await waitFor(() =>
        expect(
          screen.getByText("Lecture seule : votre rôle ne permet pas de déplacer les tickets."),
        ).toBeInTheDocument(),
      );
      expect(screen.queryByRole("button", { name: /Déplacer/ })).not.toBeInTheDocument();
      expect(card("TK-102").getAttribute("draggable")).not.toBe("true");
      expect(card("TK-102")).toHaveTextContent("Titre de TK-102");
    },
  );

  it("lecture seule : un dépôt simulé n'appelle jamais ticket.transition", async () => {
    asRole("client");
    await renderBoard();
    await screen.findByText(/Lecture seule/);
    const dt = dataTransfer();
    fireEvent.dragStart(card("TK-102"), { dataTransfer: dt });
    fireEvent.dragOver(column("in_progress"), { dataTransfer: dt });
    fireEvent.drop(column("in_progress"), { dataTransfer: dt });
    expect(procedures.ticketTransition).not.toHaveBeenCalled();
  });

  it.each(["owner", "admin", "dev", "designer"])(
    "rôle %s : bouton « Déplacer » et cartes glissables, pas de mention de lecture seule",
    async (role) => {
      asRole(role);
      await renderBoard();
      await waitFor(() => expect(moveButton("TK-102")).toBeInTheDocument());
      expect(card("TK-102")).toHaveAttribute("draggable", "true");
      expect(screen.queryByText(/Lecture seule/)).not.toBeInTheDocument();
    },
  );

  it("rôle encore inconnu : rendu en lecture seule, sans flash de contrôles", async () => {
    procedures.organizationList.mockReturnValue(new Promise(() => undefined));
    await renderBoard();
    expect(screen.queryByRole("button", { name: /Déplacer/ })).not.toBeInTheDocument();
    expect(card("TK-102").getAttribute("draggable")).not.toBe("true");
  });
});
