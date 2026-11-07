import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { llmCalls, renderAiSettings, serveAiSettings } from "./support/ai-settings.tsx";
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
} from "./support/web-mocks.ts";

vi.mock("next/navigation", async () => {
  const m = await import("./support/web-mocks.ts");
  return { useRouter: () => m.router, usePathname: () => m.pathname.current };
});
vi.mock("../src/lib/auth-client.ts", async () => ({
  authClient: (await import("./support/web-mocks.ts")).authClient,
}));
vi.mock("../src/lib/orpc.ts", async () => ({
  orpc: (await import("./support/web-mocks.ts")).orpc,
}));

/**
 * Réglages de l'IA, accès (S-ai-settings §4.1) : propriétaires et administrateurs seulement. Un autre rôle, ou un
 * rôle encore inconnu, n'émet AUCUN appel `llmCredential.*` (même pas `list`) et ne voit ni champ ni bouton.
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  localStorage.clear();
  serveAiSettings("owner");
});

const RESTRICTED =
  "Cette page est réservée aux propriétaires et aux administrateurs. Demandez à l'un d'eux de configurer l'IA.";

describe("rôle connu et autorisé", () => {
  it.each(["owner", "admin"])(
    "%s : la carte « Anthropic » s'affiche et list est appelée",
    async (role) => {
      serveAiSettings(role);
      renderAiSettings();
      expect(await findNamed("heading", "Anthropic", { level: 2 })).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 2, name: "IA" })).toBeInTheDocument();
      expect(screen.getByTestId("ai-settings-page")).toBeInTheDocument();
      expect(procedures.llmCredentialList).toHaveBeenCalled();
      expect(screen.queryByText(RESTRICTED)).not.toBeInTheDocument();
    },
  );
});

describe("non-admin : vue refusée, zéro appel d'API", () => {
  it.each(["dev", "designer", "client", "business"])("%s", async (role) => {
    serveAiSettings(role);
    renderAiSettings();
    const note = await findNamed("heading", "IA", { level: 2 });
    expect(note).toBeInTheDocument();
    expect(await screen.findByText(RESTRICTED)).toBeInTheDocument();
    // Alerte neutre avec icône, jamais un champ, un bouton ou la carte du fournisseur.
    expect(
      screen.getByText(RESTRICTED).closest("[role=alert]")?.querySelector("svg[aria-hidden]"),
    ).not.toBeNull();
    expect(screen.queryByLabelText("Clé API Anthropic")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Anthropic" })).not.toBeInTheDocument();
    // Laisse passer les requêtes éventuelles avant de compter.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(llmCalls()).toBe(0);
  });
});

describe("rôle inconnu : chargement, aucun appel, aucun message de droits", () => {
  it("organization.list en attente : « Chargement… » (role=status), pas de list, pas de refus", async () => {
    procedures.organizationList.mockReturnValue(new Promise(() => undefined));
    renderAiSettings();
    const label = await screen.findByText("Chargement…");
    expect(label.closest("[role=status]")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText(RESTRICTED)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(llmCalls()).toBe(0);
  });

  it("organization.list en échec : toujours aucun appel llmCredential", async () => {
    procedures.organizationList.mockRejectedValue(apiError("INTERNAL"));
    renderAiSettings();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(llmCalls()).toBe(0);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});

describe("erreurs de list", () => {
  it("403 reçu : même message de refus en alerte, sans champ ni bouton de clé", async () => {
    procedures.llmCredentialList.mockRejectedValue(apiError("FORBIDDEN"));
    renderAiSettings();
    expect(await screen.findByText(RESTRICTED)).toBeInTheDocument();
    expect(screen.queryByLabelText("Clé API Anthropic")).not.toBeInTheDocument();
  });

  it("401 avec session perdue : redirection vers /login", async () => {
    procedures.llmCredentialList.mockRejectedValue(apiError("UNAUTHORIZED"));
    getSession.mockResolvedValue(NO_SESSION);
    renderAiSettings();
    await waitFor(() => expect(navigations()).toContain("/login"));
  });

  it("401 sans organisation active : /organizations, jamais /login", async () => {
    procedures.llmCredentialList.mockRejectedValue(apiError("UNAUTHORIZED"));
    getSession.mockResolvedValue(sessionWith(null));
    renderAiSettings();
    await waitFor(() => expect(navigations()).toContain("/organizations"));
    expect(navigations()).not.toContain("/login");
  });
});
