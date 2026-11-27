import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STEP_REPORT, STEPS_LINE, SUMMARY_LINE, serveLaunch } from "./support/launch.ts";
import { fake, serveProposals } from "./support/proposals.tsx";
import { renderSecurity, securityHeading, serveSecurity } from "./support/security.tsx";
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

const tabs = () => screen.getByRole("navigation", { name: "Sections de la sécurité" });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Page Sécurité : équipe", () => {
  it("en-tête : titre, statut, résumé, agent, « Nouvelle menace », « Valider » désactivé relié à la raison", async () => {
    serveSecurity("owner");
    renderSecurity();
    await securityHeading();
    expect(
      await screen.findByText("Validation de l'équipe · le client lit le résumé"),
    ).toBeVisible();
    const summary = await screen.findByText(/2 données à classer avant de valider/);
    expect(await screen.findByRole("button", { name: /Proposer avec l'agent/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "Nouvelle menace" })).toBeVisible();
    const validate = screen.getByRole("button", { name: "Valider" });
    expect(validate).toBeDisabled();
    expect(validate).toHaveAttribute("aria-describedby", summary.id);
  });

  it("six onglets avec leurs comptes", async () => {
    serveSecurity("owner");
    renderSecurity();
    await securityHeading();
    await waitFor(() =>
      expect(
        within(tabs())
          .getAllByRole("link")
          .map((link) => link.textContent),
      ).toEqual([
        "Menaces3",
        "Données sensibles3",
        "Droits",
        "Exigences5/7",
        "Résumé client",
        "Document",
      ]),
    );
  });

  it("sans blocage : « Valider » envoie la décision sur la tête et l'annonce", async () => {
    serveSecurity("owner", {
      threats: [],
      data: [],
      summary: true,
    });
    renderSecurity();
    await securityHeading();
    const validate = await screen.findByRole("button", { name: "Valider" });
    await waitFor(() => expect(validate).toBeEnabled());
    await userEvent.setup().click(validate);
    await waitFor(() =>
      expect(procedures.reviewSubmit.mock.calls[0]?.[0]).toMatchObject({
        targetKind: "deliverable",
        targetRef: "security",
        status: "approved",
      }),
    );
    expect(await screen.findByText("Sécurité validée")).toBeInTheDocument();
  });

  it("à revoir : bandeau d'alerte avec les éléments concernés et « Proposer les mises à jour »", async () => {
    serveSecurity("owner", {
      status: "revise",
      staleSecurity: { changes: [{ id: "ST-sms", change: "changed" }], items: ["SEC-T10"] },
    });
    renderSecurity();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Le cahier technique a changé depuis la validation");
    expect(alert).toHaveTextContent("ST-sms modifié");
    expect(alert).toHaveTextContent("Sont concernés : SEC-T10");
    expect(
      await within(alert).findByRole("button", { name: "Proposer les mises à jour" }),
    ).toBeVisible();
    expect(await screen.findByRole("button", { name: /SEC-T10 .* À revoir/ })).toBeVisible();
  });

  it("prêt : état vide avec « Proposer avec l'agent » et « Écrire à la main »", async () => {
    serveSecurity("owner", { threats: [], data: [], summary: false, status: "todo" });
    renderSecurity();
    expect(await screen.findByText("L'agent peut proposer le modèle de menaces")).toBeVisible();
    expect(screen.getByRole("button", { name: "Écrire à la main" })).toBeVisible();
    expect(screen.getByText("Le technique est validé")).toBeVisible();
  });

  it("designer : lecture sans écriture ni agent", async () => {
    serveSecurity("designer");
    renderSecurity();
    expect(await screen.findByRole("button", { name: /SEC-T08/ })).toBeVisible();
    for (const name of [/Proposer avec l'agent/, "Nouvelle menace", "Valider", "Modifier"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(procedures.proposalList).not.toHaveBeenCalled();
  });

  it("fenêtre de l'agent : sous-titre et choix de la maquette", async () => {
    serveSecurity("owner");
    procedures.aiProposeOptions.mockResolvedValue({
      options: [
        { id: "threats", count: 3, recommended: true },
        { id: "classify", count: 2, recommended: false },
        { id: "summary", recommended: false },
      ],
      reads: [{ id: "functional.features", label: "Fonctionnalités exposées" }],
      available: true,
    });
    renderSecurity();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Proposer avec l'agent/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Sécurité")).toBeVisible();
    expect(await within(dialog).findByText("Proposer les menaces")).toBeVisible();
    expect(within(dialog).getByText("3 surfaces à compléter")).toBeVisible();
    expect(within(dialog).getByText("2 champs")).toBeVisible();
    expect(within(dialog).getByText("Mettre à jour le résumé client")).toBeVisible();
  });

  it("génération : bandeau d'état et « Annuler l'attente »", async () => {
    serveSecurity("owner");
    procedures.proposalList.mockResolvedValue({
      items: [],
      nextCursor: null,
      previousCursor: null,
      offset: 0,
      total: 0,
      groups: [],
      launch: { id: "l1", status: "running", proposedCount: 0, discardedCount: 0 },
    });
    renderSecurity({ search: "view=review" });
    expect(await screen.findByText(/L'agent prépare la sécurité/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Annuler l'attente" })).toBeVisible();
  });

  it("onglet Document : sections du dossier et colonne Agent", async () => {
    serveSecurity("owner");
    renderSecurity({ search: "tab=doc" });
    expect(
      await screen.findByRole("heading", { level: 2, name: "Objet et périmètre" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Vérifier la cohérence avec les menaces" }),
    ).toBeVisible();
    expect(procedures.specDocumentSections).toHaveBeenCalledWith(
      expect.objectContaining({ deliverable: "security" }),
    );
  });

  it("erreur de lecture : titre et « Réessayer »", async () => {
    serveSecurity("owner");
    procedures.securityThreatList.mockRejectedValue(new Error("panne"));
    renderSecurity();
    expect(await screen.findByText("Impossible de charger la sécurité")).toBeVisible();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeVisible();
  });
});

const EMPTY_SECURITY = { threats: [], data: [], summary: false, status: "todo" as const };
const READY = "L'agent peut proposer le modèle de menaces";

describe("TK-115b : bilan du lancement de la Sécurité", () => {
  it("Prêt : le bilan au-dessus de l'état « Prêt »", async () => {
    serveSecurity("owner", EMPTY_SECURITY);
    serveLaunch(STEP_REPORT);
    renderSecurity();
    const line = await screen.findByText(SUMMARY_LINE);
    expect(screen.getByText(STEPS_LINE).closest('[role="note"]')).toContainElement(line);
    const ready = screen.getByText(READY);
    expect(line.compareDocumentPosition(ready) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("Prêt : pas de bilan quand aucune étape n'est écartée", async () => {
    serveSecurity("owner", EMPTY_SECURITY);
    serveLaunch({ ...STEP_REPORT, zonesDiscarded: 0, discardReasons: [] });
    renderSecurity();
    expect(await screen.findByText(READY)).toBeInTheDocument();
    expect(screen.queryByText(/Bilan du lancement/)).toBeNull();
  });

  it("Relecture : le bilan en note au-dessus des groupes", async () => {
    serveSecurity("owner");
    serveProposals([fake(1, { kind: "threat" as never, title: "Vol de session", content: {} })], {
      report: STEP_REPORT,
    });
    renderSecurity({ search: "view=review" });
    const note = (await screen.findByText(SUMMARY_LINE)).closest('[role="note"]');
    expect(note).toHaveTextContent(STEPS_LINE);
    const first = screen.getByRole("button", { name: /Vol de session/ });
    expect(
      (note as Node).compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("Génération : « Étapes traitées 4/9 · écartées 1 » sous le bandeau", async () => {
    serveSecurity("owner");
    serveLaunch({ ...STEP_REPORT, zonesRequested: 9, zonesDone: 3, zonesDiscarded: 1 }, "running");
    renderSecurity({ search: "view=review" });
    const detail = await screen.findByText("Étapes traitées 4/9 · écartées 1");
    expect(detail.closest('[role="status"]')).toHaveTextContent("L'agent prépare la sécurité");
  });
});
