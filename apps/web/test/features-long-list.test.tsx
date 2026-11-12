import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FEATURES,
  head,
  inputsOf,
  list,
  PROJECT_ID,
  page,
  renderFeatures,
  serve,
  summary,
} from "./support/features.tsx";
import { FakeIntersectionObserver, installIntersectionObserver } from "./support/virtual.ts";
import { findNamed, findRole } from "./support/wait.ts";
import {
  apiError,
  polyfillRadix,
  procedures,
  resetWebMocks,
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
 * TK-94 lot C : la liste des fonctionnalités en schéma 1.1 (passation 07 §1, §5 ; 02-design.md §2.1, §3 à §5).
 * Contrat 1.0.0 : `total`, `offset`, `previousCursor`, `around`, `q`. Liste virtualisée, jamais chargée en entier.
 */
const TOTAL = 1000;
const firstPage = () => page(1, 50, "c1", { total: TOTAL });
const secondPage = () => page(51, 50, "c2", { total: TOTAL, offset: 50, previousCursor: "p0" });
const neverResolves = () => new Promise<never>(() => undefined);

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  installIntersectionObserver();
  serve();
  procedures.specHead.mockResolvedValue(
    head({ counts: { features: TOTAL, tables: 2, endpoints: 4 } }),
  );
  procedures.specListFeatures.mockResolvedValue(firstPage());
});
afterEach(() => vi.unstubAllGlobals());

const findList = (): Promise<HTMLElement> =>
  findNamed("list", "Fonctionnalités", { text: "F-001" });
// Fiche ouverte (`?sel=`) : Radix masque le reste de la page aux technologies d'assistance, la liste y comprise.
const rowsOf = (listbox: HTMLElement) => within(listbox).getAllByRole("listitem", { hidden: true });
const findHiddenList = (text: string): Promise<HTMLElement> =>
  findNamed("list", "Fonctionnalités", { text, hidden: true });
const lastInput = () => inputsOf(procedures.specListFeatures).at(-1) ?? {};
const searchBox = () => screen.getByRole("searchbox", { name: /Rechercher/ });
const status = () => screen.getByRole("status");
const footer = () => document.querySelector("[data-slot='list-footer']") as HTMLElement;

describe("Liste virtualisée (§5)", () => {
  it("une liste nommée « Fonctionnalités », pas de tableau", async () => {
    renderFeatures();
    const listbox = await findList();
    expect(listbox.tagName).toBe("UL");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("columnheader")).toBeNull();
  });

  it("aria-setsize vaut le total du serveur, aria-posinset le rang réel", async () => {
    renderFeatures();
    const rows = rowsOf(await findList());
    for (const row of rows) expect(row).toHaveAttribute("aria-setsize", String(TOTAL));
    const first = rows[0] as HTMLElement;
    expect(first).toHaveTextContent("F-001");
    expect(first).toHaveAttribute("aria-posinset", "1");
  });

  it("n'y a jamais plus d'une quarantaine de lignes dans le DOM pour 1 000 fonctionnalités", async () => {
    renderFeatures();
    const rows = rowsOf(await findList());
    expect(rows.length).toBeLessThan(40);
  });

  it("une seule entrée de tabulation dans la liste, les liens des lignes n'en sont pas", async () => {
    renderFeatures();
    const listbox = await findList();
    expect(listbox.querySelectorAll("[tabindex='0']")).toHaveLength(1);
    for (const link of within(listbox).getAllByRole("link")) {
      expect(link).toHaveAttribute("tabindex", "-1");
    }
  });

  it("ligne : identifiant en mono, titre en lien vers ?sel=, infobulle du titre complet", async () => {
    renderFeatures();
    const listbox = await findList();
    const row = rowsOf(listbox)[0] as HTMLElement;
    expect(within(row).getByText("F-001").className).toMatch(/font-mono/);
    const link = within(row).getByRole("link", { name: "Fonctionnalité numéro 1" });
    expect(link.getAttribute("href")).toMatch(/\?tab=features&sel=F-001$/);
    expect(link).toHaveAttribute("title", "Fonctionnalité numéro 1");
    expect(link).toHaveAttribute("data-feature-link", "F-001");
  });

  it("chargement initial : 8 lignes squelettes, région d'état aria-busy", async () => {
    procedures.specHead.mockImplementation(neverResolves);
    renderFeatures();
    const skeleton = await screen.findByTestId("features-skeleton");
    expect(skeleton.querySelector("[data-slot='loading-rows']")?.children).toHaveLength(8);
    // TK-141 A6 : le cadre est celui de VirtualList framed (rayon 12), pas un cadre local.
    const framed = skeleton.querySelector("[data-slot='virtual-list']") as HTMLElement;
    expect(framed.className).toMatch(/rounded-xl.*border|border.*rounded-xl/);
    const region = await findRole("status");
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(region).toHaveTextContent("Chargement des fonctionnalités…");
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});

describe("Barre de compte et région d'état unique (§4)", () => {
  it("total du serveur et nombre de lignes chargées, pas la longueur de la page", async () => {
    renderFeatures();
    await findList();
    const bar = document.querySelector("[data-slot='count-bar']") as HTMLElement;
    expect(bar).toHaveTextContent("1 000 fonctionnalités · 50 chargées");
    expect(bar).toHaveTextContent("Tri : identifiant");
  });

  it("une seule région role=status dans le document", async () => {
    renderFeatures();
    await findList();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("première requête : projet, limit 50, ni curseur ni around ni q", async () => {
    renderFeatures();
    await findList();
    const first = inputsOf(procedures.specListFeatures)[0];
    expect(first).toMatchObject({ projectId: PROJECT_ID, limit: 50 });
    for (const key of ["cursor", "around", "q", "status", "priority"]) {
      expect(first).not.toHaveProperty(key);
    }
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Pied de liste : charger la suite (§2.1, §3)", () => {
  it("« Les 50 suivantes se chargent automatiquement… » et « Charger la suite »", async () => {
    renderFeatures();
    await findList();
    expect(footer()).toHaveAttribute("data-state", "more");
    expect(footer()).toHaveTextContent("Les 50 suivantes se chargent automatiquement");
    expect(within(footer()).getByRole("button", { name: "Charger la suite" })).toBeEnabled();
  });

  it("« Charger la suite » s'atteint et s'active au clavier, avec le curseur reçu", async () => {
    procedures.specListFeatures
      .mockResolvedValueOnce(firstPage())
      .mockResolvedValueOnce(secondPage());
    renderFeatures();
    await findList();
    within(footer()).getByRole("button", { name: "Charger la suite" }).focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(lastInput()).toMatchObject({ cursor: "c1", limit: 50 }));
    await waitFor(() => expect(status()).toHaveTextContent("100 sur 1 000"));
  });

  it("la sentinelle à 80 % demande la suite sans clic, une seule fois", async () => {
    procedures.specListFeatures
      .mockResolvedValueOnce(firstPage())
      .mockResolvedValueOnce(secondPage());
    renderFeatures();
    await findList();
    FakeIntersectionObserver.intersect("end");
    FakeIntersectionObserver.intersect("end");
    await waitFor(() => expect(procedures.specListFeatures).toHaveBeenCalledTimes(2));
    expect(lastInput()).toMatchObject({ cursor: "c1" });
  });

  it("tant que « Charger la suite » a le focus, le chargement à 80 % attend : le bouton ne se remplace pas sous les doigts", async () => {
    procedures.specListFeatures
      .mockResolvedValueOnce(firstPage())
      .mockResolvedValueOnce(secondPage());
    renderFeatures();
    const listbox = await findList();
    await act(async () => screen.getByRole("button", { name: "Charger la suite" }).focus());
    FakeIntersectionObserver.intersect("end");
    expect(procedures.specListFeatures).toHaveBeenCalledTimes(1);
    // le focus quitte le pied : la zone de déclenchement est de nouveau écoutée
    await act(async () => (rowsOf(listbox)[0] as HTMLElement).focus());
    FakeIntersectionObserver.intersect("end");
    await waitFor(() => expect(procedures.specListFeatures).toHaveBeenCalledTimes(2));
  });

  it("pendant l'appel : « Chargement des 50 suivantes… », la liste reste affichée", async () => {
    procedures.specListFeatures
      .mockResolvedValueOnce(firstPage())
      .mockImplementationOnce(neverResolves);
    renderFeatures();
    const listbox = await findList();
    await userEvent.click(screen.getByRole("button", { name: "Charger la suite" }));
    await waitFor(() => expect(footer()).toHaveAttribute("data-state", "loading"));
    expect(footer()).toHaveTextContent("Chargement des 50 suivantes…");
    expect(footer().querySelector("[data-slot='skeleton']")).toBeNull();
    expect(document.querySelectorAll("[data-slot='skeleton-row']")).toHaveLength(4);
    expect(rowsOf(listbox)[0]).toHaveTextContent("F-001");
  });

  it("page reçue : annonce « 50 fonctionnalités de plus chargées · 100 sur 1 000 », focus inchangé", async () => {
    procedures.specListFeatures
      .mockResolvedValueOnce(firstPage())
      .mockResolvedValueOnce(secondPage());
    renderFeatures();
    const listbox = await findList();
    const row = rowsOf(listbox)[1] as HTMLElement;
    row.focus();
    FakeIntersectionObserver.intersect("end");
    await waitFor(() =>
      expect(status()).toHaveTextContent("50 fonctionnalités de plus chargées · 100 sur 1 000"),
    );
    expect(document.activeElement).toBe(row);
  });

  it("erreur de la suite : alerte du pied, les 50 premières restent affichées, « Réessayer » relance le même curseur", async () => {
    procedures.specListFeatures
      .mockResolvedValueOnce(firstPage())
      .mockRejectedValueOnce(apiError("INTERNAL"))
      .mockResolvedValueOnce(secondPage());
    renderFeatures();
    const listbox = await findList();
    await userEvent.click(screen.getByRole("button", { name: "Charger la suite" }));
    await waitFor(() => expect(footer()).toHaveAttribute("data-state", "error"));
    expect(footer()).toHaveAttribute("role", "alert");
    expect(footer()).toHaveTextContent(
      "Impossible de charger la suite. Les 50 premières restent affichées.",
    );
    expect(rowsOf(listbox)[0]).toHaveTextContent("F-001");
    await userEvent.click(within(footer()).getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(procedures.specListFeatures).toHaveBeenCalledTimes(3));
    expect(lastInput()).toMatchObject({ cursor: "c1" });
    await waitFor(() => expect(footer()).toHaveAttribute("data-state", "more"));
  });

  it("curseur périmé (VALIDATION) : « Réessayer » repart du début, filtres gardés", async () => {
    procedures.specListFeatures
      .mockResolvedValueOnce(firstPage())
      .mockRejectedValueOnce(apiError("VALIDATION"))
      .mockResolvedValue(firstPage());
    renderFeatures({ search: "?status=specifiee" });
    await findList();
    await userEvent.click(screen.getByRole("button", { name: "Charger la suite" }));
    await waitFor(() => expect(footer()).toHaveAttribute("data-state", "error"));
    await userEvent.click(within(footer()).getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(procedures.specListFeatures).toHaveBeenCalledTimes(3));
    expect(lastInput()).not.toHaveProperty("cursor");
    expect(lastInput()).toMatchObject({ status: "specifiee" });
  });

  it("fin de liste : « Fin de la liste · 60 fonctionnalités » et « Revenir en haut »", async () => {
    procedures.specListFeatures.mockResolvedValue(page(1, 60, null, { total: 60 }));
    renderFeatures();
    await findList();
    expect(footer()).toHaveAttribute("data-state", "end");
    expect(footer()).toHaveTextContent("Fin de la liste · 60 fonctionnalités");
    expect(within(footer()).getByRole("button", { name: "Revenir en haut" })).toBeInTheDocument();
  });

  it("liste courte : fin de liste sans « Revenir en haut »", async () => {
    procedures.specListFeatures.mockResolvedValue(list(FEATURES));
    renderFeatures();
    await findList();
    expect(footer()).toHaveTextContent("Fin de la liste · 3 fonctionnalités");
    expect(within(footer()).queryByRole("button", { name: "Revenir en haut" })).toBeNull();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Recherche (§2.1)", () => {
  const type = async (text: string) => {
    await userEvent.type(searchBox(), text);
  };

  it("champ de recherche nommé, valeur lue dans ?q= au chargement", async () => {
    renderFeatures({ search: "?q=annulation" });
    await findList();
    expect(searchBox()).toHaveValue("annulation");
    expect(inputsOf(procedures.specListFeatures)[0]).toMatchObject({ q: "annulation" });
  });

  it("la saisie relance la requête avec q après le délai, et l'écrit dans l'adresse", async () => {
    renderFeatures();
    await findList();
    // Cinq frappes dans le même tour : aucun délai entre elles, donc le résultat ne dépend pas de la charge
    // du runner (avec `userEvent.type`, une frappe lente dépasse le délai et relance une requête par lettre).
    for (const value of ["a", "an", "ann", "annu", "annul"]) {
      fireEvent.change(searchBox(), { target: { value } });
    }
    await waitFor(() => expect(lastInput()).toMatchObject({ q: "annul" }));
    expect(new URLSearchParams(window.location.search).get("q")).toBe("annul");
    // pas une requête par lettre
    const withQ = inputsOf(procedures.specListFeatures).filter((input) => "q" in input);
    expect(withQ.length).toBeLessThan(5);
  });

  it("pendant la frappe, la liste précédente reste affichée et la barre de compte est occupée", async () => {
    renderFeatures();
    const listbox = await findList();
    procedures.specListFeatures.mockImplementation(neverResolves);
    await type("annulation");
    await waitFor(() => expect(lastInput()).toMatchObject({ q: "annulation" }));
    expect(rowsOf(listbox)[0]).toHaveTextContent("F-001");
    expect(document.querySelector("[data-slot='count-bar']")).toHaveAttribute("aria-busy", "true");
  });

  it("résultat : « 12 fonctionnalités trouvées sur 1 000 » annoncé après la frappe", async () => {
    renderFeatures();
    await findList();
    procedures.specListFeatures.mockResolvedValue(
      list(
        Array.from({ length: 12 }, (_, i) => summary(i + 1)),
        { total: 12 },
      ),
    );
    await type("annulation");
    await waitFor(() =>
      expect(status()).toHaveTextContent("12 fonctionnalités trouvées sur 1 000"),
    );
  });

  it("TK-141 A6 : recherche vide en EmptyState inline, barre de compte « 0 résultat pour « q » »", async () => {
    renderFeatures();
    await findList();
    procedures.specListFeatures.mockResolvedValue(list([], { total: 0 }));
    await type("annulation");
    const empty = await waitFor(() => {
      const found = document.querySelector("[data-slot='empty-state']");
      if (!found) throw new Error("pas d'état vide");
      expect(found).toHaveTextContent("Aucune fonctionnalité ne correspond à « annulation »");
      return found as HTMLElement;
    });
    expect(empty).toHaveAttribute("data-variant", "inline");
    expect(empty.querySelector("svg[data-icon='search_off']")).not.toBeNull();
    const bar = document.querySelector("[data-slot='count-bar']") as HTMLElement;
    expect(bar).toHaveTextContent("0 résultat pour « annulation »");
  });

  it("recherche vide : EmptyState, texte de la passation, action « Effacer la recherche »", async () => {
    renderFeatures();
    await findList();
    procedures.specListFeatures.mockResolvedValue(list([], { total: 0 }));
    await type("annulation");
    const empty = await waitFor(() => {
      const found = document.querySelector("[data-slot='empty-state']");
      if (!found) throw new Error("pas d'état vide");
      // L'état vide peut s'afficher pour une saisie partielle sous charge : on attend le terme complet.
      expect(found).toHaveTextContent("Aucune fonctionnalité ne correspond à « annulation »");
      return found as HTMLElement;
    });
    expect(empty).toHaveTextContent(
      "La recherche porte sur les 1 000 fonctionnalités, pas seulement celles affichées.",
    );
    await waitFor(() => expect(status()).toHaveTextContent("Aucun résultat pour « annulation »"));
    expect(screen.queryByRole("list", { name: "Fonctionnalités" })).toBeNull();
    // TK-141 correction 1 (planche 12) : l'état vide est dans le cadre de la liste, le tri reste annoncé, bouton de 32.
    expect(empty).toHaveClass("rounded-xl", "border", "border-border");
    expect(document.querySelector("[data-slot='count-bar-sort']")).toHaveTextContent(
      "Tri : identifiant",
    );
    expect(
      within(empty as HTMLElement).getByRole("button", { name: "Effacer la recherche" }),
    ).toHaveClass("h-8");
  });

  it("« Effacer la recherche » vide le champ, retire ?q= et rend la liste", async () => {
    procedures.specListFeatures.mockImplementation(async (input: { q?: string }) =>
      input.q ? list([], { total: 0 }) : firstPage(),
    );
    renderFeatures({ search: "?q=annulation" });
    await userEvent.click(await findNamed("button", "Effacer la recherche"));
    await findList();
    expect(searchBox()).toHaveValue("");
    expect(new URLSearchParams(window.location.search).has("q")).toBe(false);
    expect(lastInput()).not.toHaveProperty("q");
  });

  it("la touche / met le focus sur la recherche", async () => {
    renderFeatures();
    await findList();
    await userEvent.keyboard("/");
    expect(searchBox()).toHaveFocus();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Lien direct ?sel= (§2.1, B35)", () => {
  const deepPage = () => page(151, 50, "n1", { total: TOTAL, offset: 150, previousCursor: "p1" });

  it("la page qui contient la ligne est demandée avec around, sans curseur", async () => {
    procedures.specListFeatures.mockResolvedValue(deepPage());
    renderFeatures({ search: "?sel=F-187" });
    await findHiddenList("F-187");
    expect(inputsOf(procedures.specListFeatures)[0]).toMatchObject({ around: "F-187", limit: 50 });
    expect(inputsOf(procedures.specListFeatures)[0]).not.toHaveProperty("cursor");
  });

  it("la ligne est sélectionnée, son rang réel vient de offset, la fiche s'ouvre", async () => {
    procedures.specListFeatures.mockResolvedValue(deepPage());
    renderFeatures({ search: "?sel=F-187" });
    const listbox = await findHiddenList("F-187");
    const row = rowsOf(listbox).find((item) => item.textContent?.includes("F-187")) as HTMLElement;
    expect(row).toHaveAttribute("aria-current", "true");
    expect(row).toHaveAttribute("aria-posinset", "187");
    await screen.findByRole("complementary", { name: "Fiche de la fonctionnalité" });
  });

  it("remonter charge la page précédente (previousCursor) sans around", async () => {
    procedures.specListFeatures
      .mockResolvedValueOnce(deepPage())
      .mockResolvedValueOnce(
        page(101, 50, "n0", { total: TOTAL, offset: 100, previousCursor: "p0" }),
      );
    renderFeatures({ search: "?sel=F-187" });
    const listbox = await findHiddenList("F-187");
    FakeIntersectionObserver.intersect("start");
    await waitFor(() => expect(procedures.specListFeatures).toHaveBeenCalledTimes(2));
    expect(lastInput()).toMatchObject({ cursor: "p1" });
    expect(lastInput()).not.toHaveProperty("around");
    // Les lignes ajoutées au-dessus gardent leur rang réel : aria-posinset = numéro de la fonctionnalité.
    await waitFor(() => {
      const numbers = rowsOf(listbox).map((row) => Number(row.textContent?.slice(2, 5)));
      expect(Math.min(...numbers)).toBeLessThan(151);
      for (const row of rowsOf(listbox)) {
        expect(row).toHaveAttribute("aria-posinset", String(Number(row.textContent?.slice(2, 5))));
      }
    });
  });

  it("ligne hors des filtres : la fiche s'ouvre, puis InlineAlert neutre et « Effacer les filtres » derrière", async () => {
    procedures.specListFeatures.mockResolvedValue(firstPage());
    renderFeatures({ search: "?sel=F-187&status=adoptee" });
    await findHiddenList("F-001");
    await screen.findByRole("complementary", { name: "Fiche de la fonctionnalité" });
    const text = await screen.findByText(/n'apparaît pas avec les filtres actuels/);
    const note = text.closest("[data-slot='inline-alert']") as HTMLElement;
    expect(note).toHaveAttribute("role", "note");
    expect(note).toHaveTextContent("Cette fonctionnalité n'apparaît pas avec les filtres actuels.");
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("complementary", { name: "Fiche de la fonctionnalité" }),
      ).toBeNull(),
    );
    await userEvent.click(within(note).getByRole("button", { name: "Effacer les filtres" }));
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).has("status")).toBe(false),
    );
    await waitFor(() => expect(screen.queryByText(/n'apparaît pas avec/)).toBeNull());
  });

  it("around inconnu (NOT_FOUND) : la liste s'affiche sans around, pas de « Projet introuvable »", async () => {
    procedures.specListFeatures
      .mockRejectedValueOnce(apiError("NOT_FOUND"))
      .mockResolvedValue(firstPage());
    renderFeatures({ search: "?sel=F-999" });
    await findHiddenList("F-001");
    expect(screen.queryByRole("heading", { name: "Projet introuvable" })).toBeNull();
    expect(lastInput()).not.toHaveProperty("around");
  });

  it("l'ancien ?feature=F-002 est lu puis réécrit en ?sel=F-002", async () => {
    renderFeatures({ search: "?feature=F-002" });
    await findHiddenList("F-001");
    await screen.findByRole("complementary", { name: "Fiche de la fonctionnalité" });
    await waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get("sel")).toBe("F-002");
      expect(params.has("feature")).toBe(false);
    });
  });

  it("ouvrir une ligne ne recharge pas la liste et l'empile une fois dans l'historique", async () => {
    renderFeatures();
    const listbox = await findList();
    const length = window.history.length;
    await userEvent.click(within(listbox).getByRole("link", { name: "Fonctionnalité numéro 2" }));
    await screen.findByRole("complementary", { name: "Fiche de la fonctionnalité" });
    expect(new URLSearchParams(window.location.search).get("sel")).toBe("F-002");
    expect(window.history.length).toBe(length + 1);
    expect(procedures.specListFeatures).toHaveBeenCalledTimes(1);
    const row = rowsOf(listbox).find((item) => item.textContent?.includes("F-002"));
    expect(row).toHaveAttribute("aria-current", "true");
  });

  it("Entrée sur la ligne active ouvre la fiche", async () => {
    renderFeatures();
    const listbox = await findList();
    (rowsOf(listbox)[0] as HTMLElement).focus();
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("complementary", { name: "Fiche de la fonctionnalité" });
    expect(new URLSearchParams(window.location.search).get("sel")).toBe("F-001");
  });
});
