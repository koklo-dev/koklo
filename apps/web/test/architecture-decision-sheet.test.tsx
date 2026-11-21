import { specBatchSubmitInputSchema } from "@koklo/contract";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderArchitecture, serveArchitecture } from "./support/architecture.tsx";
import { batch, lastSubmit, submitInputs } from "./support/feature-form.tsx";
import { findRole } from "./support/wait.ts";
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
/** TK-113 lot B, cas 3 : formulaire Décision dans `SpecItemSheet` (maquette 13 l.956-958, B586). */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  serveArchitecture("owner");
  const created = batch({ results: [{ position: 0, kind: "adr.create", specId: "ADR-004" }] });
  procedures.specBatchSubmit.mockResolvedValue(created);
  procedures.specBatchGet.mockResolvedValue(created);
});

const save = (dialog: ReturnType<typeof within>, name = "Enregistrer dans la spec") =>
  userEvent.click(dialog.getByRole("button", { name }));

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Formulaire Décision", () => {
  it("« Nouvelle décision » ouvre la feuille : champs de la maquette, aucun bouton de l'agent", async () => {
    renderArchitecture({ search: "tab=decisions" });
    await userEvent.click(await screen.findByRole("button", { name: "Nouvelle décision" }));
    const dialog = within(await findRole("dialog"));
    expect(dialog.getByRole("heading", { name: "Nouvelle décision" })).toBeVisible();
    for (const label of [
      /^Titre/,
      /^Contexte/,
      /^Décision/,
      /^Conséquences positives/,
      /^À accepter/,
      /^Alternatives écartées/,
    ]) {
      expect(dialog.getByRole("textbox", { name: label })).toBeVisible();
    }
    expect(dialog.getByRole("radio", { name: "Proposée" })).toBeChecked();
    expect(dialog.getByRole("combobox", { name: "Liens : ajouter" })).toBeVisible();
    expect(dialog.queryByRole("button", { name: /agent|Préremplir/i })).toBeNull();
    expect(window.location.search).toContain("tab=decisions");
  });

  it("« Remplacée par » n'apparaît que pour une décision remplacée", async () => {
    renderArchitecture({ search: "tab=decisions&new=1" });
    const dialog = within(await findRole("dialog"));
    expect(dialog.queryByRole("textbox", { name: /^Remplacée par/ })).toBeNull();
    await userEvent.click(dialog.getByRole("radio", { name: "Remplacée" }));
    expect(await dialog.findByRole("textbox", { name: /^Remplacée par/ })).toBeVisible();
    await userEvent.click(dialog.getByRole("radio", { name: "Acceptée" }));
    expect(dialog.queryByRole("textbox", { name: /^Remplacée par/ })).toBeNull();
  });

  it("champs obligatoires vides : « 3 points à corriger », rien d'envoyé", async () => {
    renderArchitecture({ search: "tab=decisions&new=1" });
    const dialog = within(await findRole("dialog"));
    await save(dialog);
    expect(await dialog.findByText(/3 points à corriger/)).toHaveFocus();
    expect(submitInputs()).toHaveLength(0);
  });

  it("enregistre une décision : une opération adr.create valide pour le contrat", async () => {
    renderArchitecture({ search: "tab=decisions&new=1" });
    const dialog = within(await findRole("dialog"));
    await userEvent.type(dialog.getByRole("textbox", { name: /^Titre/ }), "Modération des avis");
    await userEvent.type(dialog.getByRole("textbox", { name: /^Contexte/ }), "Avis publics.");
    await userEvent.type(
      dialog.getByRole("textbox", { name: /^Décision/ }),
      "Tout avis est modéré.",
    );
    await userEvent.type(
      dialog.getByRole("textbox", { name: /^Alternatives écartées/ }),
      "Publication immédiate · risque pour l'image",
    );
    await userEvent.type(
      dialog.getByRole("combobox", { name: "Liens : ajouter" }),
      "C-avis{Enter}",
    );
    await save(dialog);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(lastSubmit().operations[0]).toEqual({
      kind: "adr.create",
      title: "Modération des avis",
      status: "proposee",
      context: "Avis publics.",
      decision: "Tout avis est modéré.",
      alternatives: [{ name: "Publication immédiate", reason: "risque pour l'image" }],
      links: ["C-avis"],
    });
    expect(specBatchSubmitInputSchema.safeParse(lastSubmit()).success).toBe(true);
  });

  it("« Modifier » relit la décision ; passer à Remplacée envoie adr.update des seuls champs changés", async () => {
    renderArchitecture({ search: "tab=decisions&edit=ADR-003" });
    await findRole("dialog");
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: /^Titre/ })).toHaveValue(
        "Un seul composant écrit en base",
      ),
    );
    expect(screen.getByRole("heading", { name: "Modifier la décision" })).toBeVisible();
    await userEvent.click(screen.getByRole("radio", { name: "Remplacée" }));
    await userEvent.type(await screen.findByRole("textbox", { name: /^Remplacée par/ }), "ADR-009");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(lastSubmit().operations[0]).toEqual({
      kind: "adr.update",
      specId: "ADR-003",
      status: "remplacee",
      supersededBy: "ADR-009",
    });
  });

  it("décision d'un livrable validé : avertissement que l'enregistrement annule la validation", async () => {
    procedures.specItemGet.mockImplementation(async (input) => {
      const { id } = input as { id: string };
      const { ADR_DETAIL } = await import("./support/architecture.tsx");
      return {
        type: "adr",
        id,
        values: { ...ADR_DETAIL, specId: id },
        validated: true,
        referencedBy: { items: [], total: 0 },
      };
    });
    renderArchitecture({ search: "tab=decisions&edit=ADR-003" });
    expect(await screen.findByText(/annule sa validation/)).toBeVisible();
  });

  it("designer : ?new=1 est retiré de l'adresse, aucune feuille", async () => {
    serveArchitecture("designer");
    renderArchitecture({ search: "tab=decisions&new=1" });
    await screen.findByRole("article", { name: "Décision" });
    await waitFor(() => expect(window.location.search).not.toContain("new=1"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
