import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lastSubmit } from "./support/feature-form.tsx";
import { fake, serveProposals } from "./support/proposals.tsx";
import { commitOnSubmit, renderTechnical, serveTechnical } from "./support/technical.tsx";
import { requirement } from "./support/technical-api.ts";
import {
  apiError,
  polyfillRadix,
  procedures,
  resetWebMocks,
  specDeliverables,
  watchUrl,
} from "./support/web-mocks.ts";

/** TK-116 lot B : onglet Exigences et feuille « Exigence » (maquette 14 l.259-279, 652-672). */
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

const NFR = "tab=nfr";
const card = (name: string) => screen.findByRole("article", { name: new RegExp(`^${name} `) });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Onglet Exigences", () => {
  it("barre, catégories dans l'ordre et cartes sans couverture", async () => {
    serveTechnical("owner");
    renderTechnical({ search: NFR });
    await card("NFR-001");
    const bar = screen.getByText("28 exigences").closest('[role="status"]') as HTMLElement;
    expect(bar).toHaveTextContent("Couverture : après la Qualité");
    expect(bar).toHaveTextContent(
      "Une exigence = une cible mesurable + sa vérification au lot Qualité",
    );
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(["Données personnelles 1", "Performance 1", "Sécurité 1"]);
    expect(await card("NFR-001")).toHaveTextContent("Scénario du lot Qualité · TS-041");
    expect(await card("NFR-003")).toHaveTextContent("À définir");
    expect(await card("NFR-004")).toHaveTextContent("Mesure en CI");
    expect(screen.queryByText(/Couverte|À couvrir/)).toBeNull();
    expect(screen.getByRole("button", { name: "Modifier NFR-003" })).toBeVisible();
  });

  it("pages de 50 : pied de liste au féminin et « Charger la suite »", async () => {
    const requirements = Array.from({ length: 60 }, (_, index) => requirement(index + 1));
    serveTechnical("owner", { requirements });
    renderTechnical({ search: NFR });
    await card("NFR-001");
    await userEvent.click(screen.getByRole("button", { name: "Charger la suite" }));
    expect(await card("NFR-060")).toBeVisible();
    expect(screen.getByText("Fin de la liste · 60 exigences")).toBeInTheDocument();
  });

  it("vide : « Aucune exigence pour l'instant » et l'ajout ; designer sans crayon", async () => {
    serveTechnical("owner", { requirements: [] });
    renderTechnical({ search: NFR });
    expect(await screen.findByText("Aucune exigence pour l'instant")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Nouvelle exigence" })).toHaveLength(2);
  });

  it("designer : lecture sans crayon ni ajout", async () => {
    serveTechnical("designer");
    renderTechnical({ search: NFR });
    await card("NFR-001");
    expect(screen.queryByRole("button", { name: /^Modifier|Nouvelle exigence/ })).toBeNull();
  });

  it("panne : erreur et « Réessayer »", async () => {
    serveTechnical("owner");
    procedures.specTechnicalNfrList.mockRejectedValue(apiError("INTERNAL_SERVER_ERROR"));
    renderTechnical({ search: NFR });
    expect(await screen.findByText("Impossible de charger les exigences")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeVisible();
  });

  it("à revoir : les cartes concernées en ambre ; relecture : cartes proposées en pointillés", async () => {
    serveTechnical("owner");
    procedures.specDeliverables.mockResolvedValue(
      specDeliverables({
        open: new Set(["functional", "data", "architecture", "technical", "design"]),
        validated: ["functional", "data", "architecture"],
        status: { technical: "revise" },
        staleTechnical: { changes: [{ id: "C-avis", change: "added" }], items: ["NFR-004"] },
      }),
    );
    serveProposals([fake(1, { kind: "nfr", title: "Exigence 3", content: { specId: "NFR-003" } })]);
    renderTechnical({ search: `${NFR}&view=review` });
    await waitFor(async () =>
      expect((await card("NFR-004")).className).toContain("border-status-pending-icon"),
    );
    await waitFor(async () => expect((await card("NFR-003")).className).toContain("border-dashed"));
    expect((await card("NFR-001")).className).not.toMatch(/dashed|pending-icon/);
  });
});

const sheet = (name: string) => screen.findByRole("dialog", { name });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Feuille « Exigence »", () => {
  it("création : champs de la maquette, erreurs, fichier", async () => {
    serveTechnical("owner");
    renderTechnical({ search: `${NFR}&new=1` });
    const dialog = await sheet("Nouvelle exigence");
    for (const label of [
      "Catégorie",
      "Titre",
      "Cible mesurable",
      "Énoncé",
      "Vérification",
      "Liens",
    ]) {
      expect(within(dialog).getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(within(dialog).getByText("nfr/NFR-nnn.yaml")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Enregistrer dans la spec" }));
    expect(await within(dialog).findByText(/5 points à corriger/)).toHaveFocus();
  });

  it("création enregistrée : nfr.create", async () => {
    serveTechnical("owner");
    commitOnSubmit(procedures.specBatchSubmit);
    renderTechnical({ search: `${NFR}&new=1` });
    const dialog = await sheet("Nouvelle exigence");
    const form = within(dialog);
    await userEvent.click(form.getByRole("radio", { name: "Exploitation" }));
    await userEvent.type(form.getByRole("textbox", { name: /^Titre/ }), "Ponctualité");
    await userEvent.type(form.getByRole("textbox", { name: /^Cible/ }), "95 % avant 18 h 05");
    await userEvent.type(form.getByRole("textbox", { name: /^Énoncé/ }), "Les rappels partent.");
    await userEvent.click(form.getByRole("combobox", { name: /^Vérification/ }));
    await userEvent.click(await screen.findByRole("option", { name: "Mesure en CI" }));
    await userEvent.click(form.getByRole("button", { name: "Enregistrer dans la spec" }));
    await waitFor(() => expect(procedures.specBatchSubmit).toHaveBeenCalled());
    expect(lastSubmit().operations).toEqual([
      {
        kind: "nfr.create",
        category: "operations",
        title: "Ponctualité",
        target: "95 % avant 18 h 05",
        statement: "Les rappels partent.",
        verification: "ci_measure",
      },
    ]);
  });

  it("crayon puis modification : nfr.update des seuls champs changés, « Exigence enregistrée »", async () => {
    serveTechnical("owner");
    commitOnSubmit(procedures.specBatchSubmit);
    renderTechnical({ search: NFR });
    await userEvent.click(await screen.findByRole("button", { name: "Modifier NFR-003" }));
    const dialog = await sheet("Modifier l'exigence");
    const target = await within(dialog).findByRole("textbox", { name: /^Cible/ });
    await userEvent.clear(target);
    await userEvent.type(target, "p95 < 200 ms");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Enregistrer les modifications" }),
    );
    await waitFor(() => expect(procedures.specBatchSubmit).toHaveBeenCalled());
    expect(lastSubmit().operations).toEqual([
      { kind: "nfr.update", specId: "NFR-003", target: "p95 < 200 ms" },
    ]);
    expect(await screen.findByText("Exigence enregistrée")).toBeInTheDocument();
  });
});
