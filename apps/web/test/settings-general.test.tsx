import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeneralPage } from "../src/components/general-page.tsx";
import { renderWithQuery } from "./support/render.tsx";
import { apiError, orgSummary, procedures, resetWebMocks } from "./support/web-mocks.ts";

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

/** TK-97 lot B : Général (S-settings §3) — org.get, org.update, trois chiffres sans coût ni nom de fournisseur. */
beforeEach(() => {
  resetWebMocks();
});

const nameField = () => screen.findByRole("textbox", { name: "Nom de l'organisation" });
const slugField = () => screen.getByRole("textbox", { name: "Adresse" });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Général", () => {
  it("affiche le nom, l'adresse et les initiales", async () => {
    renderWithQuery(<GeneralPage />);
    expect(await nameField()).toHaveValue("Atelier Lumière");
    expect(slugField()).toHaveValue("atelier-lumiere");
    expect(screen.getByRole("heading", { level: 2, name: "Organisation" })).toBeInTheDocument();
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("trois chiffres : projets, membres, fournisseurs d'IA (nombre de clés, sans nom ni coût)", async () => {
    procedures.orgGet.mockResolvedValue(
      orgSummary({ projectCount: 4, memberCount: 9, aiProviderCount: 2 }),
    );
    renderWithQuery(<GeneralPage />);
    await nameField();
    const figures = screen.getByRole("list", { name: "Chiffres de l'organisation" });
    expect(figures).toHaveTextContent("Projets4");
    expect(figures).toHaveTextContent("Membres9");
    expect(figures).toHaveTextContent("Fournisseurs d'IA2");
    expect(figures).not.toHaveTextContent(/anthropic|claude|€|\$/i);
  });

  it("chargement annoncé, puis erreur avec Réessayer", async () => {
    procedures.orgGet.mockRejectedValueOnce(apiError("INTERNAL"));
    renderWithQuery(<GeneralPage />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Réessayer" }));
    expect(await nameField()).toHaveValue("Atelier Lumière");
  });

  it("Enregistrer envoie le nom et l'adresse, puis confirme dans une région d'état", async () => {
    procedures.orgUpdate.mockResolvedValue({
      id: "i",
      name: "Studio Nord",
      slug: "studio-nord",
    });
    renderWithQuery(<GeneralPage />);
    const name = await nameField();
    await userEvent.clear(name);
    await userEvent.type(name, "Studio Nord");
    await userEvent.clear(slugField());
    await userEvent.type(slugField(), "studio-nord");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(procedures.orgUpdate.mock.calls[0]?.[0]).toEqual({
        name: "Studio Nord",
        slug: "studio-nord",
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Modifications enregistrées");
  });

  it("adresse déjà prise : message dédié sur le champ, focus dessus", async () => {
    procedures.orgUpdate.mockRejectedValue(apiError("CONFLICT", { reason: "slug_taken" }));
    renderWithQuery(<GeneralPage />);
    await nameField();
    await userEvent.clear(slugField());
    await userEvent.type(slugField(), "pris");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByText("Cette adresse est déjà utilisée.")).toBeInTheDocument();
    expect(slugField()).toHaveAttribute("aria-invalid", "true");
    expect(slugField()).toHaveFocus();
  });

  it("adresse invalide : refusée avant l'appel", async () => {
    renderWithQuery(<GeneralPage />);
    await nameField();
    await userEvent.clear(slugField());
    await userEvent.type(slugField(), "Mauvaise Adresse");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(
      await screen.findByText("Utilisez 2 à 48 lettres minuscules, chiffres ou tirets."),
    ).toBeInTheDocument();
    expect(procedures.orgUpdate).not.toHaveBeenCalled();
  });

  it("nom vide : refusé avant l'appel", async () => {
    renderWithQuery(<GeneralPage />);
    await userEvent.clear(await nameField());
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByText("Saisissez le nom de l'organisation.")).toBeInTheDocument();
    expect(procedures.orgUpdate).not.toHaveBeenCalled();
  });

  it("échec serveur : alerte destructive, saisie conservée", async () => {
    procedures.orgUpdate.mockRejectedValue(apiError("INTERNAL"));
    renderWithQuery(<GeneralPage />);
    await nameField();
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Impossible d'enregistrer");
    expect(slugField()).toHaveValue("atelier-lumiere");
  });
});
