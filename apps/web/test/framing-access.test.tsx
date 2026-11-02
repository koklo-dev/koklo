import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLIENT_SIDE, head, PROJECT_ID, renderFeatures, serve, TEAM } from "./support/features.tsx";
import {
  aiCallCount,
  openFraming,
  renderFraming,
  serveFraming,
  submits,
} from "./support/framing.tsx";
import { findNamed } from "./support/wait.ts";
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
 * TK-59 / 59a, accès (S-framing §1, §2, §4.12, AC « rôles ») : l'équipe qui écrit voit « Cadrer avec l'IA »,
 * client et business n'ont ni bouton ni formulaire et n'émettent AUCUN appel `ai.*` ni `specBatch.submit`.
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
  serveFraming();
});

const FRAME_BUTTON = "Cadrer avec l'IA";

describe("Bouton « Cadrer avec l'IA » sur la liste des fonctionnalités (S-features v1.5)", () => {
  it.each(TEAM)("%s voit le bouton, qui mène à /projects/<id>/framing", async (role) => {
    serve(role);
    renderFeatures();
    const link = await findNamed("link", FRAME_BUTTON);
    expect(link).toHaveAttribute("href", `/projects/${PROJECT_ID}/framing`);
  });

  it.each(CLIENT_SIDE)("%s ne voit aucun bouton « Cadrer avec l'IA »", async (role) => {
    serve(role);
    renderFeatures();
    await findNamed("table", /^Fonctionnalités du projet/, { text: "Connexion par e-mail" });
    expect(screen.queryByText(FRAME_BUTTON)).not.toBeInTheDocument();
    expect(aiCallCount()).toBe(0);
  });

  it("le bouton est aussi dans l'état vide, pour l'équipe", async () => {
    procedures.specHead.mockResolvedValue(
      head({ counts: { features: 0, tables: 0, endpoints: 0 } }),
    );
    procedures.specListFeatures.mockResolvedValue({ items: [], nextCursor: null });
    renderFeatures();
    await findNamed("heading", "Aucune fonctionnalité pour le moment");
    expect(screen.getAllByRole("link", { name: FRAME_BUTTON }).length).toBeGreaterThanOrEqual(1);
  });

  it("pas de bouton quand la spec n'est pas lue (en préparation)", async () => {
    procedures.specHead.mockResolvedValue(head({ status: "building" }));
    renderFeatures();
    await findNamed("heading", "Fonctionnalités", { level: 1 });
    expect(screen.queryByText(FRAME_BUTTON)).not.toBeInTheDocument();
  });
});

describe("Adresse directe pour client et business (§4.12)", () => {
  it.each(CLIENT_SIDE)(
    "%s : page sobre, aucun formulaire, zéro appel ai.* et specBatch.submit",
    async (role) => {
      serveFraming(role);
      renderFraming();
      expect(
        await findNamed("heading", "Le cadrage assisté n'est pas disponible pour votre rôle."),
      ).toBeVisible();
      expect(
        screen.getByRole("link", { name: "Voir les fonctionnalités du projet" }),
      ).toHaveAttribute("href", `/projects/${PROJECT_ID}/features`);
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /IA|Générer|Proposer/ })).not.toBeInTheDocument();
      expect(aiCallCount()).toBe(0);
      expect(submits()).toHaveLength(0);
    },
  );

  it("un rôle inconnu est traité comme sans droit", async () => {
    serveFraming("owner");
    const { asRole } = await import("./support/github-fixtures.ts");
    asRole("auditeur");
    renderFraming();
    expect(
      await findNamed("heading", "Le cadrage assisté n'est pas disponible pour votre rôle."),
    ).toBeVisible();
    expect(aiCallCount()).toBe(0);
  });

  it.each(TEAM)("%s : l'écran de cadrage est utilisable", async (role) => {
    serveFraming(role);
    await openFraming();
    expect(screen.getByRole("button", { name: "Générer un brief avec l'IA" })).toBeVisible();
    expect(aiCallCount()).toBe(0);
  });
});

describe("Projet et session (§4.12)", () => {
  it("projet introuvable : même état que les fonctionnalités, sans formulaire ni appel ai.*", async () => {
    procedures.projectList.mockResolvedValue([]);
    procedures.specHead.mockRejectedValue(apiError("NOT_FOUND"));
    renderFraming();
    expect(await findNamed("heading", "Projet introuvable")).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(aiCallCount()).toBe(0);
  });

  it("un projectId qui n'est pas un uuid : « Projet introuvable » sans aucune requête", async () => {
    renderFraming("pas-un-uuid");
    expect(await findNamed("heading", "Projet introuvable")).toBeVisible();
    expect(procedures.specHead).not.toHaveBeenCalled();
    expect(aiCallCount()).toBe(0);
  });

  it("UNAUTHORIZED sans session : redirection vers /login, rien d'affiché", async () => {
    procedures.specHead.mockRejectedValue(apiError("UNAUTHORIZED"));
    getSession.mockResolvedValue(NO_SESSION);
    renderFraming();
    await waitFor(() => expect(navigations()).toContain("/login"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("session sans organisation active : /organizations, jamais /login", async () => {
    procedures.specHead.mockRejectedValue(apiError("UNAUTHORIZED"));
    getSession.mockResolvedValue(sessionWith(null));
    renderFraming();
    await waitFor(() => expect(navigations()).toContain("/organizations"));
    expect(navigations()).not.toContain("/login");
  });
});
