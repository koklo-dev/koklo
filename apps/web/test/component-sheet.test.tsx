import { specBatchSubmitInputSchema } from "@koklo/contract";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  componentIssues,
  componentOperationOf,
  componentValuesOf,
  dependencyTag,
  EMPTY_COMPONENT,
  parseDependency,
} from "../src/lib/component-operations.ts";
import {
  COMPONENT_DETAIL,
  renderArchitecture,
  serveArchitecture,
} from "./support/architecture.tsx";
import {
  batch,
  lastSubmit,
  NEW_SHA,
  NEW_SHORT_SHA,
  submitInputs,
} from "./support/feature-form.tsx";
import { head } from "./support/features.tsx";
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

/** TK-111 lot C, cas 9 : « Nouveau composant » et « Modifier » dans `SpecItemSheet` (passation 11 §3). */
const filled = {
  ...EMPTY_COMPONENT,
  name: "Passerelle SMS",
  type: "service" as const,
  zone: "Communication",
  responsibility: "Envoie les rappels.",
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("opérations du formulaire Composant", () => {
  it("lit une puce « Dépend de » : composant, moyen, asynchrone", () => {
    expect(parseDependency("C-db · SQL")).toEqual({ to: "C-db", via: "SQL" });
    expect(parseDependency("C-queue · planifie · asynchrone")).toEqual({
      to: "C-queue",
      via: "planifie",
      async: true,
    });
    expect(parseDependency("db · SQL")).toBeNull();
    expect(parseDependency("C-db")).toBeNull();
    expect(parseDependency(`C-db · ${"x".repeat(121)}`)).toBeNull();
    expect(dependencyTag("C-db · SQL")).toBeNull();
    expect(dependencyTag("n'importe quoi")).toMatch(/écrivez le composant puis le moyen/);
  });

  it("points à corriger dans l'ordre : nom, type, zone, responsabilité, possède, dépend de, sert", () => {
    expect(componentIssues(EMPTY_COMPONENT).map((issue) => issue.field)).toEqual([
      "name",
      "type",
      "zone",
      "responsibility",
    ]);
    expect(
      componentIssues({
        ...filled,
        owns: ["client"],
        dependsOn: ["rien"],
        serves: ["F-1"],
      }).map((issue) => issue.field),
    ).toEqual(["owns", "dependsOn", "serves"]);
    expect(componentIssues({ ...filled, name: "x".repeat(121) })[0]?.message).toBe(
      "Au plus 120 caractères.",
    );
    expect(componentIssues(filled)).toEqual([]);
  });

  it("création : listes vides omises ; liens écrits tels que saisis", () => {
    expect(componentOperationOf(filled)).toEqual({
      kind: "component.create",
      name: "Passerelle SMS",
      type: "service",
      zone: "Communication",
      responsibility: "Envoie les rappels.",
    });
    expect(
      componentOperationOf({
        ...filled,
        owns: ["T-rappel"],
        dependsOn: ["C-api · HTTP", "C-queue · planifie · asynchrone"],
        serves: ["F-004"],
      }),
    ).toMatchObject({
      owns: ["T-rappel"],
      dependsOn: [
        { to: "C-api", via: "HTTP" },
        { to: "C-queue", via: "planifie", async: true },
      ],
      serves: ["F-004"],
    });
  });

  it("modification : seuls les champs changés ; rien de changé = aucune opération", () => {
    const baseline = componentValuesOf(COMPONENT_DETAIL as never);
    expect(baseline.dependsOn).toEqual(["C-db · SQL"]);
    expect(componentOperationOf(baseline, { specId: "C-api", baseline })).toBeNull();
    expect(
      componentOperationOf({ ...baseline, zone: "Paiement" }, { specId: "C-api", baseline }),
    ).toEqual({ kind: "component.update", specId: "C-api", zone: "Paiement" });
  });
});

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  serveArchitecture("owner");
  procedures.specBatchSubmit.mockResolvedValue(
    batch({ results: [{ position: 0, kind: "component.create", specId: "C-passerelle-sms" }] }),
  );
  procedures.specBatchGet.mockResolvedValue(
    batch({ results: [{ position: 0, kind: "component.create", specId: "C-passerelle-sms" }] }),
  );
});

const save = (dialog: ReturnType<typeof within>) =>
  userEvent.click(dialog.getByRole("button", { name: "Enregistrer dans la spec" }));
const openCreate = async () => {
  renderArchitecture({ search: "new=1" });
  return within(await findRole("dialog"));
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Formulaire Composant : création", () => {
  it("« Nouveau composant » ouvre la feuille : titre, fichier, et les champs de la passation 11 §3", async () => {
    renderArchitecture();
    await userEvent.click(await screen.findByRole("button", { name: "Nouveau composant" }));
    const dialog = within(await findRole("dialog"));
    expect(dialog.getByRole("heading", { name: "Nouveau composant" })).toBeVisible();
    expect(dialog.getByText("architecture/components/nom.yaml")).toBeVisible();
    expect(
      dialog.getByText("Architecture · identifiant attribué à l'enregistrement"),
    ).toBeVisible();
    for (const label of [/^Nom/, /^Responsabilité/]) {
      expect(dialog.getByRole("textbox", { name: label })).toBeVisible();
    }
    expect(dialog.getByRole("radiogroup", { name: /^Type/ })).toBeVisible();
    expect(dialog.getByRole("combobox", { name: /^Zone/ })).toBeVisible();
    for (const label of ["Possède les données", "Dépend de", "Sert les fonctionnalités"]) {
      expect(dialog.getByRole("combobox", { name: `${label} : ajouter` })).toBeVisible();
    }
    expect(dialog.getAllByRole("radio").map((radio) => radio.textContent)).toEqual([
      "Application",
      "Service",
      "Stockage",
      "File de tâches",
      "Externe",
    ]);
  });

  it("champs obligatoires vides : résumé « 4 points à corriger », focus sur le résumé, rien d'envoyé", async () => {
    const dialog = await openCreate();
    await save(dialog);
    const summary = await dialog.findByText(/4 points à corriger/);
    expect(summary).toHaveFocus();
    expect(within(summary).getByRole("link", { name: "Type" })).toBeVisible();
    expect(dialog.getByRole("textbox", { name: /^Nom/ })).toHaveAttribute("aria-invalid", "true");
    expect(submitInputs()).toHaveLength(0);
  });

  it("une puce « Dépend de » mal formée est refusée avec l'exemple attendu", async () => {
    const dialog = await openCreate();
    const field = dialog.getByRole("combobox", { name: "Dépend de : ajouter" });
    await userEvent.type(field, "api{Enter}");
    expect(await dialog.findByText(/écrivez le composant puis le moyen/)).toBeVisible();
  });

  it("enregistre un composant : une opération component.create valide pour le contrat, toast avec le commit", async () => {
    procedures.specHead.mockResolvedValue(
      head({
        commitSha: NEW_SHA,
        counts: {
          features: 7,
          tables: 6,
          endpoints: 0,
          rules: 4,
          roles: 3,
          flows: 2,
          components: 4,
        },
      }),
    );
    const dialog = await openCreate();
    await userEvent.type(dialog.getByRole("textbox", { name: /^Nom/ }), "Passerelle SMS");
    await userEvent.click(dialog.getByRole("radio", { name: "Service" }));
    await userEvent.type(dialog.getByRole("combobox", { name: /^Zone/ }), "Communication");
    await userEvent.type(
      dialog.getByRole("textbox", { name: /^Responsabilité/ }),
      "Envoie les rappels.",
    );
    await userEvent.type(
      dialog.getByRole("combobox", { name: "Dépend de : ajouter" }),
      "C-api · HTTP{Enter}",
    );
    await save(dialog);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(lastSubmit().operations[0]).toEqual({
      kind: "component.create",
      name: "Passerelle SMS",
      type: "service",
      zone: "Communication",
      responsibility: "Envoie les rappels.",
      dependsOn: [{ to: "C-api", via: "HTTP" }],
    });
    expect(specBatchSubmitInputSchema.safeParse(lastSubmit()).success).toBe(true);
    expect(
      await screen.findByText(
        new RegExp(`C-passerelle-sms enregistré dans la spec · commit ${NEW_SHORT_SHA}`),
        undefined,
        { timeout: 8_000 },
      ),
    ).toBeVisible();
  });

  it("Échap sur un formulaire vierge ferme et rend le focus à « Nouveau composant »", async () => {
    await openCreate();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(window.location.search).toBe("");
    expect(screen.getByRole("button", { name: "Nouveau composant" })).toHaveFocus();
  });

  it("Échap avec saisie : confirmation « Fermer sans enregistrer ? »", async () => {
    const dialog = await openCreate();
    await userEvent.type(dialog.getByRole("textbox", { name: /^Nom/ }), "Un début");
    await userEvent.keyboard("{Escape}");
    const confirm = await screen.findByRole("alertdialog", { name: "Fermer sans enregistrer ?" });
    expect(within(confirm).getByRole("button", { name: "Continuer la saisie" })).toHaveFocus();
  });
});

describe("Formulaire Composant : modification", () => {
  it("« Modifier » relit la fiche : valeurs, identifiant, fichier ; rien à enregistrer sans changement", async () => {
    renderArchitecture({ search: "edit=C-api" });
    await findRole("dialog");
    const dialog = screen;
    await waitFor(() => expect(dialog.getByRole("textbox", { name: /^Nom/ })).toHaveValue("API"));
    expect(dialog.getByRole("heading", { name: "Modifier le composant" })).toBeVisible();
    expect(dialog.getByText("architecture/components/api.yaml")).toBeVisible();
    expect(dialog.getByText("C-db · SQL")).toBeVisible();
    expect(dialog.getByRole("radio", { name: "Service" })).toBeChecked();
    expect(dialog.getByRole("button", { name: "Enregistrer les modifications" })).toBeDisabled();
  });

  it("modifier la zone envoie component.update avec la seule zone changée", async () => {
    procedures.specBatchSubmit.mockResolvedValue(
      batch({ results: [{ position: 0, kind: "component.update", specId: "C-api" }] }),
    );
    renderArchitecture({ search: "edit=C-api" });
    await findRole("dialog");
    const dialog = screen;
    await waitFor(() => expect(dialog.getByRole("textbox", { name: /^Nom/ })).toHaveValue("API"));
    const zone = dialog.getByRole("combobox", { name: /^Zone/ });
    expect(zone).toHaveValue("Prise de rendez-vous");
    await userEvent.clear(zone);
    await userEvent.type(zone, "Paiement");
    await userEvent.click(dialog.getByRole("button", { name: "Enregistrer les modifications" }));
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(lastSubmit().operations[0]).toEqual({
      kind: "component.update",
      specId: "C-api",
      zone: "Paiement",
    });
  });

  it("designer : ?new=1 est retiré de l'adresse, aucune feuille", async () => {
    serveArchitecture("designer");
    renderArchitecture({ search: "new=1" });
    await screen.findByRole("table", { name: "Composants de l'architecture" });
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
