import { specBatchSubmitInputSchema } from "@koklo/contract";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { head, inputsOf, list, PROJECT_ID, renderFeatures, serve } from "./support/features.tsx";
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
 * TK-103 lot B : les onglets Règles métier, Rôles et permissions et Parcours (critères 1, 8, 9, 10, 11 ;
 * maquette 10 l.225-295, DESIGN.md §5.16).
 */
const SHA40 = "a".repeat(40);
const rule = (n: number, over: Record<string, unknown> = {}) => ({
  kind: "rule",
  specId: `R-${String(n).padStart(3, "0")}`,
  title: `Règle numéro ${n}`,
  type: "contrainte",
  statement: `Énoncé de la règle ${n}.`,
  states: [],
  features: ["F-001"],
  filePath: `domain/rules/R-${String(n).padStart(3, "0")}-regle.md`,
  ...over,
});
const RULES = [
  rule(1),
  rule(2, {
    type: "workflow",
    states: ["Confirmée", "Honorée", "Annulée"],
    example: "Cas concret.",
  }),
  rule(3, { type: "calcul" }),
];
const flow = (id: string, title: string) => ({
  kind: "flow",
  specId: id,
  title,
  actor: "Client",
  start: { label: "Accueil du portail", screen: "S-accueil" },
  steps: [{ label: "Choisir un service", screen: "S-services" }, { label: "Confirmation" }],
  errors: [{ step: 3, text: "créneau pris" }],
  features: ["F-001", "F-004"],
  filePath: `design/flows/${id}.yaml`,
});
const MATRIX = {
  roles: [
    {
      specId: "RL-client",
      name: "Client",
      description: "Réserve sans compte.",
      permissionCount: 1,
    },
    { specId: "RL-gerant", name: "Gérant", description: "Gère le salon.", permissionCount: 2 },
  ],
  groups: [{ resource: "reservation", count: 2, open: true }],
  actions: [
    {
      specId: "PM-reservation.creer",
      label: "Réserver un créneau",
      resource: "reservation",
      access: [
        { roleId: "RL-client", level: "allowed" },
        { roleId: "RL-gerant", level: "allowed" },
      ],
    },
    {
      specId: "PM-reservation.modifier",
      label: "Annuler ou déplacer",
      resource: "reservation",
      access: [
        { roleId: "RL-client", level: "restricted", restriction: "Les siennes" },
        { roleId: "RL-gerant", level: "denied" },
      ],
    },
  ],
  total: 2,
};

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
  serve();
  procedures.specHead.mockResolvedValue(head());
  procedures.specFunctionalList.mockImplementation(async (input) => {
    const { tab } = input as { tab: string };
    return tab === "flows"
      ? list([flow("P-reserver", "Réserver un rendez-vous")], { total: 18 })
      : list(RULES, { total: 300 });
  });
  procedures.specRolesMatrix.mockResolvedValue(MATRIX);
  procedures.specBatchSubmit.mockReturnValue(new Promise(() => undefined));
});

const tabs = () => screen.getByRole("navigation", { name: "Sections du cahier fonctionnel" });
const countBar = () => document.querySelector("[data-slot='count-bar']") as HTMLElement;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Onglet Règles métier", () => {
  it("rend une carte par règle, la barre de compte du serveur et la légende des types", async () => {
    renderFeatures({ search: "?tab=rules" });
    expect(await findNamed("heading", "Règle numéro 1")).toBeVisible();
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(countBar()).toHaveTextContent("300 règles · 3 chargées");
    expect(countBar()).not.toHaveTextContent("Tri :");
    expect(screen.getByText(/Une règle métier est une vérité du domaine/)).toBeVisible();
    expect(screen.getByRole("group", { name: "Filtrer par type de règle" })).toBeVisible();
    // Un workflow montre ses états dans une liste lue dans l'ordre.
    const states = screen.getByRole("list", { name: "États de la règle" });
    expect(
      within(states)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Confirmée", "Honorée", "Annulée"]);
    expect(inputsOf(procedures.specFunctionalList)[0]).toMatchObject({
      projectId: PROJECT_ID,
      tab: "rules",
      limit: 24,
    });
  });

  it("les compteurs d'onglet sont ceux de spec.head et l'onglet actif est Règles métier", async () => {
    renderFeatures({ search: "?tab=rules" });
    await findNamed("heading", "Règle numéro 1");
    expect(within(tabs()).getByRole("link", { name: /^Règles métier/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(tabs())
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Fonctionnalités3", "Règles métier4", "Rôles et permissions3", "Parcours2"]);
  });

  it("un type de la légende filtre côté serveur et s'écrit dans l'adresse", async () => {
    const user = userEvent.setup();
    renderFeatures({ search: "?tab=rules" });
    await findNamed("heading", "Règle numéro 1");
    await user.click(screen.getByRole("button", { name: "Calcul" }));
    await waitFor(() =>
      expect(inputsOf(procedures.specFunctionalList).some((input) => input.type === "calcul")).toBe(
        true,
      ),
    );
    expect(window.location.search).toContain("type=calcul");
    expect(screen.getByRole("button", { name: "Calcul" })).toHaveAttribute("aria-pressed", "true");
  });

  it("recherche sur toute la liste : l'appel porte q, sans résultat « Aucune règle ne correspond »", async () => {
    const user = userEvent.setup();
    renderFeatures({ search: "?tab=rules" });
    await findNamed("heading", "Règle numéro 1");
    procedures.specFunctionalList.mockResolvedValue(list([], { total: 0 }));
    await user.type(
      screen.getByRole("searchbox", { name: "Rechercher une règle ou R-nnn" }),
      "zzz",
    );
    await waitFor(() =>
      expect(screen.getByText("Aucune règle ne correspond à « zzz »")).toBeVisible(),
    );
    expect(inputsOf(procedures.specFunctionalList).at(-1)).toMatchObject({ q: "zzz" });
    // La légende des types reste là sans résultat (retirer un filtre par sa pastille).
    expect(screen.getByRole("group", { name: "Filtrer par type de règle" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Effacer la recherche" }));
    await waitFor(() => expect(window.location.search).not.toContain("q="));
  });

  it("lien direct ?sel=R-250 : la liste s'ouvre sur la page qui la contient (around) et la carte est choisie", async () => {
    procedures.specFunctionalList.mockResolvedValue(list([rule(250)], { total: 300, offset: 240 }));
    renderFeatures({ search: "?tab=rules&sel=R-250" });
    await findNamed("heading", "Règle numéro 250");
    expect(inputsOf(procedures.specFunctionalList)[0]).toMatchObject({ around: "R-250" });
    expect(document.querySelector("[data-spec-id='R-250']")).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("« Charger la suite » lit la page suivante par son curseur", async () => {
    const user = userEvent.setup();
    procedures.specFunctionalList.mockImplementation(async (input) =>
      (input as { cursor?: string }).cursor
        ? list([rule(4)], { total: 4, offset: 3 })
        : list(RULES, { total: 4, nextCursor: "c1" }),
    );
    renderFeatures({ search: "?tab=rules" });
    await findNamed("heading", "Règle numéro 1");
    await user.click(screen.getByRole("button", { name: "Charger la suite" }));
    expect(await findNamed("heading", "Règle numéro 4")).toBeVisible();
    expect(inputsOf(procedures.specFunctionalList).at(-1)).toMatchObject({ cursor: "c1" });
  });
});

describe("Onglet Règles métier : états et droits", () => {
  it("onglet vide : phrase d'aide et « Nouvelle règle » pour l'équipe", async () => {
    procedures.specFunctionalList.mockResolvedValue(list([], { total: 0 }));
    renderFeatures({ search: "?tab=rules" });
    await screen.findByText("Aucune règle métier pour l'instant");
    expect(screen.getAllByRole("button", { name: "Nouvelle règle" }).length).toBeGreaterThan(0);
  });

  it.each(["client", "business"] as const)(
    "%s : aucune carte modifiable, aucun bouton d'ajout",
    async (role) => {
      serve(role);
      renderFeatures({ search: "?tab=rules" });
      await findNamed("heading", "Règle numéro 1");
      expect(screen.queryByRole("button", { name: /^Modifier R-/ })).toBeNull();
      expect(screen.queryByRole("button", { name: /Nouvelle règle/ })).toBeNull();
    },
  );

  it("designer : ni « Nouvelle règle » ni « Modifier R-001 » (B340)", async () => {
    serve("designer");
    renderFeatures({ search: "?tab=rules" });
    await findNamed("heading", "Règle numéro 1");
    expect(screen.queryByRole("button", { name: /Nouvelle règle/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Modifier R-001" })).toBeNull();
  });

  it("l'équipe a l'icône « Modifier R-001 » sur chaque carte", async () => {
    renderFeatures({ search: "?tab=rules" });
    await findNamed("heading", "Règle numéro 1");
    expect(screen.getByRole("button", { name: "Modifier R-001" })).toBeVisible();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Formulaire Règle", () => {
  it("« Nouvelle règle » ouvre la feuille ; les obligatoires vides sont refusés, rien n'est envoyé", async () => {
    const user = userEvent.setup();
    renderFeatures({ search: "?tab=rules" });
    await findNamed("heading", "Règle numéro 1");
    await user.click(screen.getAllByRole("button", { name: "Nouvelle règle" })[0] as HTMLElement);
    const dialog = await findRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Nouvelle règle" })).toBeVisible();
    expect(within(dialog).getByText("domain/rules/R-nnn-titre.md")).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer dans la spec" }));
    expect(await within(dialog).findByText(/point.* à corriger/)).toBeVisible();
    expect(procedures.specBatchSubmit).not.toHaveBeenCalled();
  });

  it("titre, type et énoncé : un specBatch.submit d'une opération rule.create valide pour le contrat", async () => {
    const user = userEvent.setup();
    renderFeatures({ search: "?tab=rules&new=1" });
    const dialog = await findRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: /^Titre/ }), "Acompte");
    await user.click(within(dialog).getByRole("radio", { name: "Calcul" }));
    await user.type(within(dialog).getByRole("textbox", { name: /^Énoncé/ }), "20 % du prix.");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer dans la spec" }));
    await waitFor(() => expect(procedures.specBatchSubmit).toHaveBeenCalledTimes(1));
    const input = inputsOf(procedures.specBatchSubmit)[0];
    expect(input).toMatchObject({
      projectId: PROJECT_ID,
      branch: "main",
      operations: [
        { kind: "rule.create", title: "Acompte", type: "calcul", statement: "20 % du prix." },
      ],
    });
    expect(input).not.toHaveProperty("baseSha");
    expect(specBatchSubmitInputSchema.safeParse(input).success).toBe(true);
  });

  it("un workflow veut des états : l'envoi est refusé tant que la liste est vide", async () => {
    const user = userEvent.setup();
    renderFeatures({ search: "?tab=rules&new=1" });
    const dialog = await findRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: /^Titre/ }), "Cycle");
    await user.click(within(dialog).getByRole("radio", { name: "Workflow à états" }));
    await user.type(
      within(dialog).getByRole("textbox", { name: /^Énoncé/ }),
      "Une réservation vit.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer dans la spec" }));
    expect(
      await within(dialog).findByText("Un workflow à états porte au moins un état."),
    ).toBeVisible();
    expect(procedures.specBatchSubmit).not.toHaveBeenCalled();
  });

  it("« Modifier R-002 » ouvre la feuille remplie ; seul le champ modifié part, avec baseSha", async () => {
    const user = userEvent.setup();
    procedures.specItemGet.mockResolvedValue({
      type: "rule",
      id: "R-002",
      values: {
        specId: "R-002",
        title: "Règle numéro 2",
        type: "contrainte",
        statement: "Énoncé de la règle 2.",
        examples: [],
        states: [],
        features: ["F-001"],
        tables: [],
        endpoints: [],
        filePath: "domain/rules/R-002-regle.md",
        commitSha: SHA40,
      },
      validated: false,
      referencedBy: { items: [], total: 0 },
    });
    renderFeatures({ search: "?tab=rules" });
    await findNamed("heading", "Règle numéro 2");
    await user.click(screen.getByRole("button", { name: "Modifier R-002" }));
    const dialog = await findRole("dialog");
    const title = await within(dialog).findByRole("textbox", { name: /^Titre/ });
    expect(title).toHaveValue("Règle numéro 2");
    expect(within(dialog).getByText("domain/rules/R-002-regle.md")).toBeVisible();
    expect(inputsOf(procedures.specItemGet)[0]).toMatchObject({ type: "rule", id: "R-002" });
    await user.clear(title);
    await user.type(title, "Délai d'annulation");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer les modifications" }));
    await waitFor(() => expect(procedures.specBatchSubmit).toHaveBeenCalledTimes(1));
    expect(inputsOf(procedures.specBatchSubmit)[0]).toMatchObject({
      baseSha: SHA40,
      operations: [{ kind: "rule.update", specId: "R-002", title: "Délai d'annulation" }],
    });
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Onglet Rôles et permissions", () => {
  it("cartes de rôle puis vrai tableau « Qui peut faire quoi » avec en-têtes et texte de cellule", async () => {
    renderFeatures({ search: "?tab=roles" });
    expect(await findNamed("heading", "Client")).toBeVisible();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    const table = screen.getByRole("table", { name: "Qui peut faire quoi" });
    expect(table.querySelector("caption")).toHaveTextContent("Qui peut faire quoi");
    expect([...table.querySelectorAll("th[scope='col']")].map((th) => th.textContent)).toEqual([
      "Action",
      "Client",
      "Gérant",
    ]);
    expect(table.querySelectorAll("th[scope='row']")).toHaveLength(2);
    expect(table.querySelector("[scope='rowgroup']")).toBeNull();
    expect(within(table).getByText("autorisé : les siennes")).toBeVisible();
    expect(within(table).getByText("non autorisé")).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Qui peut faire quoi, défilement horizontal" }),
    ).toHaveAttribute("tabindex", "0");
  });

  it("le filtre des actions relit la matrice avec q", async () => {
    const user = userEvent.setup();
    renderFeatures({ search: "?tab=roles" });
    await findNamed("heading", "Client");
    await user.type(screen.getByRole("searchbox", { name: "Filtrer les actions" }), "agenda");
    await waitFor(() =>
      expect(inputsOf(procedures.specRolesMatrix).at(-1)).toMatchObject({ q: "agenda" }),
    );
  });

  it("au-delà de 20 actions : groupes `rowgroup` ; ouvrir un groupe fermé lit ses actions (group)", async () => {
    const user = userEvent.setup();
    procedures.specRolesMatrix.mockImplementation(async (input) => {
      const { group } = input as { group?: string };
      const opened = group === "paiement";
      return {
        ...MATRIX,
        total: 47,
        groups: [
          { resource: "reservation", count: 2, open: true },
          { resource: "paiement", count: 12, open: opened },
        ],
        actions: opened
          ? [
              {
                ...MATRIX.actions[0],
                specId: "PM-paiement.creer",
                label: "Encaisser",
                resource: "paiement",
              },
            ]
          : MATRIX.actions,
      };
    });
    renderFeatures({ search: "?tab=roles" });
    await findNamed("heading", "Client");
    const closed = screen.getByRole("button", { name: /paiement/ });
    expect(closed).toHaveAttribute("aria-expanded", "false");
    expect(closed.closest("th")).toHaveAttribute("scope", "rowgroup");
    await user.click(closed);
    expect(await screen.findByText("Encaisser")).toBeVisible();
    expect(inputsOf(procedures.specRolesMatrix).some((input) => input.group === "paiement")).toBe(
      true,
    );
    expect(screen.getByRole("button", { name: /paiement/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("« Nouveau rôle » : permissions avec restriction -> role.create ; designer n'a pas le bouton", async () => {
    const user = userEvent.setup();
    renderFeatures({ search: "?tab=roles&new=1" });
    const dialog = await findRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: /^Nom/ }), "Stagiaire");
    await user.type(
      within(dialog).getByRole("textbox", { name: /^Description/ }),
      "Voit l'agenda.",
    );
    await user.type(
      within(dialog).getByRole("combobox", { name: "Permissions : ajouter" }),
      "PM-agenda.lire (les siennes){Enter}",
    );
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer dans la spec" }));
    await waitFor(() => expect(procedures.specBatchSubmit).toHaveBeenCalledTimes(1));
    expect(inputsOf(procedures.specBatchSubmit)[0]).toMatchObject({
      operations: [
        {
          kind: "role.create",
          name: "Stagiaire",
          description: "Voit l'agenda.",
          permissions: [{ id: "PM-agenda.lire", restriction: "les siennes" }],
        },
      ],
    });
  });

  it("designer : ni « Nouveau rôle » ni « Modifier RL-client »", async () => {
    serve("designer");
    renderFeatures({ search: "?tab=roles" });
    await findNamed("heading", "Client");
    expect(screen.queryByRole("button", { name: /Nouveau rôle/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Modifier RL-client" })).toBeNull();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Onglet Parcours", () => {
  it("un parcours par carte : étapes dans un ol, flèches décoratives, cas d'erreur, pages de 6", async () => {
    renderFeatures({ search: "?tab=flows" });
    expect(await findNamed("heading", "Réserver un rendez-vous")).toBeVisible();
    const steps = screen.getByRole("list", { name: "Étapes du parcours" });
    expect(steps.tagName).toBe("OL");
    expect(within(steps).getAllByRole("listitem")).toHaveLength(3);
    expect(within(steps).getAllByRole("listitem")[0]).toHaveTextContent(
      "Étape 1Accueil du portailS-accueil",
    );
    expect(screen.getByText("Fonctionnalités : F-001, F-004")).toBeVisible();
    expect(document.querySelector("[data-slot='flow-error']")).toHaveTextContent(
      "Étape 3 : créneau pris",
    );
    expect(countBar()).toHaveTextContent("18 parcours · 1 chargé");
    expect(inputsOf(procedures.specFunctionalList)[0]).toMatchObject({ tab: "flows", limit: 6 });
  });

  it("le designer écrit les parcours : « Nouveau parcours » et « Modifier P-reserver »", async () => {
    serve("designer");
    renderFeatures({ search: "?tab=flows" });
    await findNamed("heading", "Réserver un rendez-vous");
    expect(screen.getAllByRole("button", { name: "Nouveau parcours" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Modifier P-reserver" })).toBeVisible();
  });

  it("« Nouveau parcours » -> flow.create avec départ, étapes et cas d'erreur parsés", async () => {
    const user = userEvent.setup();
    renderFeatures({ search: "?tab=flows&new=1" });
    const dialog = await findRole("dialog");
    expect(within(dialog).getByText("design/flows/P-titre.yaml")).toBeVisible();
    await user.type(within(dialog).getByRole("textbox", { name: /^Titre/ }), "Liste d'attente");
    await user.type(within(dialog).getByRole("textbox", { name: /^Acteur/ }), "Client");
    await user.type(
      within(dialog).getByRole("textbox", { name: /^Point de départ/ }),
      "Écran complet · S-creneaux",
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: /^Étapes/ }),
      "S'inscrire · S-liste{Enter}Confirmation",
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: /^Cas d'erreur/ }),
      "Étape 2 : refus",
    );
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer dans la spec" }));
    await waitFor(() => expect(procedures.specBatchSubmit).toHaveBeenCalledTimes(1));
    expect(inputsOf(procedures.specBatchSubmit)[0]).toMatchObject({
      operations: [
        {
          kind: "flow.create",
          title: "Liste d'attente",
          actor: "Client",
          start: { label: "Écran complet", screen: "S-creneaux" },
          steps: [{ label: "S'inscrire", screen: "S-liste" }, { label: "Confirmation" }],
          errors: [{ step: 2, text: "refus" }],
        },
      ],
    });
  });

  it("un nom déjà pris (write_conflict) : « Un parcours de ce titre existe déjà. »", async () => {
    const user = userEvent.setup();
    procedures.specBatchSubmit.mockRejectedValue(
      apiError("SPEC_BATCH_CONFLICT", { reason: "write_conflict" }),
    );
    renderFeatures({ search: "?tab=flows&new=1" });
    const dialog = await findRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: /^Titre/ }), "Réserver");
    await user.type(within(dialog).getByRole("textbox", { name: /^Acteur/ }), "Client");
    await user.type(within(dialog).getByRole("textbox", { name: /^Point de départ/ }), "Accueil");
    await user.type(within(dialog).getByRole("textbox", { name: /^Étapes/ }), "Choisir");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer dans la spec" }));
    expect(await screen.findByText("Un parcours de ce titre existe déjà.")).toBeVisible();
  });
});
