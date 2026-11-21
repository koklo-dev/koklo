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

/** TK-112 lot B, cas 9 : « Nouveau flux » et « Modifier » dans `SpecItemSheet` (B545 : saisie à la main). */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  serveArchitecture("owner");
  procedures.specBatchSubmit.mockResolvedValue(
    batch({ results: [{ position: 0, kind: "archflow.create", specId: "P-payer" }] }),
  );
  procedures.specBatchGet.mockResolvedValue(
    batch({ results: [{ position: 0, kind: "archflow.create", specId: "P-payer" }] }),
  );
});

const save = (dialog: ReturnType<typeof within>) =>
  userEvent.click(dialog.getByRole("button", { name: "Enregistrer dans la spec" }));

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Formulaire Flux", () => {
  it("« Nouveau flux » ouvre la feuille : parcours, participants, étapes, liens ; aucun bouton de l'agent", async () => {
    renderArchitecture({ search: "tab=flows" });
    await userEvent.click(await screen.findByRole("button", { name: "Nouveau flux" }));
    const dialog = within(await findRole("dialog"));
    expect(dialog.getByRole("heading", { name: "Nouveau flux" })).toBeVisible();
    expect(dialog.getByText("architecture/flows/parcours.yaml")).toBeVisible();
    expect(dialog.getByRole("textbox", { name: /^Parcours/ })).toBeVisible();
    expect(dialog.getByRole("textbox", { name: /^Étapes/ })).toBeVisible();
    for (const label of [
      "Participants",
      "Sert les fonctionnalités",
      "Applique les règles",
      "Décisions",
    ]) {
      expect(dialog.getByRole("combobox", { name: `${label} : ajouter` })).toBeVisible();
    }
    expect(dialog.queryByRole("button", { name: /agent|Préremplir/i })).toBeNull();
    expect(window.location.search).toContain("tab=flows");
  });

  it("champs obligatoires vides : résumé « 3 points à corriger », rien d'envoyé", async () => {
    renderArchitecture({ search: "tab=flows&new=1" });
    const dialog = within(await findRole("dialog"));
    await save(dialog);
    expect(await dialog.findByText(/3 points à corriger/)).toHaveFocus();
    expect(submitInputs()).toHaveLength(0);
  });

  it("enregistre un flux : une opération archflow.create valide pour le contrat", async () => {
    renderArchitecture({ search: "tab=flows&new=1" });
    const dialog = within(await findRole("dialog"));
    await userEvent.type(dialog.getByRole("textbox", { name: /^Parcours/ }), "P-payer");
    const participants = dialog.getByRole("combobox", { name: "Participants : ajouter" });
    for (const id of ["RL-client", "C-api"]) await userEvent.type(participants, `${id}{Enter}`);
    await userEvent.type(
      dialog.getByRole("textbox", { name: /^Étapes/ }),
      "RL-client -> C-api : Paie | retour: ok",
    );
    await save(dialog);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(lastSubmit().operations[0]).toEqual({
      kind: "archflow.create",
      flow: "P-payer",
      participants: ["RL-client", "C-api"],
      messages: [{ from: "RL-client", to: "C-api", text: "Paie", reply: "ok" }],
    });
    expect(specBatchSubmitInputSchema.safeParse(lastSubmit()).success).toBe(true);
  });

  it("une puce de participant mal formée est refusée avec l'exemple attendu", async () => {
    renderArchitecture({ search: "tab=flows&new=1" });
    const dialog = within(await findRole("dialog"));
    await userEvent.type(
      dialog.getByRole("combobox", { name: "Participants : ajouter" }),
      "api{Enter}",
    );
    expect(await dialog.findByText(/n'est pas un composant ni un rôle/)).toBeVisible();
  });

  it("« Modifier » relit le flux : étapes en texte, parcours figé ; modifier une décision envoie archflow.update", async () => {
    renderArchitecture({ search: "tab=flows&edit=P-reserver" });
    await findRole("dialog");
    const dialog = screen;
    await waitFor(() =>
      expect(dialog.getByRole("textbox", { name: /^Parcours/ })).toHaveValue("P-reserver"),
    );
    expect(dialog.getByRole("heading", { name: "Modifier le flux" })).toBeVisible();
    expect(dialog.getByRole("textbox", { name: /^Parcours/ })).toHaveAttribute("readonly");
    expect(
      (dialog.getByRole("textbox", { name: /^Étapes/ }) as HTMLTextAreaElement).value,
    ).toContain("C-web -> C-api : reservation.create | retour: Confirmée");
    await userEvent.type(
      dialog.getByRole("combobox", { name: "Décisions : ajouter" }),
      "ADR-009{Enter}",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Enregistrer les modifications" }));
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(lastSubmit().operations[0]).toEqual({
      kind: "archflow.update",
      specId: "P-reserver",
      decisions: ["ADR-003", "ADR-009"],
    });
  });

  it("designer : ?new=1 est retiré de l'adresse, aucune feuille", async () => {
    serveArchitecture("designer");
    renderArchitecture({ search: "tab=flows&new=1" });
    await screen.findByRole("img", { name: /Diagramme de séquence/ });
    await waitFor(() => expect(window.location.search).not.toContain("new=1"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
