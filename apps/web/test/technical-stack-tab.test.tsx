import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STEP_REPORT, STEPS_LINE, SUMMARY_LINE, serveLaunch } from "./support/launch.ts";
import {
  commitOnSubmit,
  NO_ENVIRONMENTS,
  renderTechnical,
  STACK,
  serveTechnical,
  stackChoice,
} from "./support/technical.tsx";
import {
  apiError,
  polyfillRadix,
  procedures,
  resetWebMocks,
  watchUrl,
} from "./support/web-mocks.ts";
import { DESKTOP, MOBILE, setViewport } from "./viewport.ts";

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
  setViewport(DESKTOP);
  resetWebMocks();
  polyfillRadix();
  watchUrl();
});

const fiche = () => screen.findByRole("complementary", { name: "Fiche du choix technique" });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Onglet Stack", () => {
  it("compte, couches dans l'ordre, cartes avec « Pour » et statut", async () => {
    serveTechnical("owner");
    renderTechnical();
    expect(await screen.findByText("3 choix")).toBeInTheDocument();
    expect(screen.getByText("· 1 à trancher")).toBeInTheDocument();
    expect(
      screen.getByText("Un choix par rôle de l'architecture · les produits ne sont nommés qu'ici"),
    ).toBeInTheDocument();
    const layers = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(layers.slice(0, 3)).toEqual([
      "Applications 1",
      "Services et API 1",
      "Services externes 1",
    ]);
    const web = screen.getByRole("button", { name: /Applications web/ });
    expect(web).toHaveTextContent("Pour C-portail, C-backoffice, C-admin");
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("par défaut le choix à trancher est ouvert : encadré, tableau, « Choisir »", async () => {
    serveTechnical("owner");
    renderTechnical();
    const aside = await fiche();
    expect(within(aside).getByRole("heading", { level: 2 })).toHaveTextContent("À trancher");
    expect(aside).toHaveTextContent(
      "Choix à faire avant la validation du cahier technique. L'agent a comparé trois options ; choisissez-en une ou demandez une autre comparaison.",
    );
    const table = within(aside).getByRole("table", { name: "Options comparées" });
    expect(within(table).getByRole("columnheader", { name: /Brevo/ })).toHaveTextContent(
      "Recommandé",
    );
    expect(within(aside).getByText("≈ : estimations à vérifier")).toBeInTheDocument();
    expect(within(aside).getByRole("button", { name: "Choisir Brevo" }).className).toContain(
      "bg-primary",
    );
    expect(within(aside).getByRole("button", { name: "Choisir Twilio" }).className).not.toContain(
      "bg-primary",
    );
    for (const label of ["Pour les composants", "Exigences visées", "Décisions"]) {
      expect(within(aside).getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: /Fournisseur SMS/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("choisir une carte l'écrit dans l'adresse et ouvre sa fiche (choisie)", async () => {
    serveTechnical("owner");
    renderTechnical();
    await userEvent.click(await screen.findByRole("button", { name: /Node\.js 22/ }));
    await waitFor(() => expect(window.location.search).toBe("?sel=ST-api"));
    const aside = await fiche();
    await waitFor(() =>
      expect(within(aside).getByRole("heading", { level: 2 })).toHaveTextContent("Node.js 22"),
    );
    expect(within(aside).queryByRole("button", { name: /^Choisir/ })).toBeNull();
    expect(within(aside).getByRole("button", { name: "Modifier" })).toBeVisible();
  });

  it("« Choisir <option> » : un seul appel, « Choix enregistré » annoncé", async () => {
    serveTechnical("owner");
    commitOnSubmit(procedures.specTechnicalStackChoose);
    renderTechnical();
    await userEvent.click(await screen.findByRole("button", { name: "Choisir Brevo" }));
    await waitFor(() => expect(procedures.specTechnicalStackChoose).toHaveBeenCalledTimes(1));
    expect(procedures.specTechnicalStackChoose.mock.calls[0]?.[0]).toMatchObject({
      id: "ST-sms",
      option: "Brevo",
      branch: "main",
    });
    await waitFor(() => expect(screen.getByText("Choix enregistré")).toBeInTheDocument(), {
      timeout: 5000,
    });
  });

  it("vue YAML : chemin, « Source de vérité », texte brut", async () => {
    serveTechnical("owner");
    renderTechnical();
    const aside = await fiche();
    await userEvent.click(within(aside).getByRole("button", { name: "YAML" }));
    expect(await within(aside).findByText("tech/stack/sms.yaml")).toBeInTheDocument();
    expect(within(aside).getByText("Source de vérité")).toBeInTheDocument();
    expect(within(aside).getByRole("region", { name: "YAML du choix" })).toHaveTextContent(
      "id: ST-sms",
    );
  });

  it("au-delà de 24 choix : recherche serveur, « Effacer la recherche » sans résultat", async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      stackChoice(`ST-r${i}`, { role: `Rôle ${i}` }),
    );
    serveTechnical("owner", { choices: many });
    renderTechnical();
    const search = await screen.findByRole("searchbox", { name: "Rechercher un choix technique" });
    await userEvent.type(search, "zzz");
    expect(await screen.findByText("Aucun choix ne correspond à « zzz »")).toBeInTheDocument();
    expect(procedures.specTechnicalStackList).toHaveBeenCalledWith(
      expect.objectContaining({ q: "zzz" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Effacer la recherche" }));
    expect(await screen.findByRole("button", { name: /Rôle 0 / })).toBeVisible();
  });

  it("lien direct ?sel= : demandé au serveur avec around", async () => {
    serveTechnical("owner", { choices: STACK });
    renderTechnical({ search: "sel=ST-api" });
    await fiche();
    expect(procedures.specTechnicalStackList).toHaveBeenCalledWith(
      expect.objectContaining({ around: "ST-api" }),
    );
  });

  it("sur téléphone : aucune carte pressée tant que rien n'est ouvert, puis la fiche et « Liste »", async () => {
    setViewport(MOBILE);
    serveTechnical("owner");
    renderTechnical();
    const card = await screen.findByRole("button", { name: /Fournisseur SMS/ });
    expect(card).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("complementary")).toBeNull();
    await userEvent.click(card);
    await fiche();
    await userEvent.click(screen.getByRole("button", { name: "Liste" }));
    expect(await screen.findByRole("button", { name: /Fournisseur SMS/ })).toBeVisible();
    setViewport(DESKTOP);
  });

  it("erreur de lecture : message et « Réessayer »", async () => {
    serveTechnical("owner");
    procedures.specTechnicalStackList.mockRejectedValue(apiError("INTERNAL_SERVER_ERROR"));
    renderTechnical();
    expect(
      await screen.findByText("Impossible de charger le cahier technique"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeVisible();
  });
});

const EMPTY_TITLE = "Aucun choix technique pour l'instant";
const bilan = () => screen.queryByText(SUMMARY_LINE);
/** Le faux serveur n'a rien à relire : seul le bilan du dernier lancement reste. */
function serveNoStack(role: "owner" | "designer" = "owner", report?: Record<string, unknown>) {
  serveTechnical(role, { choices: [] });
  serveLaunch(report ?? STEP_REPORT);
}
const settled = () =>
  waitFor(() => expect(procedures.proposalList.mock.results.length).toBeGreaterThan(0));

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("TK-115b : Stack sans choix et étapes écartées", () => {
  it("barre « 0 choix · aucun pour l'instant », jamais « tous tranchés »", async () => {
    serveTechnical("owner", { choices: [] });
    renderTechnical();
    expect(await screen.findByText("· aucun pour l'instant")).toBeInTheDocument();
    expect(screen.getByText("0 choix")).toBeInTheDocument();
    expect(screen.queryByText("· tous tranchés")).toBeNull();
  });

  it("bilan en note entre la barre de compte et l'état vide", async () => {
    serveNoStack();
    renderTechnical();
    const note = (await screen.findByText(SUMMARY_LINE)).closest('[role="note"]');
    expect(note).toHaveTextContent(STEPS_LINE);
    expect(note).toHaveAttribute("data-variant", "neutral");
    const before = Node.DOCUMENT_POSITION_PRECEDING;
    const after = Node.DOCUMENT_POSITION_FOLLOWING;
    const position = (text: string) =>
      (note as Node).compareDocumentPosition(screen.getByText(text));
    expect(position("· aucun pour l'instant") & before).toBeTruthy();
    expect(position(EMPTY_TITLE) & after).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    ["aucune étape écartée", { ...STEP_REPORT, zonesDiscarded: 0, discardReasons: [] }, "done"],
    ["lancement actif", STEP_REPORT, "running"],
  ])("pas de bilan : %s", async (_name, report, status) => {
    serveTechnical("owner", { choices: [] });
    serveLaunch(report, status);
    renderTechnical();
    expect(await screen.findByText(EMPTY_TITLE)).toBeInTheDocument();
    await settled();
    expect(screen.queryByText(/Bilan du lancement/)).toBeNull();
  });

  it("pas de bilan pour le designer, qui ne propose pas", async () => {
    serveNoStack("designer");
    renderTechnical();
    expect(await screen.findByText(EMPTY_TITLE)).toBeInTheDocument();
    expect(bilan()).toBeNull();
  });

  it("pas de bilan sur une recherche sans résultat", async () => {
    serveNoStack();
    renderTechnical({ search: "q=zzz" });
    expect(await screen.findByText("Aucun choix ne correspond à « zzz »")).toBeInTheDocument();
    await settled();
    expect(bilan()).toBeNull();
  });

  it("Prêt : le bilan au-dessus de « L'agent peut proposer le cahier technique »", async () => {
    serveTechnical("owner", {
      choices: [],
      environments: NO_ENVIRONMENTS,
      sections: [],
      counts: { endpoints: 0, nfr: 0 },
    });
    serveLaunch(STEP_REPORT);
    renderTechnical();
    const line = await screen.findByText(SUMMARY_LINE);
    const ready = screen.getByText("L'agent peut proposer le cahier technique");
    expect(line.compareDocumentPosition(ready) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(STEPS_LINE)).toBeInTheDocument();
  });
});
