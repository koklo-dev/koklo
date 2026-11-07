import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADD_BUTTON,
  button,
  openAddForm,
  openProviders,
  PRIMARY,
  SECOND,
  serveProviders,
} from "./support/ai-providers.tsx";
import { polyfillRadix, resetWebMocks } from "./support/web-mocks.ts";

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

/** Hiérarchie visuelle de la maquette 24 : sections en cartes, ajout primaire en tête, pastilles, grille d'ajout. */
describe("structure de l'écran (maquette 24)", () => {
  it("Fournisseurs, Modèle par usage, À quoi servent ces clés et Consommation sont des cartes nommées", async () => {
    await openProviders([PRIMARY, SECOND]);
    for (const name of [
      /^Fournisseurs$/,
      /^Modèle par usage$/,
      /^À quoi servent/,
      /^Consommation/,
    ]) {
      expect(await screen.findByRole("region", { name })).toBeInTheDocument();
    }
  });
  it("« Ajouter un fournisseur » est dans l'en-tête de la carte Fournisseurs, avant les lignes", async () => {
    await openProviders([PRIMARY, SECOND]);
    const card = screen.getByRole("region", { name: /^Fournisseurs$/ });
    const add = within(card).getByRole("button", { name: ADD_BUTTON });
    const list = within(card).getAllByRole("listitem")[0] as HTMLElement;
    expect(add.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("la ligne porte une pastille d'état « Vérifiée » avec la pastille de rôle", async () => {
    await openProviders([PRIMARY, SECOND]);
    const line = screen.getByRole("listitem", { name: /Anthropic, principal, vérifiée/ });
    expect(within(line).getByText("Vérifiée")).toBeInTheDocument();
    expect(within(line).getByText("Principal")).toBeInTheDocument();
  });
  it("l'interrupteur de secours est le pied de la carte Modèle par usage", async () => {
    await openProviders([PRIMARY, SECOND]);
    const card = screen.getByRole("region", { name: /^Modèle par usage$/ });
    expect(await within(card).findByRole("switch")).toBeInTheDocument();
  });
  it("l'ajout ouvert propose « Choisir un fournisseur », des cartes avec description et « Clé <nom> »", async () => {
    await openProviders([PRIMARY]);
    await openAddForm();
    expect(screen.getByText("Choisir un fournisseur")).toBeInTheDocument();
    expect(screen.getByText(/Tout point d'accès au format OpenAI/)).toBeInTheDocument();
    button(ADD_BUTTON);
  });
});
