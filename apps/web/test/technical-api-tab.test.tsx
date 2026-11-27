import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lastSubmit } from "./support/feature-form.tsx";
import { fake, serveProposals } from "./support/proposals.tsx";
import { commitOnSubmit, renderTechnical, serveTechnical } from "./support/technical.tsx";
import { operation } from "./support/technical-api.ts";
import {
  apiError,
  polyfillRadix,
  procedures,
  resetWebMocks,
  watchUrl,
} from "./support/web-mocks.ts";

/** TK-116 lot B : onglet API, fiche d'une opération (trois vues) et feuille « Opération » (maquette 14 l.222-258). */
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

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
});

const API = "tab=api";
const fiche = () => screen.findByRole("article", { name: "Opération" });
const row = (name: string) => screen.findByRole("button", { name: new RegExp(` ${name} `) });
const zones = () => screen.getByRole("group", { name: "Filtrer par zone" });
const listInput = () => procedures.specTechnicalOpsList.mock.calls.at(-1)?.[0];

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Onglet API : liste", () => {
  it("recherche, zones, compte annoncé, tri, lignes sans « PM- » et fin de liste", async () => {
    serveTechnical("owner");
    renderTechnical({ search: API });
    expect(
      await screen.findByRole("searchbox", { name: "Rechercher une opération" }),
    ).toHaveAttribute("placeholder", "Rechercher une opération, ex. reservation.");
    expect((await row("reservation.cancel")).textContent).toContain("reservation.modifier");
    expect((await row("reservation.cancel")).textContent).not.toContain("PM-");
    const bar = screen.getByText("132 opérations").closest('[role="status"]') as HTMLElement;
    expect(bar).toHaveTextContent("· 3 chargées");
    expect(bar).toHaveTextContent("Tri : zone puis nom");
    expect(
      within(zones())
        .getAllByRole("button")
        .map((chip) => chip.textContent),
    ).toEqual(["Toutes · 3", "Communication · 1", "Prise de rendez-vous · 2"]);
    expect(await row("reservation.cancel")).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("Les 50 suivantes", { exact: false })).toBeInTheDocument();
  });

  it("toutes chargées : « Fin de la liste · 3 opérations »", async () => {
    serveTechnical("owner", { operations: [operation("a.list"), operation("b.list")] });
    renderTechnical({ search: API });
    expect(await screen.findByText("Fin de la liste · 2 opérations")).toBeInTheDocument();
    expect(screen.getByText("· toutes chargées")).toBeInTheDocument();
  });

  it("zone choisie : lecture filtrée et adresse ; « Toutes » la retire", async () => {
    serveTechnical("owner");
    renderTechnical({ search: API });
    await row("reservation.cancel");
    const chip = within(zones()).getByRole("button", { name: "Communication · 1" });
    await userEvent.click(chip);
    await waitFor(() => expect(listInput()).toMatchObject({ zone: "Communication" }));
    expect(window.location.search).toContain("zone=Communication");
    expect(chip).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(zones()).getByRole("button", { name: /^Toutes/ }));
    await waitFor(() => expect(window.location.search).not.toContain("zone="));
  });

  it("recherche sans résultat : « Effacer la recherche » repart de toute la liste", async () => {
    serveTechnical("owner");
    renderTechnical({ search: `${API}&q=zzz` });
    expect(await screen.findByText("Aucune opération ne correspond à « zzz »")).toBeInTheDocument();
    expect(procedures.specTechnicalStackList.mock.calls.at(-1)?.[0]).not.toHaveProperty("q");
    await userEvent.click(screen.getByRole("button", { name: "Effacer la recherche" }));
    expect(await row("reservation.cancel")).toBeVisible();
    expect(window.location.search).not.toContain("q=");
  });

  it("vide : « Aucune opération pour l'instant » et l'ajout ; designer sans ajout", async () => {
    serveTechnical("owner", { operations: [] });
    renderTechnical({ search: API });
    expect(await screen.findByText("Aucune opération pour l'instant")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Nouvelle opération" })).toHaveLength(2);
  });

  it("quota GitHub ou panne : message et « Réessayer »", async () => {
    serveTechnical("owner");
    procedures.specTechnicalOpsList.mockRejectedValue(
      apiError("PROVIDER_RATE_LIMITED", { retryAfterMs: 120_000 }),
    );
    renderTechnical({ search: API });
    expect(
      await screen.findByText("GitHub limite les lectures, réessayez dans 2 min."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeVisible();
  });

  it("relecture : la ligne visée par une mise à jour proposée est en pointillés", async () => {
    serveTechnical("owner");
    serveProposals([
      fake(1, {
        kind: "op",
        title: "reservation.cancel",
        content: { specId: "reservation.cancel", name: "reservation.cancel" },
      }),
    ]);
    renderTechnical({ search: `${API}&view=review` });
    await waitFor(async () =>
      expect((await row("reservation.cancel")).className).toContain("border-dashed"),
    );
    expect((await row("rappel.send")).className).not.toContain("border-dashed");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Fiche d'une opération", () => {
  it("type, zone et composant, tables, groupes et appelants", async () => {
    serveTechnical("owner");
    renderTechnical({ search: `${API}&op=reservation.cancel` });
    const article = await fiche();
    expect(await within(article).findByText("Prise de rendez-vous · C-api")).toBeVisible();
    expect(
      within(article).getByRole("heading", { level: 2, name: "reservation.cancel" }),
    ).toBeVisible();
    for (const name of ["Entrée", "Sortie", "Erreurs"]) {
      expect(within(article).getByRole("table", { name })).toBeInTheDocument();
    }
    const errors = within(article).getByRole("table", { name: "Erreurs" });
    expect(errors).toHaveTextContent("CodeRègleQuand");
    expect(errors).toHaveTextContent("JETON_INVALIDE—lien expiré ou inconnu");
    for (const text of [
      "Qui peut appeler",
      "PM-reservation.modifier",
      "Client (les siennes)",
      "Accueil",
      "Règles appliquées",
      "Fonctionnalités",
      "Limite de débit",
      "20 par minute et par IP",
    ]) {
      expect(article).toHaveTextContent(text);
    }
  });

  it("opérations publique et interne : appelants libellés, aucune table d'erreurs vide", async () => {
    serveTechnical("owner");
    renderTechnical({ search: `${API}&op=creneau.listAvailable` });
    const article = await fiche();
    await within(article).findByText("Tout le monde");
    expect(within(article).queryByRole("table", { name: "Erreurs" })).toBeNull();
    await userEvent.click(await row("rappel.send"));
    // B778 : « interne » · « Appel interne ».
    expect(await screen.findByText("Appel interne")).toBeInTheDocument();
    expect(window.location.search).toContain("op=rappel.send");
  });

  it("vue YAML : le fichier, « Source de vérité » et sa note", async () => {
    serveTechnical("owner");
    renderTechnical({ search: `${API}&op=reservation.cancel` });
    const article = await fiche();
    await userEvent.click(await within(article).findByRole("button", { name: "YAML" }));
    expect(await within(article).findByText("api/endpoints/reservation.cancel.yaml")).toBeVisible();
    expect(within(article).getByText("Source de vérité")).toBeVisible();
    expect(article).toHaveTextContent(
      "Un fichier par opération : c'est ce que l'agent lit et modifie.",
    );
  });

  it("vue « Contrat généré » : chemin, pastille, code et note ; aucun choix de langage", async () => {
    serveTechnical("owner");
    renderTechnical({ search: `${API}&op=reservation.cancel` });
    const article = await fiche();
    await userEvent.click(await within(article).findByRole("button", { name: "Contrat généré" }));
    expect(await within(article).findByText("Généré · TypeScript · oRPC")).toBeVisible();
    expect(within(article).getByRole("region", { name: "Contrat généré" })).toHaveTextContent(
      "export const reservationCancel = oc",
    );
    expect(article).toHaveTextContent(
      "Généré par le générateur de la stack retenue (ST-api). Si la stack change, le contrat est régénéré dans le nouveau langage ; le YAML reste la source.",
    );
    expect(within(article).queryByRole("button", { name: /PHP|Python/ })).toBeNull();
  });

  it.each([
    [{ reason: "no_choice" }, "Aucun contrat : le choix ST-api reste à trancher."],
    [
      { reason: "unsupported_stack", choice: "Laravel 12" },
      "Aucun générateur pour la stack retenue (Laravel 12) : seul TypeScript · oRPC est disponible.",
    ],
  ])("sans contrat %o : la raison à la place du code", async (reason, text) => {
    serveTechnical("owner");
    procedures.specTechnicalContract.mockResolvedValue({
      available: false,
      ...reason,
      commitSha: "a".repeat(40),
    });
    renderTechnical({ search: `${API}&op=reservation.cancel` });
    const article = await fiche();
    await userEvent.click(await within(article).findByRole("button", { name: "Contrat généré" }));
    expect(await within(article).findByText(text)).toBeVisible();
    expect(within(article).queryByRole("region", { name: "Contrat généré" })).toBeNull();
  });

  it("designer : les trois vues, sans « Modifier »", async () => {
    serveTechnical("designer");
    renderTechnical({ search: `${API}&op=reservation.cancel` });
    const article = await fiche();
    expect(await within(article).findByRole("button", { name: "Contrat généré" })).toBeVisible();
    expect(within(article).queryByRole("button", { name: "Modifier" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Nouvelle opération" })).toBeNull();
  });

  it("lien périmé : l'opération inconnue quitte l'adresse", async () => {
    serveTechnical("owner");
    procedures.specTechnicalOpsById.mockImplementation(async () => {
      throw apiError("NOT_FOUND");
    });
    renderTechnical({ search: `${API}&op=inconnue.lire` });
    await waitFor(() => expect(window.location.search).not.toContain("op="));
  });
});

const sheet = (name: string) => screen.findByRole("dialog", { name });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Feuille « Opération »", () => {
  it("création : champs de la maquette, fichier, erreurs résumées avec focus", async () => {
    serveTechnical("owner");
    renderTechnical({ search: `${API}&new=1` });
    const dialog = await sheet("Nouvelle opération");
    for (const label of [
      "Nom",
      "Type",
      "Zone",
      "Résumé",
      "Permission",
      "Entrée",
      "Sortie",
      "Erreurs",
      "Règles et fonctionnalités",
      "Limite de débit",
    ]) {
      expect(within(dialog).getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(within(dialog).queryByText("Composant")).toBeNull();
    expect(within(dialog).getByText("api/endpoints/zone.verbe.yaml")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Enregistrer dans la spec" }));
    expect(await within(dialog).findByText(/7 points à corriger/)).toHaveFocus();
    expect(procedures.specBatchSubmit).not.toHaveBeenCalled();
  });

  it("préremplissage : les listes deviennent des lignes « nom · type · contrainte »", async () => {
    serveTechnical("owner");
    procedures.aiPrefillItem.mockResolvedValue({
      type: "operation",
      values: {
        name: "waitlist.join",
        type: "write",
        input: [{ field: "serviceId", type: "uuid", constraint: "service actif" }],
        output: [{ field: "position", type: "entier" }],
        errors: [{ code: "DEJA_INSCRIT", when: "même téléphone" }],
        links: ["F-249"],
      },
    });
    renderTechnical({ search: `${API}&new=1` });
    const dialog = await sheet("Nouvelle opération");
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "Description pour l'agent" }),
      "liste d'attente",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Préremplir" }));
    await waitFor(() =>
      expect(within(dialog).getByRole("textbox", { name: /^Nom/ })).toHaveValue("waitlist.join"),
    );
    expect(within(dialog).getByRole("textbox", { name: /^Entrée/ })).toHaveValue(
      "serviceId · uuid · service actif",
    );
    expect(within(dialog).getByRole("textbox", { name: /^Sortie/ })).toHaveValue(
      "position · entier",
    );
    expect(within(dialog).getByRole("textbox", { name: /^Erreurs/ })).toHaveValue(
      "DEJA_INSCRIT · même téléphone",
    );
    expect(within(dialog).getByText("F-249")).toBeInTheDocument();
    expect(procedures.aiPrefillItem.mock.calls[0]?.[0]).toMatchObject({ type: "operation" });
  });

  it("ligne incomplète : l'erreur désigne la ligne", async () => {
    serveTechnical("owner");
    renderTechnical({ search: `${API}&new=1` });
    const dialog = await sheet("Nouvelle opération");
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: /^Entrée/ }),
      "serviceId · uuid{enter}nom",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Enregistrer dans la spec" }));
    expect(
      await within(dialog).findByText("Ligne 2 : un nom de champ et un type sont attendus."),
    ).toBeInTheDocument();
  });

  it("modification : op.update des seuls champs changés, puis « Opération enregistrée »", async () => {
    serveTechnical("owner");
    commitOnSubmit(procedures.specBatchSubmit);
    renderTechnical({ search: `${API}&edit=reservation.cancel` });
    const summary = await screen.findByRole("textbox", { name: /^Résumé/ });
    expect(screen.getByRole("textbox", { name: /^Nom/ })).toHaveAttribute("readonly");
    await userEvent.clear(summary);
    await userEvent.type(summary, "Annule une réservation.");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));
    await waitFor(() => expect(procedures.specBatchSubmit).toHaveBeenCalled());
    expect(lastSubmit().operations).toEqual([
      {
        kind: "op.update",
        specId: "reservation.cancel",
        summary: "Annule une réservation.",
      },
    ]);
    expect(await screen.findByText("Opération enregistrée")).toBeInTheDocument();
  });

  it("« Modifier » de la fiche ouvre la feuille ; « Supprimer » envoie op.delete", async () => {
    serveTechnical("owner");
    commitOnSubmit(procedures.specBatchSubmit);
    renderTechnical({ search: `${API}&op=reservation.cancel` });
    await userEvent.click(await within(await fiche()).findByRole("button", { name: "Modifier" }));
    const dialog = await sheet("Modifier l'opération");
    await userEvent.click(await within(dialog).findByRole("button", { name: "Supprimer" }));
    const confirm = within(dialog).getByRole("group", { name: "Confirmer la suppression" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Supprimer" }));
    await waitFor(() => expect(procedures.specBatchSubmit).toHaveBeenCalled());
    expect(lastSubmit().operations).toEqual([{ kind: "op.delete", specId: "reservation.cancel" }]);
  });
});
