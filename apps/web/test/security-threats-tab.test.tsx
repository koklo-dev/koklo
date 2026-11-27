import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STEP_REPORT, STEPS_LINE, SUMMARY_LINE, serveLaunch } from "./support/launch.ts";
import { renderSecurity, serveSecurity } from "./support/security.tsx";
import { polyfillRadix, procedures, resetWebMocks, watchUrl } from "./support/web-mocks.ts";

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

const fiche = () => screen.findByRole("complementary", { name: "Fiche de la menace" });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("onglet Menaces", () => {
  it("compte, pastille « N à traiter » et groupes par surface repliables", async () => {
    serveSecurity("owner");
    renderSecurity();
    expect(await screen.findByText("3 menaces")).toBeVisible();
    expect(screen.getByText("2 traitées · 2 de gravité élevée")).toBeVisible();
    expect(screen.getByText("1 à traiter")).toBeVisible();
    const group = await screen.findByRole("button", { name: "F-012 Fichier clients et RGPD" });
    expect(group).toHaveAttribute("aria-expanded", "true");
    await userEvent.setup().click(group);
    expect(group).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /SEC-T08/ })).toBeNull();
  });

  it("filtres par puces écrits dans l'adresse et lus au serveur", async () => {
    serveSecurity("owner");
    renderSecurity();
    const chip = await screen.findByRole("button", { name: "À traiter" });
    expect(screen.getByRole("button", { name: "Toutes" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.setup().click(chip);
    await waitFor(() => expect(window.location.search).toContain("filter=todo"));
    await waitFor(() =>
      expect(procedures.securityThreatList).toHaveBeenCalledWith(
        expect.objectContaining({ filter: "todo" }),
      ),
    );
  });

  it("fiche d'une menace élevée sans parade : encadré ambre et « Proposer une parade »", async () => {
    serveSecurity("owner");
    renderSecurity({ search: "threat=SEC-T08" });
    const panel = await fiche();
    expect(await within(panel).findByText("Ce qui peut arriver")).toBeVisible();
    expect(within(panel).getByRole("heading", { level: 2 })).toHaveTextContent("Export du fichier");
    expect(
      within(panel).getByText(/Une menace de gravité élevée sans parade bloque/),
    ).toBeVisible();
    expect(
      within(panel).getByText("Aucune vérification tant que la parade n'est pas décidée."),
    ).toBeVisible();
    await userEvent
      .setup()
      .click(within(panel).getByRole("button", { name: "Proposer une parade" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("textbox")).toHaveValue("Proposer des parades pour SEC-T08");
  });

  it("parades, puces et vue « Scénario d'abus » en Gherkin", async () => {
    serveSecurity("owner");
    renderSecurity({ search: "threat=SEC-T01" });
    const panel = await fiche();
    expect(await within(panel).findByText("Lien à usage unique.")).toBeVisible();
    expect(within(panel).getByText("Fonctionnalité", { selector: "dt" })).toBeVisible();
    expect(within(panel).getByText("Touche")).toBeVisible();
    const user = userEvent.setup();
    await user.click(within(panel).getByRole("button", { name: "Scénario d'abus" }));
    expect(within(panel).getByText("quality/scenarios/abuse/SEC-T01.feature")).toBeVisible();
    expect(within(panel).getByText("Scénario d'abus généré")).toBeVisible();
    expect(panel).toHaveTextContent("@SEC-T01 @F-009 @abus");
  });

  it("contrôle de la CI : mention à la place du scénario", async () => {
    serveSecurity("owner");
    renderSecurity({ search: "threat=SEC-T10" });
    const panel = await fiche();
    await within(panel).findByText("Secrets injectés au déploiement.");
    expect(panel).toHaveTextContent("Contrôle de la CI · secrets : bloque la fusion");
    await userEvent.setup().click(within(panel).getByRole("button", { name: "Scénario d'abus" }));
    expect(panel).toHaveTextContent("Vérifiée par un contrôle de la CI, pas par un scénario.");
  });

  it("une ligne ouvre sa fiche (adresse)", async () => {
    serveSecurity("owner");
    renderSecurity();
    await userEvent.setup().click(await screen.findByRole("button", { name: /SEC-T10/ }));
    await waitFor(() => expect(window.location.search).toContain("threat=SEC-T10"));
  });

  it("vide et recherche sans résultat", async () => {
    serveSecurity("owner", { threats: [] });
    renderSecurity({ search: "q=rien" });
    expect(await screen.findByText("Aucune menace ne correspond")).toBeVisible();
    expect(screen.getByRole("button", { name: "Effacer la recherche" })).toBeVisible();
  });
});

const NO_THREAT = "Aucune menace pour l'instant";

describe("TK-115b : « Menaces » vide et étapes écartées", () => {
  const serve = (role: "owner" | "designer", report: Record<string, unknown> = STEP_REPORT) => {
    serveSecurity(role, { threats: [] });
    serveLaunch(report);
  };

  it("le bilan en note au-dessus de l'état vide", async () => {
    serve("owner");
    renderSecurity();
    const note = (await screen.findByText(SUMMARY_LINE)).closest('[role="note"]');
    expect(note).toHaveTextContent(STEPS_LINE);
    const empty = await screen.findByText(NO_THREAT);
    expect(
      (note as Node).compareDocumentPosition(empty) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("pas de bilan sans étape écartée, ni pour le designer", async () => {
    serve("owner", { ...STEP_REPORT, zonesDiscarded: 0, discardReasons: [] });
    const first = renderSecurity();
    expect(await screen.findByText(NO_THREAT)).toBeVisible();
    await waitFor(() => expect(procedures.proposalList.mock.results.length).toBeGreaterThan(0));
    expect(screen.queryByText(/Bilan du lancement/)).toBeNull();
    first.unmount();
    resetWebMocks();
    serve("designer");
    renderSecurity();
    expect(await screen.findByText(NO_THREAT)).toBeVisible();
    expect(screen.queryByText(/Bilan du lancement/)).toBeNull();
  });

  it("pas de bilan sur un filtre sans résultat", async () => {
    serve("owner");
    renderSecurity({ search: "q=rien" });
    expect(await screen.findByText("Aucune menace ne correspond")).toBeVisible();
    await waitFor(() => expect(procedures.proposalList.mock.results.length).toBeGreaterThan(0));
    expect(screen.queryByText(/Bilan du lancement/)).toBeNull();
  });
});
