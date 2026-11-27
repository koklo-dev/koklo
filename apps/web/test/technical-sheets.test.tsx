import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lastSubmit } from "./support/feature-form.tsx";
import { commitOnSubmit, renderTechnical, serveTechnical } from "./support/technical.tsx";
import {
  apiError,
  polyfillRadix,
  procedures,
  resetWebMocks,
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

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
});

const sheet = (name: string) => screen.findByRole("dialog", { name });

async function fillEnvironment(dialog: HTMLElement) {
  const form = within(dialog);
  await userEvent.type(form.getByRole("textbox", { name: /^Nom/ }), "Démo");
  await userEvent.type(form.getByRole("textbox", { name: /^Adresse/ }), "demo.exemple.fr");
  await userEvent.type(form.getByRole("textbox", { name: /^Hébergement/ }), "Scaleway");
  await userEvent.type(form.getByRole("textbox", { name: /^Base/ }), "PostgreSQL");
  await userEvent.click(form.getByRole("radio", { name: "Jeux d'exemple" }));
  await userEvent.click(form.getByRole("combobox", { name: /^Déploiement/ }));
  await userEvent.click(await screen.findByRole("option", { name: "Manuel" }));
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Feuilles du cahier technique", () => {
  it("nouveau choix : champs de la maquette, erreurs résumées avec focus", async () => {
    serveTechnical("owner");
    renderTechnical({ search: "new=1" });
    const dialog = await sheet("Nouveau choix technique");
    for (const label of [
      "Rôle",
      "Composants concernés",
      "Statut",
      "Choix retenu",
      "Options comparées",
      "Critères",
      "Pourquoi",
      "Exigences visées",
    ]) {
      expect(within(dialog).getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(within(dialog).getByText("tech/stack/nom.yaml")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Enregistrer dans la spec" }));
    expect(await within(dialog).findByText(/6 points à corriger/)).toHaveFocus();
    expect(procedures.specBatchSubmit).not.toHaveBeenCalled();
  });

  it("« Décrire en une phrase » préremplit les champs vides et les marque", async () => {
    serveTechnical("owner");
    procedures.aiPrefillItem.mockResolvedValue({
      type: "stack",
      values: { role: "Génération de PDF", options: ["Typst", "Puppeteer"] },
    });
    renderTechnical({ search: "new=1" });
    const dialog = await sheet("Nouveau choix technique");
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "Description pour l'agent" }),
      "un outil de PDF",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Préremplir" }));
    await waitFor(() =>
      expect(within(dialog).getByRole("textbox", { name: /^Rôle/ })).toHaveValue(
        "Génération de PDF",
      ),
    );
    expect(procedures.aiPrefillItem.mock.calls[0]?.[0]).toMatchObject({ type: "stack" });
    expect(within(dialog).getAllByText("proposé par l'agent").length).toBe(2);
  });

  it("nouvel environnement : un lot env.create, refus d'un secret sans la valeur recopiée", async () => {
    serveTechnical("owner");
    procedures.specBatchSubmit.mockRejectedValue(
      apiError("VALIDATION", {
        field: "operations.0.access",
        message:
          "Une valeur de secret ne peut pas entrer dans la spec : gardez seulement le nom de la variable.",
      }),
    );
    renderTechnical({ search: "tab=environments&new=1" });
    const dialog = await sheet("Nouvel environnement");
    await fillEnvironment(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: "Enregistrer dans la spec" }));
    const message = await within(dialog).findByText(
      /Une valeur de secret ne peut pas entrer dans la spec/,
    );
    const field = within(dialog).getByRole("textbox", { name: /^Accès/ });
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field.getAttribute("aria-describedby")).toContain(message.id);
    expect(lastSubmit().operations[0]).toMatchObject({ kind: "env.create", name: "Démo" });
  });

  it("modification : env.update des seuls champs changés, puis « Environnement enregistré »", async () => {
    serveTechnical("owner");
    commitOnSubmit(procedures.specBatchSubmit);
    renderTechnical({ search: "tab=environments&edit=ENV-recette" });
    const access = await screen.findByRole("textbox", { name: /^Accès/ });
    const dialog = await sheet("Modifier l'environnement");
    await userEvent.clear(access);
    await userEvent.type(access, "Équipe seule");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Enregistrer les modifications" }),
    );
    await waitFor(() =>
      expect(lastSubmit().operations).toEqual([
        { kind: "env.update", specId: "ENV-recette", access: "Équipe seule" },
      ]),
    );
    await waitFor(() => expect(screen.getByText("Environnement enregistré")).toBeInTheDocument(), {
      timeout: 5000,
    });
  });

  it("suppression d'un environnement : env.delete après confirmation", async () => {
    serveTechnical("owner");
    commitOnSubmit(procedures.specBatchSubmit);
    renderTechnical({ search: "tab=environments&edit=ENV-recette" });
    await userEvent.click(await screen.findByRole("button", { name: "Supprimer" }));
    const confirm = await screen.findByRole("group", { name: "Confirmer la suppression" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Supprimer" }));
    await waitFor(() =>
      expect(lastSubmit().operations).toEqual([{ kind: "env.delete", specId: "ENV-recette" }]),
    );
  });

  it("Échap ferme la feuille et rend le focus au bouton d'origine", async () => {
    serveTechnical("owner");
    renderTechnical();
    const open = await screen.findByRole("button", { name: "Nouveau choix" });
    await userEvent.click(open);
    await sheet("Nouveau choix technique");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(open).toHaveFocus());
  });
});
