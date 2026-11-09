import type { ProjectOverview } from "@koklo/contract";
import { act, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OverviewPage } from "../src/components/overview-page.tsx";
import { CLIENT, FRAMING, IDEA, ITERATIONS, PROJECT_ID } from "./support/overview.tsx";
import { renderWithQuery } from "./support/render.tsx";
import { apiError, polyfillRadix, procedures, resetWebMocks } from "./support/web-mocks.ts";

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

/** TK-92, écran /projects/[projectId] : design/screens/S-overview.md §3 à §5. */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
});

const serve = (overview: ProjectOverview) => procedures.projectOverview.mockResolvedValue(overview);
const show = async (overview: ProjectOverview) => {
  serve(overview);
  renderWithQuery(<OverviewPage projectId={PROJECT_ID} />);
  await screen.findByRole("region", { name: "Phases du projet" });
};

describe("chargement et erreurs", () => {
  it("chargement : squelettes avec aria-busy, en-tête déjà là, un seul appel project.overview", async () => {
    procedures.projectOverview.mockReturnValue(new Promise(() => {}));
    renderWithQuery(<OverviewPage projectId={PROJECT_ID} />);
    expect(await screen.findByTestId("overview-skeleton")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("heading", { level: 1, name: "Vue d'ensemble" })).toBeVisible();
    expect(procedures.projectOverview).toHaveBeenCalledTimes(1);
    expect(procedures.projectOverview).toHaveBeenCalledWith({ projectId: PROJECT_ID });
  });

  it("erreur : InlineAlert « Impossible de charger la vue d'ensemble. » et Réessayer relance l'appel", async () => {
    procedures.projectOverview.mockRejectedValueOnce(apiError("INTERNAL"));
    renderWithQuery(<OverviewPage projectId={PROJECT_ID} />);
    expect(await screen.findByText("Impossible de charger la vue d'ensemble.")).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: "Vue d'ensemble" })).toBeVisible();
    serve(FRAMING);
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByRole("region", { name: "Phases du projet" })).toBeVisible();
  });

  it("projet introuvable : 404 uniforme, même écran que S-features", async () => {
    procedures.projectOverview.mockRejectedValue(apiError("NOT_FOUND"));
    renderWithQuery(<OverviewPage projectId={PROJECT_ID} />);
    expect(await screen.findByRole("heading", { name: "Projet introuvable" })).toBeVisible();
  });
});

describe("états du contenu", () => {
  it("projet neuf : phase Idée, étape, EmptyState du bloc principal", async () => {
    await show({
      ...IDEA,
      stats: [],
      nextAction: {
        rule: "start",
        tone: "warning",
        title: "Commencez le dossier d'idée",
        body: "Rien n'est encore écrit.",
        action: {
          label: "Ouvrir l'espace Idée",
          href: `/projects/${PROJECT_ID}/idea`,
          kind: "link",
        },
      },
      main: { kind: "idea", pages: [] },
      activity: {
        items: [
          {
            actor: { kind: "team", name: "Awa", initials: "AK" },
            text: "Le projet vient d'être créé.",
            at: "2026-11-09T08:00:00.000Z",
          },
        ],
        total: 1,
      },
    });
    expect(screen.getByText("Commencez le dossier d'idée")).toBeVisible();
    expect(screen.getByText("Le dossier d'idée est vide")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Indicateurs" })).toBeNull();
    expect(screen.getByText("Le projet vient d'être créé.")).toBeVisible();
  });

  it("rien n'attend d'action : carte neutre sans bouton", async () => {
    await show(ITERATIONS);
    const note = screen.getByRole("note", { name: "Prochaine étape" });
    expect(note).toHaveAttribute("data-tone", "neutral");
    expect(within(note).queryByRole("link")).toBeNull();
    expect(within(note).queryByRole("button")).toBeNull();
  });
});

describe("phases", () => {
  it("Cadrage : fil, sept cartes, un seul lien (le Fonctionnel), six « Bientôt disponible »", async () => {
    await show(FRAMING);
    const rail = screen.getByRole("list", { name: "Phase du projet" });
    expect(within(rail).getByText("Sous-titre framing")).toBeVisible();
    const grid = screen.getByRole("region", { name: "Livrables du cadrage" });
    expect(within(grid).getAllByRole("link")).toHaveLength(1);
    expect(within(grid).getAllByText("Bientôt disponible")).toHaveLength(6);
    expect(
      within(grid).getByRole("link", {
        name: /^Cahier fonctionnel\s*À valider\s*7 fonctionnalités\s*4 fonctionnalités validées sur 7\s*Validation client · obligatoire$/,
      }),
    ).toHaveAttribute("href", `/projects/${PROJECT_ID}/spec/functional`);
  });

  it("Cadrage : indicateurs du serveur, jauge à crans, zéro mesuré affiché", async () => {
    await show(FRAMING);
    const stats = screen.getByRole("region", { name: "Indicateurs" });
    expect(within(stats).getByText("2 sur 7")).toBeVisible();
    expect(within(stats).getByText("0")).toBeVisible();
    expect(stats.querySelectorAll("[data-slot=segmented-gauge] > span")).toHaveLength(7);
  });

  it("Idée : dossier d'idée en liste, lien « Ouvrir le dossier » et pied pour l'équipe", async () => {
    await show(IDEA);
    const list = screen.getByRole("region", { name: "Dossier d'idée" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).getByText("Stable")).toHaveAttribute("data-tone", "success");
    expect(within(list).getByRole("link", { name: /Ouvrir le dossier/ })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/idea`,
    );
    expect(within(list).getByText(/Les 5 éléments les plus urgents/)).toBeVisible();
  });

  it("Itérations : sprint, statuts de ticket, kanban ; sans sprint, EmptyState", async () => {
    await show(ITERATIONS);
    const list = screen.getByRole("region", { name: "Sprint SP-7 · Rendre la réservation fiable" });
    expect(within(list).getByText("En revue")).toBeVisible();
    expect(within(list).getByText("À faire")).toBeVisible();
    expect(within(list).getByRole("link", { name: /Ouvrir le kanban/ })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/tickets`,
    );
  });

  it("Itérations sans sprint : « Aucun sprint en cours »", async () => {
    await show({ ...ITERATIONS, main: { kind: "sprint", tickets: [] } });
    expect(screen.getByText("Aucun sprint en cours")).toBeVisible();
  });

  it("les phrases du serveur sont affichées telles quelles (aucune phrase assemblée à l'écran)", async () => {
    await show(FRAMING);
    expect(screen.getByText("Le cahier fonctionnel attend la validation de Marie")).toBeVisible();
    expect(screen.getByText("2 fonctionnalités en attente depuis 3 jours.")).toBeVisible();
    expect(screen.getByText("Marie a validé F-001 Réserver un créneau")).toBeVisible();
    expect(screen.getByText("il y a 5 minutes")).toBeVisible();
  });
});

describe("en-tête et colonne de droite", () => {
  it("équipe : résumé « Client : … · démarré le … », Inviter et action principale", async () => {
    await show(FRAMING);
    expect(screen.getByText("Client : Marie Lefèvre · démarré le 14 oct.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Inviter" })).toHaveAttribute(
      "href",
      "/settings/members",
    );
    expect(screen.getByRole("link", { name: "Continuer le cadrage" })).toBeVisible();
  });

  it("vue client : pas d'Inviter, pas de lien de la liste vers une route fermée", async () => {
    await show({ ...CLIENT, main: IDEA.main, phase: "idea", phaseSteps: IDEA.phaseSteps });
    expect(screen.queryByRole("link", { name: "Inviter" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Ouvrir le dossier/ })).toBeNull();
    expect(screen.getByText("Démarré le 14 oct.")).toBeVisible();
  });

  it("Activité : « Voir toute l'activité · N » ouvre la page d'activité ; Personnes : 5 et « et 2 autres personnes »", async () => {
    await show(FRAMING);
    const link = screen.getByRole("link", { name: /Voir toute l'activité/ });
    expect(link).toHaveTextContent("· 214");
    expect(link).toHaveAttribute("href", `/projects/${PROJECT_ID}/activity`);
    const people = screen.getByRole("region", { name: "Personnes" });
    expect(within(people).getByText("Client · valide le cadrage")).toBeVisible();
    expect(within(people).getByText("et 2 autres personnes")).toBeVisible();
  });
});

describe("Relancer et rafraîchissement", () => {
  const writeText = vi.fn();
  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  });

  it("« Relancer » copie un lien absolu et annonce « Lien copié »", async () => {
    await show(FRAMING);
    await userEvent.click(screen.getByRole("button", { name: "Relancer Marie" }));
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/projects/${PROJECT_ID}/spec/functional`,
    );
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Lien copié"));
  });

  it("« Relancer » : copie impossible, l'échec est annoncé", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    await show(FRAMING);
    await userEvent.click(screen.getByRole("button", { name: "Relancer Marie" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Impossible de copier le lien."),
    );
  });

  it("recharge au retour sur l'onglet, garde l'ancienne vue pendant le rechargement, jamais de sondage", async () => {
    await show(FRAMING);
    expect(procedures.projectOverview).toHaveBeenCalledTimes(1);
    procedures.projectOverview.mockReturnValue(new Promise(() => {}));
    act(() => {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(procedures.projectOverview).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("region", { name: "Livrables du cadrage" })).toBeVisible();
    expect(screen.queryByTestId("overview-skeleton")).toBeNull();
  });
});
