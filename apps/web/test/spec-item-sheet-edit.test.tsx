import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  askDelete,
  clickSave,
  openCreate,
  openEdit,
  serveWrite,
  submitInputs,
} from "./support/feature-form.tsx";
import { PROJECT_ID, renderFeatures } from "./support/features.tsx";
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

/** TK-101 lot B, cas 3 (fiche §3) : panneau d'édition, droits, livrable validé, erreurs, suppression, liens. */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
  serveWrite();
});

const item =
  (over: Record<string, unknown> = {}) =>
  async (input: unknown) => {
    const { id } = input as { id: string };
    const values = await procedures.specGetFeature({ projectId: PROJECT_ID, specId: id });
    return {
      type: "feature",
      id,
      values,
      validated: false,
      referencedBy: { items: [], total: 0 },
      ...over,
    };
  };

describe.each(["client", "business"] as const)("%s : aucun accès au panneau", (role) => {
  it("aucun bouton, ?new=1 ignoré, aucun appel de préremplissage ni de lecture d'édition", async () => {
    serveWrite(role);
    renderFeatures({ search: "?new=1" });
    await screen.findByText("Connexion par e-mail", undefined, { timeout: 8_000 });
    expect(screen.queryByRole("button", { name: "Nouvelle fonctionnalité" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(procedures.aiPrefillItem).not.toHaveBeenCalled();
    expect(procedures.specItemGet).not.toHaveBeenCalled();
  });
});

describe("Modification", () => {
  it("livrable validé : l'avertissement de la maquette est en tête ; sinon rien", async () => {
    procedures.specItemGet.mockImplementation(item({ validated: true }));
    const panel = await openEdit();
    expect(
      panel.getByText(/Ce livrable est validé : enregistrer cette modification annule/),
    ).toBeVisible();
  });

  it("livrable non validé : pas d'avertissement", async () => {
    const panel = await openEdit();
    expect(panel.queryByText(/Ce livrable est validé/)).toBeNull();
    expect(panel.getByRole("button", { name: "Enregistrer les modifications" })).toBeVisible();
  });

  it("suppression : la confirmation liste ce qui renvoie à l'élément", async () => {
    procedures.specItemGet.mockImplementation(
      item({
        referencedBy: {
          items: [
            { kind: "rule", specId: "R-004", title: "Annulation tardive" },
            { kind: "flow", specId: "P-annuler", title: "Annuler ou déplacer" },
          ],
          total: 5,
        },
      }),
    );
    const panel = await openEdit();
    const confirmation = await askDelete(panel);
    expect(confirmation.getByText("R-004")).toBeVisible();
    expect(confirmation.getByText(/« Annuler ou déplacer »/)).toBeVisible();
    expect(confirmation.getByText("et 3 autres")).toBeVisible();
    expect(submitInputs()).toHaveLength(0);
  });
});

describe("Création : erreurs et liens", () => {
  it("enregistrer à vide : résumé en alerte, champs en erreur, aucun envoi", async () => {
    const panel = await openCreate();
    await clickSave(panel);
    expect((await panel.findAllByRole("alert"))[0]).toHaveTextContent(
      "2 champs obligatoires sont vides : Titre, Priorité.",
    );
    expect(panel.getByRole("textbox", { name: /^Titre\s*obligatoire$/ })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(panel.getByRole("radiogroup", { name: /^Priorité/ })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(submitInputs()).toHaveLength(0);
  });

  it("lien F- refusé avec le message des préfixes, aucune puce ajoutée", async () => {
    const panel = await openCreate();
    await userEvent.type(panel.getByRole("combobox", { name: "Liens : ajouter" }), "F-003{Enter}");
    expect(await panel.findByText(/n'est pas un lien d'une fonctionnalité/)).toBeVisible();
    expect(panel.queryByRole("button", { name: "Retirer F-003" })).toBeNull();
  });

  it("autocomplétion : une seule recherche, 200 ms après la dernière frappe", async () => {
    procedures.specRefsSearch.mockResolvedValue({
      items: [{ kind: "rule", specId: "R-087", title: "Acompte" }],
    });
    const panel = await openCreate();
    const input = panel.getByRole("combobox", { name: "Liens : ajouter" });
    const typed = Date.now();
    await userEvent.type(input, "R-08");
    expect(procedures.specRefsSearch).not.toHaveBeenCalled();
    await waitFor(() => expect(procedures.specRefsSearch).toHaveBeenCalledTimes(1), {
      timeout: 3_000,
    });
    expect(Date.now() - typed).toBeGreaterThanOrEqual(200);
    expect(procedures.specRefsSearch).toHaveBeenCalledWith(
      expect.objectContaining({ q: "R-08", kinds: expect.arrayContaining(["rule", "screen"]) }),
    );
    await userEvent.click(
      await within(panel.getByRole("listbox")).findByRole("option", { name: /R-087/ }),
    );
    expect(panel.getByRole("button", { name: "Retirer R-087" })).toBeVisible();
  });
});
