import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADD_BUTTON,
  allCalls,
  button,
  openProviders,
  pageText,
  RESTRICTED,
  renderAiSettings,
  serveProviders,
} from "./support/ai-providers.tsx";
import { findNamed } from "./support/wait.ts";
import { apiError, polyfillRadix, procedures, resetWebMocks } from "./support/web-mocks.ts";

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

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  localStorage.clear();
  serveProviders("owner");
});

/**
 * Fournisseurs d'IA, accès (S-ai-settings §1, §4) : propriétaires et administrateurs seulement. Tout autre rôle,
 * un rôle inconnu ou un 403 reçu : message de refus, AUCUN appel `aiProvider.*`, `aiModel.*`, `aiUsage.*`, `aiSettings.*`.
 */
describe("rôle autorisé", () => {
  it.each(["owner", "admin"])("%s : h2 « Fournisseurs d'IA » et lectures émises", async (role) => {
    serveProviders(role);
    renderAiSettings();
    expect(await findNamed("heading", "Fournisseurs", { level: 3 })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Fournisseurs d'IA" }),
    ).toBeInTheDocument();
    expect(procedures.aiProviderList).toHaveBeenCalled();
    expect(screen.queryByText(RESTRICTED)).not.toBeInTheDocument();
  });
});

describe("non-gestionnaire : vue refusée, zéro appel", () => {
  it.each(["dev", "designer", "client", "business"])("%s", async (role) => {
    serveProviders(role);
    renderAiSettings();
    expect(await screen.findByText(RESTRICTED)).toBeInTheDocument();
    expect(
      screen.getByText(RESTRICTED).closest("[role=alert]")?.querySelector("svg[aria-hidden]"),
    ).not.toBeNull();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(allCalls()).toBe(0);
  });
});

describe("rôle inconnu", () => {
  it("organization.list en attente : chargement (role=status), aucun appel, aucun refus", async () => {
    procedures.organizationList.mockReturnValue(new Promise(() => undefined));
    renderAiSettings();
    expect(await screen.findByRole("status")).toHaveTextContent("Chargement…");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(allCalls()).toBe(0);
    expect(screen.queryByText(RESTRICTED)).not.toBeInTheDocument();
  });
});

describe("403 reçu (le rôle a changé entre-temps)", () => {
  it("aiProvider.list refusée : message de refus, plus aucun champ ni bouton", async () => {
    procedures.aiProviderList.mockRejectedValue(apiError("FORBIDDEN"));
    renderAiSettings();
    expect(await screen.findByText(RESTRICTED)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: ADD_BUTTON })).not.toBeInTheDocument();
  });
});

describe("chargement et erreur", () => {
  it("chargement : role=status avec libellé", async () => {
    procedures.aiProviderList.mockReturnValue(new Promise(() => undefined));
    renderAiSettings();
    expect(await screen.findByText("Chargement des fournisseurs d'IA…")).toBeInTheDocument();
  });
  it("erreur : message générique et Réessayer relance la lecture", async () => {
    procedures.aiProviderList.mockRejectedValueOnce(apiError("INTERNAL"));
    renderAiSettings();
    expect(
      await screen.findByText("Impossible de charger les fournisseurs d'IA"),
    ).toBeInTheDocument();
    await userEvent.click(button("Réessayer"));
    expect(await findNamed("heading", "Fournisseurs", { level: 3 })).toBeInTheDocument();
  });
  it("aucun fournisseur : message, formulaire d'ajout ouvert", async () => {
    await openProviders([]);
    expect(pageText()).toContain("Aucun fournisseur configuré. L'IA est indisponible.");
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
  });
});
