import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FLOW_ROWS, renderArchitecture, serveArchitecture } from "./support/architecture.tsx";
import { RATE_LIMITED_TEXT, rejectOnce, sourceOf } from "./support/git-read.ts";
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

/** TK-112 lot B, cas 8 et 9 : onglet Flux (maquette 13 l.405-441) : liste, séquence, sélecteur Diagramme · YAML · Mermaid. */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
});

const list = () => screen.findByRole("region", { name: "Flux de l'architecture" });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Onglet Flux", () => {
  it("liste un flux par parcours (titre, acteur, composants, externes) et ouvre le premier en séquence", async () => {
    serveArchitecture("owner");
    renderArchitecture({ search: "tab=flows" });
    const rows = within(await list());
    expect(rows.getByText("Réserver un rendez-vous")).toBeVisible();
    expect(rows.getByText("Client · 3 composants, 1 externe")).toBeVisible();
    expect(rows.getByText("P-annuler")).toBeVisible();
    expect(
      await screen.findByRole("img", {
        name: "Diagramme de séquence Réserver un rendez-vous, 5 messages",
      }),
    ).toBeVisible();
    expect(screen.getByText("sinon · créneau pris")).toBeVisible();
    expect(screen.getByText("La veille à 18 h")).toBeVisible();
    expect(screen.getAllByText(/2 flux/).length).toBeGreaterThan(0);
  });

  it("« Lire les messages » : l'alternative textuelle numérotée du diagramme", async () => {
    serveArchitecture("owner");
    renderArchitecture({ search: "tab=flows" });
    const summary = await screen.findByText("Lire les messages");
    const items = within(summary.closest("details") as HTMLElement).getAllByRole("listitem", {
      hidden: true,
    });
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent("Client vers Application web : Choisit un créneau");
  });

  it("liens du flux : fonctionnalité, règle et décision en pastilles", async () => {
    serveArchitecture("owner");
    renderArchitecture({ search: "tab=flows" });
    const links = await screen.findByRole("region", { name: "Liens du flux" });
    for (const id of ["F-001", "R-001", "ADR-003"])
      expect(within(links).getByText(id)).toBeVisible();
  });

  it("choisir un autre flux l'écrit dans l'adresse (?f=) et le lit", async () => {
    serveArchitecture("owner");
    renderArchitecture({ search: "tab=flows" });
    await userEvent.click(await screen.findByRole("button", { name: /Annuler ou déplacer/ }));
    await waitFor(() => expect(window.location.search).toContain("f=P-annuler"));
    await waitFor(() =>
      expect(procedures.specArchitectureFlowsById).toHaveBeenLastCalledWith(
        expect.objectContaining({ flowId: "P-annuler" }),
      ),
    );
  });

  it("sélecteur Diagramme · YAML · Mermaid : YAML « Source de vérité », Mermaid « Généré »", async () => {
    serveArchitecture("owner");
    renderArchitecture({ search: "tab=flows" });
    const group = await screen.findByRole("group", { name: "Affichage du flux" });
    await userEvent.click(within(group).getByRole("button", { name: "YAML" }));
    expect(await screen.findByText("architecture/flows/P-reserver.yaml")).toBeVisible();
    expect(screen.getByText("Source de vérité")).toBeVisible();
    await userEvent.click(within(group).getByRole("button", { name: "Mermaid" }));
    expect(await screen.findByText("architecture/flows/P-reserver.mmd")).toBeVisible();
    expect(screen.getByText("Généré")).toBeVisible();
    expect(procedures.specArchitectureSource).toHaveBeenLastCalledWith(
      expect.objectContaining({ format: "mermaid", target: { kind: "flow", id: "P-reserver" } }),
    );
  });

  it("designer : lit la liste, le diagramme et les sources, sans « Modifier » ni « Nouveau flux »", async () => {
    serveArchitecture("designer");
    renderArchitecture({ search: "tab=flows" });
    await screen.findByRole("img", { name: /Diagramme de séquence/ });
    expect(screen.queryByRole("button", { name: "Modifier" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Nouveau flux" })).toBeNull();
    expect(screen.getByRole("button", { name: "YAML" })).toBeVisible();
  });

  it("équipe qui écrit : « Nouveau flux » en tête, « Modifier » sur le flux", async () => {
    serveArchitecture("owner");
    renderArchitecture({ search: "tab=flows" });
    expect(await screen.findByRole("button", { name: "Nouveau flux" })).toBeVisible();
    expect(await screen.findByRole("button", { name: "Modifier" })).toBeVisible();
  });

  it("aucun flux : « Aucun flux. Un flux se propose par parcours. »", async () => {
    serveArchitecture("owner");
    procedures.specArchitectureFlowsList.mockResolvedValue({
      items: [],
      nextCursor: null,
      previousCursor: null,
      offset: 0,
      total: 0,
    });
    renderArchitecture({ search: "tab=flows" });
    expect(await screen.findByText("Aucun flux. Un flux se propose par parcours.")).toBeVisible();
  });

  it("lecture des flux en échec : message et « Réessayer »", async () => {
    serveArchitecture("owner");
    procedures.specArchitectureFlowsList.mockRejectedValue(new Error("boom"));
    renderArchitecture({ search: "tab=flows" });
    expect(await screen.findByText("Impossible de charger les flux")).toBeVisible();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeVisible();
  });

  it("YAML du flux : quota GitHub épuisé → délai et « Réessayer » relance la lecture (TK-114f)", async () => {
    serveArchitecture("owner");
    rejectOnce(procedures.specArchitectureSource, (input) => sourceOf(input).format === "yaml");
    renderArchitecture({ search: "tab=flows" });
    const group = await screen.findByRole("group", { name: "Affichage du flux" });
    await userEvent.click(within(group).getByRole("button", { name: "YAML" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(RATE_LIMITED_TEXT);
    const calls = procedures.specArchitectureSource.mock.calls.length;
    await userEvent.click(within(alert).getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("architecture/flows/P-reserver.yaml")).toBeVisible();
    expect(procedures.specArchitectureSource.mock.calls.length).toBe(calls + 1);
  });

  it("YAML du flux : autre erreur → texte inchangé, sans délai", async () => {
    serveArchitecture("owner");
    rejectOnce(procedures.specArchitectureSource, () => true, new Error("boom"));
    renderArchitecture({ search: "tab=flows" });
    const group = await screen.findByRole("group", { name: "Affichage du flux" });
    await userEvent.click(within(group).getByRole("button", { name: "YAML" }));
    expect(await screen.findByText("Le fichier du flux n'a pas pu être lu.")).toBeVisible();
    expect(screen.queryByText(/GitHub limite les lectures/)).toBeNull();
  });

  it("sous 768 px, la liste d'abord puis le détail avec « Liste » pour revenir (?f=)", async () => {
    serveArchitecture("owner");
    renderArchitecture({ search: "tab=flows&f=P-annuler" });
    const back = await screen.findByRole("button", { name: "Liste" });
    expect(back.className).toContain("md:hidden");
    expect((await list()).closest("div")?.className).toContain("max-md:hidden");
    await userEvent.click(back);
    await waitFor(() => expect(window.location.search).not.toContain("f="));
    expect(FLOW_ROWS).toHaveLength(2);
  });
});
