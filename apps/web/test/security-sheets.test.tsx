import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commitOnSubmit, renderSecurity, serveSecurity } from "./support/security.tsx";
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

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("feuilles Menace et Donnée", () => {
  it("nouvelle menace : champs de la maquette, erreurs puis création", async () => {
    serveSecurity("owner");
    commitOnSubmit(procedures.specBatchSubmit);
    renderSecurity({ search: "new=1" });
    const sheet = await screen.findByRole("dialog", { name: "Nouvelle menace" });
    expect(
      within(sheet).getByText("Sécurité · identifiant attribué à l'enregistrement"),
    ).toBeVisible();
    expect(
      within(sheet).getByText(/Une menace élevée sans parade bloque la validation/),
    ).toBeVisible();
    const user = userEvent.setup();
    await user.click(within(sheet).getByRole("button", { name: "Enregistrer dans la spec" }));
    expect(await within(sheet).findByText(/7 points à corriger/)).toBeVisible();
    await user.type(within(sheet).getByRole("textbox", { name: /^Titre/ }), "Créneaux bloqués");
    await user.click(within(sheet).getByRole("radio", { name: "Abus" }));
    await user.click(within(sheet).getByRole("radio", { name: "Moyenne" }));
    await user.type(
      within(sheet).getByRole("combobox", { name: /Fonctionnalités exposées/ }),
      "F-004{Enter}",
    );
    await user.type(
      within(sheet).getByRole("textbox", { name: /^Ce qui peut arriver/ }),
      "Un script.",
    );
    await user.type(within(sheet).getByRole("textbox", { name: /^Parades/ }), "Code SMS.");
    await user.click(within(sheet).getByRole("radio", { name: "Scénario d'abus (généré)" }));
    await user.click(within(sheet).getByRole("button", { name: "Enregistrer dans la spec" }));
    await waitFor(() =>
      expect(procedures.specBatchSubmit.mock.calls[0]?.[0]).toMatchObject({
        operations: [{ kind: "threat.create", title: "Créneaux bloqués", surfaces: ["F-004"] }],
      }),
    );
  });

  it("modification : valeurs lues, seuls les changements envoyés, suppression proposée", async () => {
    serveSecurity("owner");
    commitOnSubmit(procedures.specBatchSubmit);
    renderSecurity({ search: "edit=SEC-T01" });
    expect(await screen.findByDisplayValue("Lien de connexion intercepté")).toBeVisible();
    const sheet = screen.getByRole("dialog", { name: "Modifier la menace" });
    expect(within(sheet).getByRole("button", { name: "Supprimer" })).toBeVisible();
    const user = userEvent.setup();
    await user.click(within(sheet).getByRole("radio", { name: "Faible" }));
    await user.click(within(sheet).getByRole("button", { name: "Enregistrer les modifications" }));
    await waitFor(() =>
      expect(procedures.specBatchSubmit.mock.calls[0]?.[0]).toMatchObject({
        operations: [{ kind: "threat.update", specId: "SEC-T01", severity: "low" }],
      }),
    );
  });

  it("donnée préremplie : la conservation reste vide, la suggestion est une aide (A7)", async () => {
    serveSecurity("owner");
    procedures.aiPrefillItem.mockResolvedValue({
      type: "sensitive",
      values: {
        field: "reservations.photo",
        data: "Photo",
        category: "personal",
        access: ["Gérante"],
        retentionSuggestion: "6 mois après le rendez-vous",
      },
    });
    renderSecurity({ search: "tab=data&new=1" });
    const sheet = await screen.findByRole("dialog", { name: "Nouvelle donnée" });
    const user = userEvent.setup();
    await user.type(
      within(sheet).getByRole("textbox", { name: "Description pour l'agent" }),
      "une photo",
    );
    await user.click(within(sheet).getByRole("button", { name: "Préremplir" }));
    expect(await within(sheet).findByDisplayValue("reservations.photo")).toBeVisible();
    expect(within(sheet).getByRole("textbox", { name: /^Conservation/ })).toHaveValue("");
    expect(
      within(sheet).getByText("Proposée par l'agent : 6 mois après le rendez-vous"),
    ).toBeVisible();
    expect(procedures.aiPrefillItem.mock.calls[0]?.[0]).toMatchObject({ type: "sensitive" });
  });

  it("décider une entrée sans durée : conservation au focus puis mise à jour", async () => {
    serveSecurity("owner");
    commitOnSubmit(procedures.specBatchSubmit);
    renderSecurity({ search: "tab=data" });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Décider : reservations.note" }));
    const sheet = await screen.findByRole("dialog", { name: "Modifier la donnée" });
    const retention = await within(sheet).findByRole("textbox", { name: /^Conservation/ });
    await waitFor(() => expect(retention).toHaveFocus());
    await user.type(retention, "1 an");
    await user.click(within(sheet).getByRole("button", { name: "Enregistrer les modifications" }));
    await waitFor(() =>
      expect(procedures.specBatchSubmit.mock.calls[0]?.[0]).toMatchObject({
        operations: [{ kind: "sensitive.update", specId: "reservations.note", retention: "1 an" }],
      }),
    );
  });
});
