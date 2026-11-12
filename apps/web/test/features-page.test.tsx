import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FEATURES,
  findList,
  head,
  inputsOf,
  list,
  OTHER_PROJECT_ID,
  PROJECT_ID,
  page,
  renderFeatures,
  rowOf,
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
const countBar = (): HTMLElement =>
  document.querySelector("[data-slot='count-bar']") as HTMLElement;

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
    expect(await findNamed("heading", "Cahier fonctionnel", { level: 1 })).toBeVisible();
  });
});

describe("Brouillons de l'ancien Assistant de cadrage (TK-102)", () => {
  it("le chargement du cahier supprime koklo:framing-draft:* et ne touche pas aux autres clés", async () => {
    localStorage.setItem(`koklo:framing-draft:${PROJECT_ID}`, JSON.stringify({ briefTitle: "x" }));
    localStorage.setItem("koklo:autre-reglage", "{}");

    renderFeatures();
    await findList();

    expect(localStorage.getItem(`koklo:framing-draft:${PROJECT_ID}`)).toBeNull();
    expect(localStorage.getItem("koklo:autre-reglage")).toBe("{}");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("En-tête (§3.1)", () => {
  it("h1 unique « Cahier fonctionnel » et, dans l'emplacement, le nom du projet", async () => {
    renderFeatures();
    await findList();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Cahier fonctionnel");
    const location = screen.getByRole("navigation", { name: "Emplacement" });
    expect(await within(location).findByRole("link", { name: "Alpha" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}`,
    );
  });

  it("pendant le chargement du nom, l'emplacement dit « Projet »", async () => {
    procedures.projectList.mockImplementation(neverResolves);
    renderFeatures();
    await findList();
    expect(
      within(screen.getByRole("navigation", { name: "Emplacement" })).getByRole("link", {
        name: "Projet",
      }),
    ).toBeInTheDocument();
  });

  it("emplacement nommé : projet (lien) / Spec / Fonctionnel (page courante), plus de fil d'Ariane v1", async () => {
    renderFeatures();
    await findList();
    expect(screen.queryByRole("navigation", { name: /fil d'ariane|breadcrumb/i })).toBeNull();
    const location = screen.getByRole("navigation", { name: "Emplacement" });
    expect(location).toHaveTextContent(/Alpha.*Spec.*Fonctionnel/);
    expect(within(location).getByText("Fonctionnel")).toHaveAttribute("aria-current", "page");
  });

  it("onglets en liens : un compteur par onglet (spec.head.counts)", async () => {
    renderFeatures();
    await findList();
    const tabs = screen.getByRole("navigation", { name: "Sections du cahier fonctionnel" });
    expect(within(tabs).getByRole("link", { name: /^Fonctionnalités/ })).toHaveTextContent("3");
    expect(
      within(tabs)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Fonctionnalités3", "Règles métier4", "Rôles et permissions3", "Parcours2"]);
  });

  it("compteur sans filtre : N fonctionnalités (spec.head.counts.features), au singulier à 1", async () => {
    renderFeatures();
    await findList();
    expect(countBar()).toHaveTextContent("3 fonctionnalités");
    expect(countBar()).not.toHaveTextContent("chargées");
  });

  it("compteur au singulier", async () => {
    procedures.specHead.mockResolvedValue(
      head({ counts: { features: 1, tables: 0, endpoints: 0 } }),
    );
    procedures.specListFeatures.mockResolvedValue(list(FEATURES.slice(0, 1)));
    renderFeatures();
    await findList();
    expect(countBar()).toHaveTextContent("1 fonctionnalité");
    expect(countBar()).not.toHaveTextContent("1 fonctionnalités");
  });

  it.each(TEAM)(
    "%s : SHA de 7 caractères en mono et âge de la spec dans l'en-tête",
    async (role) => {
      serve(role);
      renderFeatures();
      await findList();
      const sha = screen.getByText(SHORT_SHA);
      expect(sha.className).toMatch(/font-mono/);
      expect(visibleText()).toMatch(/spec à jour il y a/);
      expect(visibleText()).not.toContain("a1b2c3d4e5f6");
      expect(visibleText()).not.toMatch(/Version de la spec|indexée le/);
      expect(visibleText()).toContain("3 fonctionnalités");
    },
  );

  it("la ligne de version est absente tant que spec.head n'a pas répondu", async () => {
    procedures.specHead.mockImplementation(neverResolves);
    renderFeatures();
    await findRole("status");
    expect(visibleText()).not.toMatch(/spec à jour|Mise à jour le/);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Liste (§3.3, §4.2)", () => {
  it("interroge head puis la liste du projet : limite 50, aucun filtre ni curseur", async () => {
    renderFeatures();
    await findList();
    expect(inputsOf(procedures.specHead)[0]).toMatchObject({ projectId: PROJECT_ID });
    const first = inputsOf(procedures.specListFeatures)[0];
    expect(first).toMatchObject({ projectId: PROJECT_ID, limit: 50 });
    expect(first).not.toHaveProperty("status");
    expect(first).not.toHaveProperty("priority");
    expect(first).not.toHaveProperty("cursor");
    expect(procedures.repoList).not.toHaveBeenCalled();
  });

  it("liste nommée « Fonctionnalités » : ni table ni en-têtes de colonne (TK-94)", async () => {
    renderFeatures();
    const list = await findList();
    expect(list).toHaveAccessibleName("Fonctionnalités");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("columnheader")).toHaveLength(0);
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
  });

  it("une ligne par fonctionnalité, dans l'ordre de l'API (aucun tri côté web)", async () => {
    procedures.specListFeatures.mockResolvedValue(list([FEATURES[2], FEATURES[0], FEATURES[1]]));
    renderFeatures();
    const listbox = await findList();
    const ids = within(listbox)
      .getAllByRole("listitem")
      .map((row) => row.textContent?.slice(0, 5));
    expect(ids).toEqual(["F-003", "F-001", "F-002"]);
  });

  it("identifiant en mono, titre en vrai lien vers ?sel=, infobulle native avec le titre complet", async () => {
    renderFeatures();
    await findList();
    const row = rowOf("Connexion par e-mail");
    const id = within(row).getByText("F-001");
    expect(id.className).toMatch(/font-mono/);
    const link = within(row).getByRole("link", { name: "Connexion par e-mail" });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toMatch(/\?tab=features&sel=F-001$/);
    expect(link).toHaveAttribute("title", "Connexion par e-mail");
  });

  // TK-141 A5 (TK-94 n° 4, maquette 12 l.62) : IdTag, titre 500, sous-titre « N critères », priorité avant statut.
  it("A5 : IdTag en tête, sous-titre « N critères », priorité libellée avant la validation", async () => {
    renderFeatures();
    await findList();
    const row = rowOf("Connexion par e-mail");
    const tag = within(row).getByText("F-001");
    expect(tag).toHaveAttribute("data-slot", "id-tag");
    const content = row.querySelector("[data-slot='list-row']") as HTMLElement;
    expect(content.tagName).toBe("DIV");
    expect(content.contains(tag)).toBe(true);
    expect(row.querySelectorAll("li")).toHaveLength(0);
    const subtitle = within(row).getByText("3 critères").parentElement as HTMLElement;
    expect(subtitle).toHaveClass("text-caption", "text-muted-foreground");
    expect(subtitle.previousElementSibling?.textContent).toContain("Connexion par e-mail");
    for (const trail of row.querySelectorAll("[data-slot='priority-indicator']")) {
      const next = trail.compareDocumentPosition(
        trail.parentElement?.querySelector("[data-slot='validation-status']") as Element,
      );
      expect(next & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("le titre est le seul élément interactif de la ligne", async () => {
    renderFeatures();
    await findList();
    const interactive = within(rowOf("Tableau kanban")).queryAllByRole("button");
    expect(interactive).toHaveLength(0);
    expect(within(rowOf("Tableau kanban")).getAllByRole("link")).toHaveLength(1);
  });

  // TK-102 (maquette 10 l.188-195) : la ligne porte la priorité AVEC son libellé et la validation du client ;
  // l'avancement (LifecycleStatus) est dans la fiche.
  it.each([
    ["Connexion par e-mail", "Indispensable", 3, "Validée", "3 critères"],
    ["Tableau kanban", "Importante", 2, "À valider", "1 critère"],
    ["Export des tickets", "Reportée", 0, "À revoir", "0 critère"],
  ] as const)(
    "« %s » : priorité %s (%i barres) et validation %s, %s",
    async (title, priority, level, validation, criteria) => {
      renderFeatures();
      await findList();
      const row = rowOf(title);
      // Deux rendus par ligne, identiques : la ligne méta mobile (md:hidden) et les cellules (hidden md:flex).
      const indicators = row.querySelectorAll("[data-slot='priority-indicator']");
      expect(indicators, "PriorityIndicator").toHaveLength(2);
      for (const indicator of indicators) {
        expect(indicator).toHaveAttribute("data-level", String(level));
        expect(indicator).toHaveTextContent(priority);
      }
      const pills = row.querySelectorAll("[data-slot='validation-status']");
      expect(pills).toHaveLength(2);
      for (const pill of pills) expect(pill).toHaveTextContent(validation);
      expect(row.querySelector("[data-slot='lifecycle-status']")).toBeNull();
      // Les critères n'ont qu'une cellule (écran large) : sous 768 px la ligne garde priorité et validation.
      expect(within(row).getAllByText(criteria)).toHaveLength(1);
    },
  );

  it("plus de badge de statut v1 ; priorité en toutes lettres, jamais les barres seules", async () => {
    renderFeatures();
    await findList();
    const row = rowOf("Connexion par e-mail");
    expect(row.querySelector("[data-slot='badge']")).toBeNull();
    expect(within(row).getAllByText("Indispensable").length).toBeGreaterThan(0);
    expect(within(row).queryByRole("img", { name: "Indispensable" })).toBeNull();
    expect(within(row).queryByText("Brouillon")).toBeNull();
  });

  it("aucune valeur brute du contrat dans le DOM (brouillon, specifiee, must...)", async () => {
    renderFeatures();
    await findList();
    expect(visibleText()).not.toMatch(
      /\b(brouillon|specifiee|implementee|adoptee|must|should|could|wont)\b/,
    );
  });

  it("pas de « Charger la suite » quand nextCursor est null : fin de liste", async () => {
    renderFeatures();
    await findList();
    expect(screen.queryByRole("button", { name: "Charger la suite" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-slot='list-footer']")).toHaveTextContent(
      "Fin de la liste",
    );
  });
});

describe("Vide (§4.3)", () => {
  beforeEach(() => {
    procedures.specHead.mockResolvedValue(EMPTY_HEAD);
    procedures.specListFeatures.mockResolvedValue(list([]));
  });

  it.each(TEAM)("%s : l'agent peut proposer le cahier, saisie à la main proposée", async (role) => {
    serve(role);
    procedures.specListFeatures.mockResolvedValue(list([]));
    procedures.specHead.mockResolvedValue(EMPTY_HEAD);
    renderFeatures();
    expect(await findNamed("button", "Ajouter à la main")).toBeVisible();
    expect(visibleText()).toContain("L'agent peut proposer le cahier fonctionnel");
    // État Prêt (maquette 10 l.99, l.640) : un seul bouton de l'agent, dans la carte ; l'en-tête n'a aucune action.
    expect(screen.getAllByRole("button", { name: "Proposer le fonctionnel" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Proposer avec l'agent/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Nouvelle fonctionnalité/ }),
    ).not.toBeInTheDocument();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Filtres (§3.2)", () => {
  const statusSelect = () => screen.getByRole("button", { name: /^Avancement/ });
  const prioritySelect = () => screen.getByRole("button", { name: /^Priorité/ });
  const validationSelect = () => screen.getByRole("button", { name: /^Validation/ });
  const pick = async (select: HTMLElement, option: string) => {
    await userEvent.click(select);
    await userEvent.click(await findNamed("menuitemradio", option));
  };

  it("trois pastilles pointillées Validation, Priorité, Avancement, sans « Appliquer »", async () => {
    renderFeatures();
    await findList();
    for (const [chip, label] of [
      [validationSelect(), "Validation"],
      [prioritySelect(), "Priorité"],
      [statusSelect(), "Avancement"],
    ] as const) {
      expect(chip).toHaveTextContent(label);
      expect(chip).toHaveAttribute("data-slot", "filter-chip");
      expect(chip.className).toContain("border-dashed");
    }
    expect(screen.queryByRole("button", { name: /appliquer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Effacer les filtres" })).not.toBeInTheDocument();
  });

  it("options de chaque filtre, en toutes lettres", async () => {
    renderFeatures();
    await findList();
    const optionsOf = async () =>
      (await screen.findAllByRole("menuitemradio")).map((o) => o.textContent);
    await userEvent.click(validationSelect());
    expect(await optionsOf()).toEqual(["Toutes", "Validée", "À valider", "À revoir"]);
    await userEvent.keyboard("{Escape}");
    await userEvent.click(statusSelect());
    expect(await optionsOf()).toEqual(["Tous", "Brouillon", "Spécifiée", "Implémentée", "Adoptée"]);
    await userEvent.keyboard("{Escape}");
    await userEvent.click(prioritySelect());
    expect(await optionsOf()).toEqual([
      "Toutes",
      "Indispensable",
      "Importante",
      "Souhaitable",
      "Reportée",
    ]);
  });

  it("choisir une validation envoie validation, l'écrit dans l'adresse et nomme la pastille", async () => {
    renderFeatures();
    await findList();
    await pick(validationSelect(), "À valider");
    await waitFor(() =>
      expect(inputsOf(procedures.specListFeatures).at(-1)).toMatchObject({
        validation: "to_validate",
      }),
    );
    expect(new URLSearchParams(window.location.search).get("validation")).toBe("to_validate");
    expect(screen.getByRole("button", { name: "Validation : À valider" })).toBeVisible();
  });

  it("choisir un statut relance la requête avec status, met à jour l'adresse sans empiler l'historique", async () => {
    renderFeatures();
    await findList();
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
    await findList();
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
      tab: "features",
      priority: "must",
      status: "adoptee",
    });
  });

  it("filtres lus dans l'adresse au chargement", async () => {
    renderFeatures({ search: "?status=adoptee&priority=wont" });
    await findList();
    expect(inputsOf(procedures.specListFeatures)[0]).toMatchObject({
      status: "adoptee",
      priority: "wont",
    });
    expect(statusSelect()).toHaveTextContent("Avancement : Adoptée");
    expect(prioritySelect()).toHaveTextContent("Priorité : Reportée");
  });

  it("valeur d'adresse inconnue ignorée : requête sans filtre, pas d'« Effacer »", async () => {
    renderFeatures({ search: "?status=zzz&priority=high" });
    await findList();
    expect(inputsOf(procedures.specListFeatures)[0]).not.toHaveProperty("status");
    expect(inputsOf(procedures.specListFeatures)[0]).not.toHaveProperty("priority");
    expect(screen.queryByRole("button", { name: "Effacer les filtres" })).not.toBeInTheDocument();
  });

  it("filtre actif : total du serveur dans la barre de compte et bouton « Effacer les filtres »", async () => {
    procedures.specListFeatures.mockResolvedValue(list(FEATURES.slice(0, 2)));
    renderFeatures({ search: "?status=brouillon" });
    await findList();
    expect(countBar()).toHaveTextContent("2 fonctionnalités");
    expect(screen.getByRole("button", { name: "Effacer les filtres" })).toBeEnabled();
    await waitFor(() =>
      expect(statusRegion()).toHaveTextContent("2 fonctionnalités trouvées sur 3"),
    );
  });

  it("filtre actif avec une suite : le total du serveur, pas la longueur de la page", async () => {
    procedures.specListFeatures.mockResolvedValue(page(1, 50, "c1", { total: 312 }));
    renderFeatures({ search: "?priority=must" });
    await findList();
    expect(countBar()).toHaveTextContent("312 fonctionnalités · 50 chargées");
  });

  it("« Effacer les filtres » retire les paramètres, relance sans filtre et passe le focus à la première pastille", async () => {
    renderFeatures({ search: "?status=brouillon&priority=must" });
    await findList();
    await userEvent.click(screen.getByRole("button", { name: "Effacer les filtres" }));
    await waitFor(() =>
      expect(inputsOf(procedures.specListFeatures).at(-1)).not.toHaveProperty("status"),
    );
    expect(inputsOf(procedures.specListFeatures).at(-1)).not.toHaveProperty("priority");
    expect(window.location.search).toBe("?tab=features");
    expect(validationSelect()).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Effacer les filtres" })).not.toBeInTheDocument();
  });

  it("pendant le rechargement : la liste précédente reste affichée, les filtres aussi, la barre de compte est occupée", async () => {
    renderFeatures();
    await findList();
    procedures.specListFeatures.mockImplementation(neverResolves);
    await pick(statusSelect(), "Adoptée");
    await waitFor(() => expect(countBar()).toHaveAttribute("aria-busy", "true"));
    expect(screen.getByRole("link", { name: "Connexion par e-mail" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Fonctionnalités" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(statusSelect()).toBeVisible();
  });

  it("changer de filtre oublie le curseur et remplace la liste", async () => {
    procedures.specListFeatures.mockResolvedValueOnce(page(1, 50, "c1"));
    renderFeatures();
    await findList();
    await userEvent.click(screen.getByRole("button", { name: "Charger la suite" }));
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
  beforeEach(() => procedures.specListFeatures.mockResolvedValue(list([])));

  it("filtres conservés, état vide visible, message annoncé par la région d'état, « Effacer les filtres »", async () => {
    renderFeatures({ search: "?status=adoptee" });
    const empty = await waitFor(() => {
      const found = document.querySelector("[data-slot='empty-state']");
      if (!found) throw new Error("pas d'état vide");
      return found;
    });
    expect(empty).toHaveTextContent("Aucune fonctionnalité ne correspond à ces filtres.");
    expect(empty).toHaveAttribute("data-variant", "inline");
    await waitFor(() =>
      expect(statusRegion()).toHaveTextContent(
        "Aucune fonctionnalité ne correspond à ces filtres.",
      ),
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Avancement/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /^Priorité/ })).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Effacer les filtres" }).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.queryByRole("heading", { name: "Aucune fonctionnalité pour le moment" }),
    ).not.toBeInTheDocument();
  });

  it("« Effacer les filtres » ramène la liste et le focus sur la première pastille", async () => {
    renderFeatures({ search: "?status=adoptee" });
    await waitFor(() => expect(document.querySelector("[data-slot='empty-state']")).not.toBeNull());
    procedures.specListFeatures.mockResolvedValue(list(FEATURES));
    await userEvent.click(
      screen.getAllByRole("button", { name: "Effacer les filtres" })[0] as HTMLElement,
    );
    await findList();
    expect(window.location.search).toBe("?tab=features");
    expect(screen.getByRole("button", { name: /^Validation/ })).toHaveFocus();
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
      await findList();
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
    await findList();
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
