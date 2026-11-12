import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clickSave,
  fillMinimum,
  openCreate,
  openEdit,
  operationOf,
  serveWrite,
  setText,
  submitInputs,
} from "./support/feature-form.tsx";
import { DETAIL } from "./support/features.tsx";
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

/** TK-105 (B366) : champ « Zone » du formulaire d'une fonctionnalité, texte libre facultatif de 80 caractères au plus. */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
  serveWrite();
});

describe("Formulaire : champ Zone", () => {
  it("création : facultatif, vide par défaut, absent de l'opération tant qu'il est vide", async () => {
    const panel = await openCreate();
    expect(panel.getByRole("textbox", { name: /^Zone/ })).toHaveValue("");
    await fillMinimum(panel);
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(operationOf()).not.toHaveProperty("zone");
  });

  it("création : la zone saisie est envoyée sans espaces autour", async () => {
    const panel = await openCreate();
    await fillMinimum(panel);
    await setText(panel.getByRole("textbox", { name: /^Zone/ }), "  Paiement ");
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(operationOf()).toMatchObject({ kind: "feature.create", zone: "Paiement" });
  });

  it("modification : préremplie avec la zone de la fonctionnalité, envoyée quand elle change", async () => {
    procedures.specGetFeature.mockResolvedValue({ ...DETAIL, zone: "Réservation" });
    const panel = await openEdit();
    const field = await panel.findByRole("textbox", { name: /^Zone/ });
    expect(field).toHaveValue("Réservation");
    await setText(field, "Clients");
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(operationOf()).toMatchObject({ kind: "feature.update", zone: "Clients" });
  });

  it("plus de 80 caractères : erreur liée au champ par aria-describedby, rien n'est envoyé", async () => {
    const panel = await openCreate();
    await fillMinimum(panel);
    const field = panel.getByRole("textbox", { name: /^Zone/ });
    await setText(field, "z".repeat(81));
    await clickSave(panel);
    const message = "La zone ne doit pas dépasser 80 caractères.";
    await waitFor(() =>
      expect(field).toHaveAccessibleDescription(expect.stringContaining(message)),
    );
    expect(field).toBeInvalid();
    expect(submitInputs()).toHaveLength(0);
  });
});
