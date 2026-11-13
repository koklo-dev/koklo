import { specBatchSubmitInputSchema } from "@koklo/contract";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderData, SHA40, serveData } from "./support/data.tsx";
import {
  batch,
  lastSubmit,
  NEW_SHA,
  NEW_SHORT_SHA,
  submitInputs,
} from "./support/feature-form.tsx";
import { head } from "./support/features.tsx";
import { findRole } from "./support/wait.ts";
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

/** TK-107 lot C, critère 18 : formulaire Table dans SpecItemSheet (passation 11 §3, B385). */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  serveData("owner");
  procedures.specBatchSubmit.mockResolvedValue(
    batch({ results: [{ position: 0, kind: "table.create", specId: "T-reservation" }] }),
  );
  procedures.specBatchGet.mockResolvedValue(
    batch({ results: [{ position: 0, kind: "table.create", specId: "T-reservation" }] }),
  );
});

const save = (dialog: ReturnType<typeof within>) =>
  userEvent.click(dialog.getByRole("button", { name: "Enregistrer dans la spec" }));
const openCreate = async () => {
  renderData({ search: "tab=tables&new=1" });
  return within(await findRole("dialog"));
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Formulaire Table : création", () => {
  it("« Ajouter une table » ouvre la feuille : titre, fichier et champs de la passation 11 §3", async () => {
    renderData({ search: "tab=tables" });
    await userEvent.click(
      (await screen.findAllByRole("button", { name: "Ajouter une table" }))[0] as HTMLElement,
    );
    const dialog = within(await findRole("dialog"));
    expect(dialog.getByRole("heading", { name: "Nouvelle table" })).toBeVisible();
    expect(dialog.getByText("data/tables/nom.yaml")).toBeVisible();
    expect(dialog.getByText("Données · identifiant attribué à l'enregistrement")).toBeVisible();
    for (const label of [/^Nom/, /^Description/, /^Champs/]) {
      expect(dialog.getByRole("textbox", { name: label })).toBeVisible();
    }
    expect(dialog.getByRole("combobox", { name: /^Zone/ })).toBeVisible();
    expect(dialog.getByRole("radiogroup", { name: /^Données personnelles/ })).toBeVisible();
    expect(dialog.getByRole("combobox", { name: "Justifiée par : ajouter" })).toBeVisible();
  });

  it("les zones existantes sont proposées à la saisie, une zone nouvelle reste permise", async () => {
    const dialog = await openCreate();
    await waitFor(() =>
      expect(document.querySelectorAll("datalist option").length).toBeGreaterThan(0),
    );
    const zone = dialog.getByRole("combobox", { name: /^Zone/ });
    await userEvent.type(zone, "Fidélité");
    expect(zone).toHaveValue("Fidélité");
  });

  it("champs obligatoires vides : résumé « N points à corriger », champs en erreur, focus sur le résumé, rien d'envoyé", async () => {
    const dialog = await openCreate();
    await save(dialog);
    const summary = await dialog.findByText(/3 points à corriger/);
    expect(summary).toBeVisible();
    expect(summary).toHaveFocus();
    expect(within(summary).getByRole("link", { name: "Nom" })).toBeVisible();
    expect(dialog.getByRole("textbox", { name: /^Nom/ })).toHaveAttribute("aria-invalid", "true");
    expect(dialog.getByRole("textbox", { name: /^Champs/ })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(submitInputs()).toHaveLength(0);
  });

  it("une ligne de champ invalide nomme la ligne et le type attendu", async () => {
    const dialog = await openCreate();
    await userEvent.type(dialog.getByRole("textbox", { name: /^Nom/ }), "Avis");
    await userEvent.type(dialog.getByRole("combobox", { name: /^Zone/ }), "Qualité");
    await userEvent.type(dialog.getByRole("textbox", { name: /^Champs/ }), "id · chaine");
    await save(dialog);
    expect(await dialog.findByText(/Ligne 1 : le type « chaine » n'existe pas/)).toBeVisible();
    expect(submitInputs()).toHaveLength(0);
  });

  it("« Ce qu'on enregistre » : champ facultatif, une phrase par ligne, partie dans clientSummary", async () => {
    const dialog = await openCreate();
    const area = dialog.getByRole("textbox", { name: /^Ce qu'on enregistre/ });
    expect(area).toBeInTheDocument();
    expect(dialog.getByText(/Une phrase par ligne/)).toBeInTheDocument();
    await userEvent.type(dialog.getByRole("textbox", { name: /^Nom/ }), "Réservation");
    await userEvent.type(dialog.getByRole("combobox", { name: /^Zone/ }), "Prise de rendez-vous");
    await userEvent.type(
      dialog.getByRole("textbox", { name: /^Champs/ }),
      "id · uuid · clé primaire",
    );
    await userEvent.type(area, "Le créneau choisi{Enter}Le client concerné");
    await save(dialog);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(lastSubmit().operations[0]).toMatchObject({
      kind: "table.create",
      clientSummary: ["Le créneau choisi", "Le client concerné"],
    });
    expect(specBatchSubmitInputSchema.safeParse(lastSubmit()).success).toBe(true);
  });

  it("13 phrases : « Ce qu'on enregistre » est refusé avant l'envoi", async () => {
    const dialog = await openCreate();
    await userEvent.type(dialog.getByRole("textbox", { name: /^Nom/ }), "Réservation");
    await userEvent.type(dialog.getByRole("combobox", { name: /^Zone/ }), "Prise de rendez-vous");
    await userEvent.type(
      dialog.getByRole("textbox", { name: /^Champs/ }),
      "id · uuid · clé primaire",
    );
    await userEvent.type(
      dialog.getByRole("textbox", { name: /^Ce qu'on enregistre/ }),
      Array.from({ length: 13 }, (_, i) => `P${i}`).join("{Enter}"),
    );
    await save(dialog);
    expect(await dialog.findByText(/12 phrases au plus/)).toBeVisible();
    expect(submitInputs()).toHaveLength(0);
  });

  it("« Oui » sans champ marqué : le formulaire demande lequel", async () => {
    const dialog = await openCreate();
    await userEvent.type(dialog.getByRole("textbox", { name: /^Nom/ }), "Avis");
    await userEvent.type(dialog.getByRole("combobox", { name: /^Zone/ }), "Qualité");
    await userEvent.type(
      dialog.getByRole("textbox", { name: /^Champs/ }),
      "id · uuid · clé primaire",
    );
    await userEvent.click(dialog.getByRole("radio", { name: "Oui" }));
    await save(dialog);
    expect(await dialog.findByText(/Indiquez le champ concerné/)).toBeVisible();
    expect(submitInputs()).toHaveLength(0);
  });

  it("nom, zone, champs et justification : un specBatch.submit d'une opération table.create valide pour le contrat", async () => {
    const dialog = await openCreate();
    await userEvent.type(dialog.getByRole("textbox", { name: /^Nom/ }), "Réservation");
    await userEvent.type(dialog.getByRole("combobox", { name: /^Zone/ }), "Prise de rendez-vous");
    await userEvent.type(
      dialog.getByRole("textbox", { name: /^Description/ }),
      "Un client, un créneau.",
    );
    await userEvent.type(
      dialog.getByRole("textbox", { name: /^Champs/ }),
      "id · uuid · clé primaire{Enter}client_id · ref(T-client) · obligatoire",
    );
    await userEvent.type(
      dialog.getByRole("combobox", { name: "Justifiée par : ajouter" }),
      "F-001{Enter}",
    );
    await save(dialog);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    const input = lastSubmit();
    expect(input).toMatchObject({
      projectId: expect.any(String),
      branch: "main",
      operations: [
        {
          kind: "table.create",
          name: "Réservation",
          zone: "Prise de rendez-vous",
          description: "Un client, un créneau.",
          sources: ["F-001"],
          fields: [
            { name: "id", type: "uuid", primaryKey: true },
            { name: "client_id", type: "ref(T-client)", constraints: "obligatoire" },
          ],
        },
      ],
    });
    expect(input).not.toHaveProperty("baseSha");
    expect(specBatchSubmitInputSchema.safeParse(input).success).toBe(true);
  });

  it("après l'écriture : toast « T-reservation enregistrée dans la spec · commit … » et ligne sélectionnée", async () => {
    procedures.specHead.mockResolvedValue(
      head({
        commitSha: NEW_SHA,
        counts: {
          features: 7,
          tables: 4,
          endpoints: 0,
          rules: 4,
          roles: 3,
          flows: 2,
          relations: 2,
          fixtures: 1,
        },
      }),
    );
    const dialog = await openCreate();
    await userEvent.type(dialog.getByRole("textbox", { name: /^Nom/ }), "Réservation");
    await userEvent.type(dialog.getByRole("combobox", { name: /^Zone/ }), "Prise de rendez-vous");
    await userEvent.type(
      dialog.getByRole("textbox", { name: /^Champs/ }),
      "id · uuid · clé primaire",
    );
    await save(dialog);
    expect(
      await screen.findByText(
        new RegExp(`T-reservation enregistrée dans la spec · commit ${NEW_SHORT_SHA}`),
        undefined,
        {
          timeout: 8_000,
        },
      ),
    ).toBeVisible();
    await waitFor(() => expect(window.location.search).toContain("sel=T-reservation"));
    expect(window.location.search).not.toContain("new=1");
  });

  it("un nom déjà pris (write_conflict) : « Une table de ce nom existe déjà. »", async () => {
    procedures.specBatchSubmit.mockRejectedValue(
      apiError("SPEC_BATCH_CONFLICT", { reason: "write_conflict" }),
    );
    const dialog = await openCreate();
    await userEvent.type(dialog.getByRole("textbox", { name: /^Nom/ }), "Client");
    await userEvent.type(dialog.getByRole("combobox", { name: /^Zone/ }), "Clients");
    await userEvent.type(
      dialog.getByRole("textbox", { name: /^Champs/ }),
      "id · uuid · clé primaire",
    );
    await save(dialog);
    expect(await dialog.findByText("Une table de ce nom existe déjà.")).toBeVisible();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Formulaire Table : modification", () => {
  /** Le panneau de chargement est remplacé par celui du formulaire : toujours relire le dialogue. */
  const dialog = () => within(screen.getByRole("dialog"));
  const openEdit = async () => {
    renderData({ search: "tab=tables&edit=T-client" });
    await waitFor(() =>
      expect(dialog().getByRole("textbox", { name: /^Nom/ })).toHaveValue("Client"),
    );
  };

  it("« Modifier T-client » ouvre la feuille remplie : une ligne par champ, Oui car un champ est personnel", async () => {
    await openEdit();
    expect(dialog().getByRole("heading", { name: "Modifier la table" })).toBeInTheDocument();
    expect(dialog().getByRole("combobox", { name: /^Zone/ })).toHaveValue("Clients et fidélité");
    expect(dialog().getByRole("textbox", { name: /^Champs/ })).toHaveValue(
      "id · uuid · clé primaire\nnom · texte(80) · obligatoire\ntelephone · texte(20) · données personnelles",
    );
    expect(dialog().getByRole("radio", { name: "Oui" })).toBeChecked();
    expect(dialog().getByText("data/tables/client.yaml")).toBeInTheDocument();
  });

  it("seul le champ modifié part, avec baseSha ; sans modification, l'enregistrement est refusé", async () => {
    await openEdit();
    expect(dialog().getByRole("button", { name: "Enregistrer les modifications" })).toBeDisabled();
    const zone = dialog().getByRole("combobox", { name: /^Zone/ });
    await userEvent.clear(zone);
    await userEvent.type(zone, "Fidélité");
    await userEvent.click(dialog().getByRole("button", { name: "Enregistrer les modifications" }));
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(lastSubmit()).toMatchObject({
      baseSha: SHA40,
      operations: [{ kind: "table.update", specId: "T-client", zone: "Fidélité" }],
    });
    expect(lastSubmit().operations[0]).not.toHaveProperty("fields");
    expect(specBatchSubmitInputSchema.safeParse(lastSubmit()).success).toBe(true);
  });

  it("« Ce qu'on enregistre » se remplit depuis la fiche et se modifie seul", async () => {
    const previous = procedures.specItemGet.getMockImplementation();
    procedures.specItemGet.mockImplementation(async (input) => {
      const result = (await previous?.(input)) as { values: Record<string, unknown> };
      return { ...result, values: { ...result.values, clientSummary: ["Le nom du client"] } };
    });
    await openEdit();
    const area = dialog().getByRole("textbox", { name: /^Ce qu'on enregistre/ });
    expect(area).toHaveValue("Le nom du client");
    await userEvent.type(area, "{Enter}Son téléphone");
    await userEvent.click(dialog().getByRole("button", { name: "Enregistrer les modifications" }));
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(lastSubmit().operations).toEqual([
      {
        kind: "table.update",
        specId: "T-client",
        clientSummary: ["Le nom du client", "Son téléphone"],
      },
    ]);
  });

  it("« Supprimer » demande confirmation et envoie table.delete", async () => {
    await openEdit();
    await userEvent.click(dialog().getByRole("button", { name: /Supprimer/ }));
    const alert = await screen.findByText(/Supprimer T-client « Client » \?/, {
      selector: "p.sr-only",
    });
    const confirm = within(alert.closest("[role='alert']") ?? document.body).getByRole("button", {
      name: "Supprimer",
    });
    await userEvent.click(confirm);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(lastSubmit().operations).toEqual([{ kind: "table.delete", specId: "T-client" }]);
  });
});

describe("Formulaire Table : droits", () => {
  it("le designer lit : ?new=1 ne l'ouvre pas et le paramètre est retiré", async () => {
    resetWebMocks();
    polyfillRadix();
    watchUrl();
    serveData("designer");
    renderData({ search: "tab=tables&new=1" });
    await screen.findByRole("table", { name: "Tables du modèle de données" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(window.location.search).not.toContain("new=1"));
  });
});
