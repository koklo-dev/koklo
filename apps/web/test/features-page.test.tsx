import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLIENT_SIDE,
  FEATURES,
  findTable,
  GIT_VOCABULARY,
  head,
  inputsOf,
  OTHER_PROJECT_ID,
  PROJECT_ID,
  page,
  renderFeatures,
  SHORT_SHA,
  serve,
  statusRegion,
  summary,
  TEAM,
  visibleText,
} from "./support/features.tsx";
import { findNamed, findRole } from "./support/wait.ts";
import {
  apiError,
  getSession,
  NO_SESSION,
  navigations,
  polyfillRadix,
  procedures,
  resetWebMocks,
  sessionWith,
  watchUrl,
} from "./support/web-mocks.ts";

vi.mock("next/navigation", async () => {
  const m = await import("./support/web-mocks.ts");
  return {
    useRouter: () => m.router,
    usePathname: () => m.pathname.current,
    useSearchParams: m.useSearchParams,
  };
});
vi.mock("../src/lib/auth-client.ts", async () => ({
  authClient: (await import("./support/web-mocks.ts")).authClient,
}));
vi.mock("../src/lib/orpc.ts", async () => ({
  orpc: (await import("./support/web-mocks.ts")).orpc,
}));

/**
 * TK-48 / 48d, écran /projects/[projectId]/features : en-tête, liste, filtres, pagination, erreurs de liste,
 * projet introuvable, session (design/screens/S-features.md §3, §4.1 à §4.4, §4.9, §4.10, §4.12).
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  serve();
});

const EMPTY_HEAD = head({ counts: { features: 0, tables: 0, endpoints: 0 } });
const neverResolves = () => new Promise<never>(() => undefined);
const reject = (code: string, data?: unknown) => () => Promise.reject(apiError(code, data));
const rowOf = (title: string): HTMLElement => {
  const row = screen.getByRole("link", { name: title }).closest("tr");
  if (!row) throw new Error(`ligne de « ${title} » introuvable`);
  return row;
};

describe("Chargement (§4.1)", () => {
  // Corps entre accolades : rendre le mock lui-même ferait de lui un « nettoyage » appelé et attendu (délai dépassé).
  beforeEach(() => {
    procedures.specHead.mockImplementation(neverResolves);
  });

  it("zone role=status aria-busy avec le libellé visible", async () => {
    renderFeatures();
    const status = await findRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Chargement des fonctionnalités…");
  });

  it("ni table, ni filtres, ni alerte, ni liste appelée", async () => {
    renderFeatures();
    await findRole("status");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(procedures.specListFeatures).not.toHaveBeenCalled();
  });

  it("le titre de page est déjà là", async () => {
    renderFeatures();
    expect(await findNamed("heading", "Fonctionnalités", { level: 1 })).toBeVisible();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("En-tête (§3.1)", () => {
  it("h1 unique « Fonctionnalités » et sous-titre : le nom du projet", async () => {
    renderFeatures();
    await findTable();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Fonctionnalités");
    // le nom du projet figure aussi dans le fil d'Ariane : on vise le sous-titre
    expect(await screen.findByText("Alpha", { selector: "p" })).toBeInTheDocument();
  });

  it("pendant le chargement du nom, le sous-titre est « Projet »", async () => {
    procedures.projectList.mockImplementation(neverResolves);
    renderFeatures();
    await findNamed("table", /^Fonctionnalités du projet/);
    expect(screen.getByText("Projet")).toBeInTheDocument();
  });

  it("fil d'Ariane nommé : Projets (lien) > nom du projet > Fonctionnalités (page courante)", async () => {
    renderFeatures();
    await findTable();
    const crumbs = screen.getByRole("navigation", { name: /fil d'ariane|breadcrumb/i });
    expect(within(crumbs).getByRole("link", { name: "Projets" })).toHaveAttribute(
      "href",
      "/projects",
    );
    expect(crumbs).toHaveTextContent("Alpha");
    expect(within(crumbs).getByText("Fonctionnalités")).toHaveAttribute("aria-current", "page");
  });

  it("compteur sans filtre : N fonctionnalités (spec.head.counts.features), au singulier à 1", async () => {
    renderFeatures();
    await findTable();
    expect(statusRegion()).toHaveTextContent("3 fonctionnalités");
    expect(statusRegion()).not.toHaveTextContent("affichée");
  });

  it("compteur au singulier", async () => {
    procedures.specHead.mockResolvedValue(
      head({ counts: { features: 1, tables: 0, endpoints: 0 } }),
    );
    procedures.specListFeatures.mockResolvedValue({
      items: FEATURES.slice(0, 1),
      nextCursor: null,
    });
    renderFeatures();
    await findTable();
    expect(statusRegion()).toHaveTextContent(/(^|\s)1 fonctionnalité(\s|$)/);
  });

  it.each(TEAM)(
    "%s : version de la spec (7 caractères, mono) et date d'indexation",
    async (role) => {
      serve(role);
      renderFeatures();
      await findTable();
      const version = screen.getByLabelText(`Version de la spec ${SHORT_SHA}`);
      expect(version).toHaveTextContent(SHORT_SHA);
      expect(version.className).toMatch(/font-mono/);
      expect(visibleText()).toContain("Version de la spec");
      expect(visibleText()).toMatch(/indexée le 30 octobre 2026/);
      expect(visibleText()).not.toContain("a1b2c3d4e5f6");
    },
  );

  it.each(CLIENT_SIDE)("%s : « Mise à jour le … », aucun identifiant technique", async (role) => {
    serve(role);
    renderFeatures();
    await findTable();
    expect(visibleText()).toMatch(/Mise à jour le 30 octobre 2026/);
    expect(visibleText()).not.toMatch(/a1b2c3d|Version de la spec|indexée/i);
    expect(screen.queryByLabelText(/Version de la spec/)).not.toBeInTheDocument();
  });

  it("la ligne de version est absente tant que spec.head n'a pas répondu", async () => {
    procedures.specHead.mockImplementation(neverResolves);
    renderFeatures();
    await findRole("status");
    expect(visibleText()).not.toMatch(/Version de la spec|Mise à jour le/);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Liste (§3.3, §4.2)", () => {
  it("interroge head puis la liste du projet : limite 50, aucun filtre ni curseur", async () => {
    renderFeatures();
    await findTable();
    expect(inputsOf(procedures.specHead)[0]).toMatchObject({ projectId: PROJECT_ID });
    const first = inputsOf(procedures.specListFeatures)[0];
    expect(first).toMatchObject({ projectId: PROJECT_ID, limit: 50 });
    expect(first).not.toHaveProperty("status");
    expect(first).not.toHaveProperty("priority");
    expect(first).not.toHaveProperty("cursor");
    expect(procedures.repoList).not.toHaveBeenCalled();
  });

  it("table nommée par sa légende, cinq en-têtes de colonne avec scope=col", async () => {
    renderFeatures();
    const table = await findTable();
    expect(table).toHaveAccessibleName("Fonctionnalités du projet Alpha");
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual([
      "Identifiant",
      "Titre",
      "Statut",
      "Priorité",
      "Critères",
    ]);
    for (const header of headers) expect(header).toHaveAttribute("scope", "col");
  });

  it("une ligne par fonctionnalité, dans l'ordre de l'API (aucun tri côté web)", async () => {
    procedures.specListFeatures.mockResolvedValue({
      items: [FEATURES[2], FEATURES[0], FEATURES[1]],
      nextCursor: null,
    });
    renderFeatures();
    const table = await findTable();
    const ids = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[0]?.textContent);
    expect(ids).toEqual(["F-003", "F-001", "F-002"]);
  });

  it("identifiant en mono, titre en vrai lien vers ?feature=, infobulle native avec le titre complet", async () => {
    renderFeatures();
    await findTable();
    const row = rowOf("Connexion par e-mail");
    const id = within(row).getByText("F-001");
    expect(id.className).toMatch(/font-mono/);
    const link = within(row).getByRole("link", { name: "Connexion par e-mail" });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toMatch(/\?feature=F-001$/);
    expect(link).toHaveAttribute("title", "Connexion par e-mail");
  });

  it("le titre est le seul élément interactif de la ligne", async () => {
    renderFeatures();
    await findTable();
    const interactive = within(rowOf("Tableau kanban")).queryAllByRole("button");
    expect(interactive).toHaveLength(0);
    expect(within(rowOf("Tableau kanban")).getAllByRole("link")).toHaveLength(1);
  });

  it.each([
    ["Connexion par e-mail", "Brouillon", "Indispensable", "3 critères"],
    ["Tableau kanban", "Implémentée", "Importante", "1 critère"],
    ["Export des tickets", "Adoptée", "Reportée", "0 critère"],
  ])(
    "« %s » : statut %s (icône + texte), priorité %s, %s",
    async (title, status, priority, criteria) => {
      renderFeatures();
      await findTable();
      const row = rowOf(title);
      const badge = within(row).getByText(status);
      expect(badge.closest("[data-slot='badge'], span, div")).not.toBeNull();
      // icône décorative doublant le libellé : jamais la couleur seule
      expect(
        badge.parentElement?.querySelector('svg[aria-hidden="true"]') ??
          badge.querySelector('svg[aria-hidden="true"]'),
      ).not.toBeNull();
      expect(within(row).getByText(priority)).toBeInTheDocument();
      expect(within(row).getByText(criteria)).toBeInTheDocument();
    },
  );

  it("« Indispensable » est en gras et en texte principal, les autres en texte atténué", async () => {
    renderFeatures();
    await findTable();
    expect(within(rowOf("Connexion par e-mail")).getByText("Indispensable").className).toMatch(
      /font-semibold/,
    );
    expect(within(rowOf("Tableau kanban")).getByText("Importante").className).toMatch(
      /text-muted-foreground/,
    );
  });

  it("aucune valeur brute du contrat dans le DOM (brouillon, specifiee, must...)", async () => {
    renderFeatures();
    await findTable();
    expect(visibleText()).not.toMatch(
      /\b(brouillon|specifiee|implementee|adoptee|must|should|could|wont)\b/,
    );
  });

  it("aucune fonctionnalité sans version : pas de « Afficher plus » quand nextCursor est null", async () => {
    renderFeatures();
    await findTable();
    expect(
      screen.queryByRole("button", { name: "Afficher plus de fonctionnalités" }),
    ).not.toBeInTheDocument();
  });

  it("le client ne voit aucun bouton d'écriture (créer, modifier, supprimer) ; l'équipe, 48e-1", async () => {
    serve("client");
    renderFeatures();
    await findTable();
    expect(
      screen.queryByRole("button", { name: /nouvelle|créer|modifier|supprimer|ajouter/i }),
    ).not.toBeInTheDocument();
  });

  it("le client ne voit aucun chemin de fichier dans la liste", async () => {
    serve("client");
    renderFeatures();
    await findTable();
    expect(visibleText()).not.toMatch(GIT_VOCABULARY);
  });
});

describe("Vide (§4.3)", () => {
  beforeEach(() => {
    procedures.specHead.mockResolvedValue(EMPTY_HEAD);
    procedures.specListFeatures.mockResolvedValue({ items: [], nextCursor: null });
  });

  it("carte « Aucune fonctionnalité pour le moment » avec son texte, sans table ni filtres", async () => {
    renderFeatures();
    expect(await findNamed("heading", "Aucune fonctionnalité pour le moment")).toBeVisible();
    expect(visibleText()).toContain("La spec de ce projet ne décrit encore aucune fonctionnalité.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("le client ne voit aucun bouton, aucun emplacement d'écriture vide", async () => {
    serve("client");
    procedures.specHead.mockResolvedValue(EMPTY_HEAD);
    procedures.specListFeatures.mockResolvedValue({ items: [], nextCursor: null });
    renderFeatures();
    await findNamed("heading", "Aucune fonctionnalité pour le moment");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([...TEAM, ...CLIENT_SIDE])("même carte pour %s", async (role) => {
    serve(role);
    procedures.specListFeatures.mockResolvedValue({ items: [], nextCursor: null });
    procedures.specHead.mockResolvedValue(EMPTY_HEAD);
    renderFeatures();
    expect(await findNamed("heading", "Aucune fonctionnalité pour le moment")).toBeVisible();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Filtres (§3.2)", () => {
  const statusSelect = () => screen.getByRole("combobox", { name: "Statut" });
  const prioritySelect = () => screen.getByRole("combobox", { name: "Priorité" });
  const pick = async (select: HTMLElement, option: string) => {
    await userEvent.click(select);
    await userEvent.click(await findNamed("option", option));
  };

  it("deux Select à libellé visible, sans bouton « Appliquer », sur « Tous » / « Toutes »", async () => {
    renderFeatures();
    await findTable();
    expect(statusSelect()).toHaveTextContent("Tous");
    expect(prioritySelect()).toHaveTextContent("Toutes");
    // « Statut » et « Priorité » sont aussi des en-têtes de colonne : on vise les libellés des filtres
    expect(screen.getByText("Statut", { selector: "label" })).toBeVisible();
    expect(screen.getByText("Priorité", { selector: "label" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /appliquer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Effacer les filtres" })).not.toBeInTheDocument();
  });

  it("options du statut et de la priorité, en toutes lettres", async () => {
    renderFeatures();
    await findTable();
    await userEvent.click(statusSelect());
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual([
      "Tous",
      "Brouillon",
      "Spécifiée",
      "Implémentée",
      "Adoptée",
    ]);
    await userEvent.keyboard("{Escape}");
    await userEvent.click(prioritySelect());
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual([
      "Toutes",
      "Indispensable",
      "Importante",
      "Souhaitable",
      "Reportée",
    ]);
  });

  it("choisir un statut relance la requête avec status, met à jour l'adresse sans empiler l'historique", async () => {
    renderFeatures();
    await findTable();
    const length = window.history.length;
    await pick(statusSelect(), "Brouillon");
    await waitFor(() =>
      expect(inputsOf(procedures.specListFeatures).at(-1)).toMatchObject({ status: "brouillon" }),
    );
    expect(new URLSearchParams(window.location.search).get("status")).toBe("brouillon");
    expect(window.history.length).toBe(length);
  });

  it("choisir une priorité envoie priority ; les deux filtres se cumulent", async () => {
    renderFeatures();
    await findTable();
    await pick(prioritySelect(), "Indispensable");
    await waitFor(() =>
      expect(inputsOf(procedures.specListFeatures).at(-1)).toMatchObject({ priority: "must" }),
    );
    await pick(statusSelect(), "Adoptée");
    await waitFor(() =>
      expect(inputsOf(procedures.specListFeatures).at(-1)).toMatchObject({
        priority: "must",
        status: "adoptee",
      }),
    );
    expect(Object.fromEntries(new URLSearchParams(window.location.search))).toEqual({
      priority: "must",
      status: "adoptee",
    });
  });

  it("filtres lus dans l'adresse au chargement", async () => {
    renderFeatures({ search: "?status=adoptee&priority=wont" });
    await findTable();
    expect(inputsOf(procedures.specListFeatures)[0]).toMatchObject({
      status: "adoptee",
      priority: "wont",
    });
    expect(statusSelect()).toHaveTextContent("Adoptée");
    expect(prioritySelect()).toHaveTextContent("Reportée");
  });

  it("valeur d'adresse inconnue ignorée : requête sans filtre, pas d'« Effacer »", async () => {
    renderFeatures({ search: "?status=zzz&priority=high" });
    await findTable();
    expect(inputsOf(procedures.specListFeatures)[0]).not.toHaveProperty("status");
    expect(inputsOf(procedures.specListFeatures)[0]).not.toHaveProperty("priority");
    expect(screen.queryByRole("button", { name: "Effacer les filtres" })).not.toBeInTheDocument();
  });

  it("filtre actif : compteur « N fonctionnalité(s) affichée(s) » et bouton « Effacer les filtres »", async () => {
    procedures.specListFeatures.mockResolvedValue({
      items: FEATURES.slice(0, 2),
      nextCursor: null,
    });
    renderFeatures({ search: "?status=brouillon" });
    await findTable();
    expect(statusRegion()).toHaveTextContent("2 fonctionnalités affichées");
    expect(statusRegion()).not.toHaveTextContent("plus de");
    expect(screen.getByRole("button", { name: "Effacer les filtres" })).toBeEnabled();
  });

  it("filtre actif avec une suite : « sur plus de N »", async () => {
    procedures.specListFeatures.mockResolvedValue(page(1, 50, "c1"));
    renderFeatures({ search: "?priority=must" });
    await findTable();
    expect(statusRegion()).toHaveTextContent(/50 fonctionnalités affichées sur plus de 50/);
  });

  it("« Effacer les filtres » retire les paramètres, relance sans filtre et passe le focus au premier Select", async () => {
    renderFeatures({ search: "?status=brouillon&priority=must" });
    await findTable();
    await userEvent.click(screen.getByRole("button", { name: "Effacer les filtres" }));
    await waitFor(() =>
      expect(inputsOf(procedures.specListFeatures).at(-1)).not.toHaveProperty("status"),
    );
    expect(inputsOf(procedures.specListFeatures).at(-1)).not.toHaveProperty("priority");
    expect(window.location.search).toBe("");
    expect(statusSelect()).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Effacer les filtres" })).not.toBeInTheDocument();
  });

  it("pendant le rechargement : les éléments précédents disparaissent, les filtres restent, état de chargement", async () => {
    renderFeatures();
    await findTable();
    procedures.specListFeatures.mockImplementation(neverResolves);
    await pick(statusSelect(), "Adoptée");
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Connexion par e-mail" })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(statusSelect()).toBeVisible();
    expect(statusRegion()).toHaveAttribute("aria-busy", "true");
    expect(statusRegion()).toHaveTextContent("Chargement des fonctionnalités…");
  });

  it("changer de filtre oublie le curseur et remplace la liste", async () => {
    procedures.specListFeatures.mockResolvedValueOnce(page(1, 50, "c1"));
    renderFeatures();
    await findTable();
    await userEvent.click(screen.getByRole("button", { name: "Afficher plus de fonctionnalités" }));
    await waitFor(() =>
      expect(inputsOf(procedures.specListFeatures).at(-1)).toMatchObject({ cursor: "c1" }),
    );
    procedures.specListFeatures.mockResolvedValue({
      items: [summary(7, { title: "Seule" })],
      nextCursor: null,
    });
    await pick(prioritySelect(), "Souhaitable");
    await waitFor(() =>
      expect(inputsOf(procedures.specListFeatures).at(-1)).toMatchObject({ priority: "could" }),
    );
    expect(inputsOf(procedures.specListFeatures).at(-1)).not.toHaveProperty("cursor");
    expect(await findNamed("link", "Seule")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Fonctionnalité numéro 1" })).not.toBeInTheDocument();
  });
});

describe("Vide filtré (§4.4)", () => {
  beforeEach(() => procedures.specListFeatures.mockResolvedValue({ items: [], nextCursor: null }));

  it("filtres conservés, message en role=status, « Effacer les filtres » à la place de la table", async () => {
    renderFeatures({ search: "?status=adoptee" });
    expect(
      await screen.findByText("Aucune fonctionnalité ne correspond à ces filtres."),
    ).toBeInTheDocument();
    expect(statusRegion()).toHaveTextContent("Aucune fonctionnalité ne correspond à ces filtres.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Statut" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Priorité" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Effacer les filtres" }).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.queryByRole("heading", { name: "Aucune fonctionnalité pour le moment" }),
    ).not.toBeInTheDocument();
  });

  it("« Effacer les filtres » ramène la liste et le focus sur le premier Select", async () => {
    renderFeatures({ search: "?status=adoptee" });
    await screen.findByText("Aucune fonctionnalité ne correspond à ces filtres.");
    procedures.specListFeatures.mockResolvedValue({ items: FEATURES, nextCursor: null });
    await userEvent.click(
      screen.getAllByRole("button", { name: "Effacer les filtres" })[0] as HTMLElement,
    );
    await findTable();
    expect(window.location.search).toBe("");
    expect(screen.getByRole("combobox", { name: "Statut" })).toHaveFocus();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Afficher plus (§3.3)", () => {
  const more = () => screen.getByRole("button", { name: "Afficher plus de fonctionnalités" });

  it("page de 50 : bouton sous la table, nextCursor transmis au clic, éléments ajoutés à la suite", async () => {
    procedures.specListFeatures
      .mockResolvedValueOnce(page(1, 50, "c1"))
      .mockResolvedValueOnce(page(51, 10, null));
    renderFeatures();
    const table = await findTable();
    expect(within(table).getAllByRole("row")).toHaveLength(51);
    await userEvent.click(more());
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(61));
    expect(inputsOf(procedures.specListFeatures)[1]).toMatchObject({
      projectId: PROJECT_ID,
      limit: 50,
      cursor: "c1",
    });
    expect(screen.getByRole("link", { name: "Fonctionnalité numéro 1" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Fonctionnalité numéro 60" })).toBeInTheDocument();
  });

  it("annonce « N fonctionnalités de plus affichées. » avec le nombre réel, et retire le bouton à la dernière page", async () => {
    procedures.specListFeatures
      .mockResolvedValueOnce(page(1, 50, "c1"))
      .mockResolvedValueOnce(page(51, 10, null));
    renderFeatures();
    await findTable();
    await userEvent.click(more());
    await waitFor(() =>
      expect(statusRegion()).toHaveTextContent("10 fonctionnalités de plus affichées."),
    );
    expect(
      screen.queryByRole("button", { name: "Afficher plus de fonctionnalités" }),
    ).not.toBeInTheDocument();
  });

  it("pendant l'appel : bouton désactivé, aria-busy, « Chargement… », focus conservé", async () => {
    let release: (value: unknown) => void = () => undefined;
    procedures.specListFeatures
      .mockResolvedValueOnce(page(1, 50, "c1"))
      .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    renderFeatures();
    await findTable();
    await userEvent.click(more());
    const busy = await findNamed("button", "Chargement…");
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy).toHaveFocus();
    release(page(51, 1, null));
    await findNamed("link", "Fonctionnalité numéro 51");
  });

  it("échec de la suite : alerte sous la table, éléments déjà chargés conservés, « Réessayer » relance la même page", async () => {
    procedures.specListFeatures
      .mockResolvedValueOnce(page(1, 50, "c1"))
      .mockImplementationOnce(reject("INTERNAL"))
      .mockResolvedValueOnce(page(51, 5, null));
    renderFeatures();
    const table = await findTable();
    await userEvent.click(more());
    const alert = await findRole("alert");
    expect(alert.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(within(table).getAllByRole("row")).toHaveLength(51);
    await userEvent.click(within(alert).getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(56));
    expect(inputsOf(procedures.specListFeatures).at(-1)).toMatchObject({ cursor: "c1" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("VALIDATION sur la suite : « La liste n'a pas pu être poursuivie » et « Revenir au début » (filtres conservés)", async () => {
    procedures.specListFeatures
      .mockResolvedValueOnce(page(1, 50, "c1"))
      .mockImplementationOnce(reject("VALIDATION"))
      .mockResolvedValueOnce(page(1, 50, "c2"));
    renderFeatures({ search: "?status=specifiee" });
    const table = await findTable();
    await userEvent.click(more());
    const alert = await findRole("alert");
    expect(alert).toHaveTextContent("La liste n'a pas pu être poursuivie");
    expect(alert).toHaveTextContent("Revenez au début de la liste puis réessayez.");
    expect(within(table).getAllByRole("row")).toHaveLength(51);
    await userEvent.click(within(alert).getByRole("button", { name: "Revenir au début" }));
    await waitFor(() => expect(procedures.specListFeatures).toHaveBeenCalledTimes(3));
    const restart = inputsOf(procedures.specListFeatures)[2];
    expect(restart).not.toHaveProperty("cursor");
    expect(restart).toMatchObject({ status: "specifiee" });
    expect(window.location.search).toContain("status=specifiee");
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});

describe("Erreur de chargement de la liste (§4.9)", () => {
  it.each([
    ["INTERNAL", reject("INTERNAL")],
    ["réseau", () => Promise.reject(new TypeError("fetch failed"))],
  ])(
    "%s : alerte unique, texte du produit, « Réessayer » relance et affiche la liste",
    async (_label, failure) => {
      procedures.specListFeatures.mockImplementationOnce(failure);
      renderFeatures();
      const alert = await findRole("alert");
      expect(alert).toHaveTextContent("Impossible de charger les fonctionnalités");
      expect(alert).toHaveTextContent(
        "Une erreur est survenue. Vérifiez votre connexion puis réessayez.",
      );
      expect(screen.getAllByRole("alert")).toHaveLength(1);
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(visibleText()).not.toMatch(/fetch failed|INTERNAL/);
      await userEvent.click(within(alert).getByRole("button", { name: "Réessayer" }));
      await findTable();
      expect(procedures.specListFeatures).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );

  it("l'erreur de head est traitée de même (alerte + Réessayer)", async () => {
    procedures.specHead.mockImplementationOnce(reject("INTERNAL"));
    renderFeatures();
    const alert = await findRole("alert");
    expect(alert).toHaveTextContent("Impossible de charger les fonctionnalités");
    await userEvent.click(within(alert).getByRole("button", { name: "Réessayer" }));
    await findTable();
  });
});

describe("Projet introuvable (§4.10)", () => {
  const expectNotFound = async () => {
    expect(await findNamed("heading", "Projet introuvable")).toBeVisible();
    expect(visibleText()).toContain("Ce projet n'existe pas ou vous n'y avez pas accès.");
    expect(screen.getByRole("link", { name: "Voir les projets" })).toHaveAttribute(
      "href",
      "/projects",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(visibleText()).not.toMatch(/accès refusé|interdit|forbidden/i);
  };

  it("spec.head NOT_FOUND : même réponse pour un projet d'autrui ou inexistant, aucun autre appel", async () => {
    procedures.specHead.mockImplementation(reject("NOT_FOUND"));
    renderFeatures({ projectId: OTHER_PROJECT_ID });
    await expectNotFound();
    expect(procedures.specListFeatures).not.toHaveBeenCalled();
    expect(procedures.repoList).not.toHaveBeenCalled();
    expect(procedures.specGetFeature).not.toHaveBeenCalled();
  });

  it("spec.listFeatures NOT_FOUND : même état", async () => {
    procedures.specListFeatures.mockImplementation(reject("NOT_FOUND"));
    renderFeatures();
    await expectNotFound();
  });

  it.each(["pas-un-uuid", "42", "../etc"])(
    "projectId invalide (%s) : état introuvable sans aucun appel de spec",
    async (projectId) => {
      renderFeatures({ projectId });
      await expectNotFound();
      expect(procedures.specHead).not.toHaveBeenCalled();
      expect(procedures.specListFeatures).not.toHaveBeenCalled();
      expect(procedures.repoList).not.toHaveBeenCalled();
    },
  );

  it("l'icône lock est décorative et le texte porte le sens", async () => {
    procedures.specHead.mockImplementation(reject("NOT_FOUND"));
    renderFeatures();
    const heading = await findNamed("heading", "Projet introuvable");
    expect(
      heading.closest("[data-slot='card'], div")?.querySelector('svg[aria-hidden="true"]'),
    ).not.toBeNull();
  });
});

describe("Session (§4.12)", () => {
  it("UNAUTHORIZED sans session : redirection vers /login, sans message", async () => {
    procedures.specHead.mockImplementation(reject("UNAUTHORIZED"));
    getSession.mockResolvedValue(NO_SESSION);
    renderFeatures();
    await waitFor(() => expect(navigations()).toContain("/login"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(visibleText()).not.toMatch(/Une erreur est survenue|Impossible de charger/);
  });

  it("UNAUTHORIZED avec session sans organisation active : /organizations, jamais /login", async () => {
    procedures.specHead.mockImplementation(reject("UNAUTHORIZED"));
    getSession.mockResolvedValue(sessionWith(null));
    renderFeatures();
    await waitFor(() => expect(navigations()).toContain("/organizations"));
    expect(navigations()).not.toContain("/login");
  });

  it("UNAUTHORIZED de la liste : même redirection", async () => {
    procedures.specListFeatures.mockImplementation(reject("UNAUTHORIZED"));
    getSession.mockResolvedValue(NO_SESSION);
    renderFeatures();
    await waitFor(() => expect(navigations()).toContain("/login"));
  });
});
