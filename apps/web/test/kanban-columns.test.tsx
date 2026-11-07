import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KanbanPage } from "../src/components/kanban-page.tsx";
import { listFor } from "./support/kanban-server.ts";
import { renderWithQuery } from "./support/render.tsx";
import { findNamed, findRole } from "./support/wait.ts";
import {
  apiError,
  getSession,
  ORG_ID,
  organization,
  polyfillRadix,
  procedures,
  resetWebMocks,
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

/**
 * TK-94 lot C, kanban sans chargement complet (design/screens/S-kanban.md 1.2, 02-design.md §2.2) :
 * une requête par colonne, 30 cartes puis la suite à la demande, total du serveur dans l'en-tête.
 */
const SPRINT = {
  id: "01900000-0000-7000-8000-0000000000f1",
  key: "SP-7",
  goal: "Rendre le kanban utilisable",
  status: "active",
  startsOn: "2026-10-26",
  endsOn: "2026-11-06",
  definitionOfDone: "",
};
const STATUSES = ["backlog", "todo", "in_progress", "in_review", "blocked", "done", "cancelled"];

const ticket = (n: number, status: string) => ({
  id: `01900000-0000-7000-8000-${String(n).padStart(12, "0")}`,
  key: `TK-${n}`,
  title: `Titre de TK-${n}`,
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
});

type Ticket = ReturnType<typeof ticket>;
let board: Ticket[] = [];
/** 142 tickets « À faire » (TK-1000 à TK-1141), 3 « En cours », 1 « Terminé ». */
const bigBoard = (): Ticket[] => [
  ...Array.from({ length: 142 }, (_, i) => ticket(1000 + i, "todo")),
  ...Array.from({ length: 3 }, (_, i) => ticket(2000 + i, "in_progress")),
  ticket(3000, "done"),
];

const PROJECT_ID = "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01";

type Input = {
  projectId?: string;
  status?: string;
  sprintId?: string;
  limit?: number;
  cursor?: string;
};
const calls = (): Input[] => procedures.ticketList.mock.calls.map((call) => call[0] as Input);
const callsFor = (status: string): Input[] => calls().filter((input) => input.status === status);

const column = (status: string) => screen.getByTestId(`kanban-column-${status}`);
const cardsIn = (status: string) => within(column(status)).queryAllByTestId(/^kanban-card-/).length;
const loadMore = (status: string) =>
  within(column(status)).getByRole("button", { name: /Charger la suite/ });

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  board = bigBoard();
  getSession.mockResolvedValue(sessionWith(ORG_ID));
  procedures.organizationList.mockResolvedValue([organization({ role: "owner" })]);
  procedures.projectList.mockResolvedValue([{ id: PROJECT_ID, name: "Atelier Lumière" }]);
  procedures.sprintList.mockResolvedValue([SPRINT]);
  procedures.ticketList.mockImplementation(async (input: Input) => listFor(board, input));
  procedures.ticketTransition.mockImplementation(async (input: { key: string; to: string }) => {
    const found = board.find((t) => t.key === input.key);
    if (!found) throw apiError("NOT_FOUND");
    found.status = input.to;
    return { ...found };
  });
});

async function renderBoard() {
  renderWithQuery(<KanbanPage />);
  await screen.findByTestId("kanban-board");
  await waitFor(() => expect(cardsIn("todo")).toBeGreaterThan(0));
}

describe("Requêtes par colonne (T22)", () => {
  it("une requête par statut, de 30 tickets, du sprint actif : aucune requête sans statut", async () => {
    await renderBoard();
    const first = calls().filter((input) => input.cursor === undefined);
    expect(first.map((input) => input.status).sort()).toEqual([...STATUSES].sort());
    for (const input of first)
      expect(input).toMatchObject({ projectId: PROJECT_ID, sprintId: "SP-7", limit: 30 });
  });

  it("aucune requête n'enchaîne les pages : 142 tickets à faire, une seule page lue", async () => {
    await renderBoard();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(procedures.ticketList).toHaveBeenCalledTimes(7);
    expect(calls().some((input) => input.cursor !== undefined)).toBe(false);
  });

  it("30 cartes montées dans la colonne de 142 tickets, 3 dans la colonne de 3", async () => {
    await renderBoard();
    expect(cardsIn("todo")).toBe(30);
    expect(cardsIn("in_progress")).toBe(3);
  });
});

describe("Totaux du serveur", () => {
  it("l'en-tête de colonne affiche le total (142) alors que 30 cartes sont montées", async () => {
    await renderBoard();
    const badge = within(column("todo")).getByLabelText("142 tickets");
    expect(badge).toHaveTextContent("142");
    expect(within(column("done")).getByLabelText("1 ticket")).toHaveTextContent("1");
  });

  it("le sous-titre additionne les totaux des colonnes (146), pas les cartes montées", async () => {
    await renderBoard();
    expect(screen.getByText("146 tickets")).toBeInTheDocument();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Pied de colonne", () => {
  it("« Charger la suite · 112 restantes » sous les 30 premières cartes", async () => {
    await renderBoard();
    expect(loadMore("todo")).toHaveTextContent("Charger la suite · 112 restantes");
  });

  it("les colonnes de moins de 30 cartes n'ont pas de pied", async () => {
    await renderBoard();
    expect(within(column("in_progress")).queryByRole("button", { name: /suite/ })).toBeNull();
    expect(column("in_progress").querySelector("[data-slot='list-footer']")).toBeNull();
    expect(column("backlog").querySelector("[data-slot='list-footer']")).toBeNull();
  });

  it("le bouton charge la page suivante de cette colonne seulement, avec son curseur", async () => {
    await renderBoard();
    await userEvent.click(loadMore("todo"));
    await waitFor(() => expect(cardsIn("todo")).toBe(60));
    const next = callsFor("todo").at(-1);
    expect(next).toMatchObject({ status: "todo", sprintId: "SP-7", limit: 30, cursor: "30" });
    expect(callsFor("in_progress")).toHaveLength(1);
    expect(loadMore("todo")).toHaveTextContent("Charger la suite · 82 restantes");
    expect(within(column("todo")).getByLabelText("142 tickets")).toBeInTheDocument();
  });

  it("le bouton est atteignable à la touche Tab et s'active à Entrée", async () => {
    await renderBoard();
    const button = loadMore("todo");
    button.focus();
    expect(button).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(cardsIn("todo")).toBe(60));
  });

  it("pendant le chargement : « Chargement… » dans le pied, les cartes restent affichées", async () => {
    let release: (value: unknown) => void = () => undefined;
    await renderBoard();
    procedures.ticketList.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve)),
    );
    await userEvent.click(loadMore("todo"));
    const footer = column("todo").querySelector("[data-slot='list-footer']") as HTMLElement;
    await waitFor(() => expect(footer).toHaveTextContent("Chargement…"));
    expect(cardsIn("todo")).toBe(30);
    release(listFor(board, { status: "todo", sprintId: "SP-7", limit: 30, cursor: "30" }));
    await waitFor(() => expect(cardsIn("todo")).toBe(60));
  });

  it("erreur de suite : message dans la colonne, cartes conservées, autres colonnes intactes, « Réessayer »", async () => {
    await renderBoard();
    procedures.ticketList.mockImplementationOnce(() => Promise.reject(apiError("INTERNAL")));
    await userEvent.click(loadMore("todo"));
    const alert = await within(column("todo")).findByRole("alert");
    expect(alert).toHaveTextContent("Impossible de charger la suite.");
    expect(cardsIn("todo")).toBe(30);
    expect(cardsIn("in_progress")).toBe(3);
    expect(within(column("in_progress")).queryByRole("alert")).toBeNull();
    // La garde de useSingleFlight se lève deux images après l'échec : « Réessayer » avant ce délai est ignoré.
    await new Promise((resolve) => setTimeout(resolve, 150));
    await userEvent.click(within(alert).getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(cardsIn("todo")).toBe(60));
    expect(callsFor("todo").at(-1)).toMatchObject({ cursor: "30" });
  });

  it("dernière page : « Fin de la colonne », plus de bouton", async () => {
    board = [
      ...board.filter((t) => t.status !== "todo"),
      ...Array.from({ length: 35 }, (_, i) => ticket(4000 + i, "todo")),
    ];
    await renderBoard();
    await userEvent.click(loadMore("todo"));
    await waitFor(() => expect(cardsIn("todo")).toBe(35));
    const footer = column("todo").querySelector("[data-slot='list-footer']") as HTMLElement;
    expect(footer).toHaveTextContent("Fin de la colonne");
    expect(within(column("todo")).queryByRole("button", { name: /Charger la suite/ })).toBeNull();
  });
});

describe("Défilement de la colonne (80 %)", () => {
  /** jsdom ne mesure rien : on impose les dimensions de la zone défilante de la colonne. */
  function scrollTo(status: string, ratio: number) {
    const scroller = column(status).querySelector("[data-column-scroll]") as HTMLElement;
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(scroller, "scrollTop", { configurable: true, value: ratio * 1000 - 400 });
    fireEvent.scroll(scroller);
  }

  it("à 80 % du défilement, la suite est demandée une seule fois", async () => {
    await renderBoard();
    scrollTo("todo", 0.5);
    expect(callsFor("todo")).toHaveLength(1);
    scrollTo("todo", 0.85);
    scrollTo("todo", 0.9);
    await waitFor(() => expect(cardsIn("todo")).toBe(60));
    expect(callsFor("todo").filter((input) => input.cursor === "30")).toHaveLength(1);
  });

  it("ne demande rien tant que « Charger la suite » a le focus (le bouton ne se remplace pas sous les doigts)", async () => {
    await renderBoard();
    loadMore("todo").focus();
    scrollTo("todo", 0.95);
    expect(callsFor("todo")).toHaveLength(1);
    expect(loadMore("todo")).toHaveFocus();
  });

  it("ne demande rien quand la colonne est finie", async () => {
    await renderBoard();
    await act(async () => scrollTo("in_progress", 0.95));
    expect(callsFor("in_progress")).toHaveLength(1);
  });
});

describe("Erreur sur une colonne", () => {
  it("la première page d'une colonne échoue : elle affiche son erreur, les autres sont servies", async () => {
    procedures.ticketList.mockImplementation(async (input: Input) => {
      if (input.status === "blocked") throw apiError("INTERNAL");
      return listFor(board, input);
    });
    await renderBoard();
    const alert = await within(column("blocked")).findByRole("alert");
    expect(alert).toHaveTextContent("Impossible de charger cette colonne");
    expect(cardsIn("todo")).toBe(30);
    expect(within(column("todo")).queryByRole("alert")).toBeNull();
    procedures.ticketList.mockImplementation(async (input: Input) => listFor(board, input));
    await userEvent.click(within(alert).getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(within(column("blocked")).queryByRole("alert")).toBeNull());
  });

  it("toutes les colonnes échouent : l'état d'erreur de l'écran, comme avant", async () => {
    procedures.ticketList.mockImplementation(() => Promise.reject(apiError("INTERNAL")));
    renderWithQuery(<KanbanPage />);
    const alert = await findRole("alert");
    expect(alert).toHaveTextContent("Impossible de charger le kanban");
    expect(within(alert).getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
    expect(screen.queryByTestId("kanban-board")).toBeNull();
  });
});

describe("Déplacer une carte met à jour les deux totaux", () => {
  it("TK-2000 de « En cours » vers « Terminé » : 2 et 2, annonce avec le total d'arrivée", async () => {
    await renderBoard();
    await within(card("TK-2000")).findByText("Déplacer");
    screen.getByRole("button", { name: "Déplacer TK-2000" }).focus();
    await userEvent.keyboard("{Enter}");
    const menu = await findNamed("menu", "Déplacer TK-2000 vers");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Terminé" }));
    await waitFor(() =>
      expect(within(column("done")).getByLabelText("2 tickets")).toBeInTheDocument(),
    );
    expect(within(column("in_progress")).getByLabelText("2 tickets")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "TK-2000 déplacé vers Terminé · Terminé : 2",
    );
  });
});

const card = (key: string) => screen.getByTestId(`kanban-card-${key}`);
