import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clickSave,
  indexCatchesUp,
  openCreate,
  serveWrite,
  setText,
  submitInputs,
} from "./support/feature-form.tsx";

/** Une fois rempli par l'agent, le libellé porte « proposé par l'agent » : on cherche par le début du nom. */
const titleField = (panel: Awaited<ReturnType<typeof openCreate>>) =>
  panel.getByRole("textbox", { name: /^Titre\s*obligatoire/ });

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

/** TK-101 lot B, cas 2 et 3 : préremplissage de la création (B329 h), jamais d'écriture dans la spec. */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
  serveWrite();
});

const PREFILLED = {
  type: "feature",
  values: {
    title: "Liste d'attente",
    priority: "should",
    description: "Le client laisse son téléphone.",
    criteria: [
      {
        title: "Inscription",
        steps: [
          { type: "etant_donne", text: "un service complet" },
          { type: "quand", text: "le client s'inscrit" },
          { type: "alors", text: "il reçoit une confirmation" },
        ],
      },
    ],
    links: ["R-001", "F-003"],
  },
};

async function prefill(
  panel: Awaited<ReturnType<typeof openCreate>>,
  text = "une liste d'attente",
) {
  await userEvent.type(panel.getByRole("textbox", { name: "Description pour l'agent" }), text);
  await userEvent.click(panel.getByRole("button", { name: "Préremplir" }));
}

describe("Création : préremplissage par l'agent", () => {
  it("l'encadré « Décrire en une phrase » est là ; rien n'est envoyé avant « Préremplir »", async () => {
    const panel = await openCreate();
    expect(panel.getByRole("region", { name: "Aide de l'agent" })).toBeVisible();
    expect(procedures.aiPrefillItem).not.toHaveBeenCalled();
  });

  it("remplit les champs vides, les marque, n'appelle jamais specBatch.submit", async () => {
    procedures.aiPrefillItem.mockResolvedValue(PREFILLED);
    const panel = await openCreate();
    await prefill(panel);
    await waitFor(() => expect(titleField(panel)).toHaveValue("Liste d'attente"));
    expect(procedures.aiPrefillItem).toHaveBeenCalledWith(
      expect.objectContaining({ type: "feature", description: "une liste d'attente" }),
      expect.anything(),
    );
    expect(panel.getByText("R-001")).toBeVisible();
    expect(panel.queryByText("F-003")).toBeNull();
    expect(panel.getAllByText("proposé par l'agent").length).toBeGreaterThanOrEqual(4);
    expect(submitInputs()).toHaveLength(0);
  });

  it("ne remplace pas un champ déjà saisi", async () => {
    procedures.aiPrefillItem.mockResolvedValue(PREFILLED);
    const panel = await openCreate();
    await setText(titleField(panel), "Mon titre");
    await prefill(panel);
    await waitFor(() => expect(panel.getByText("R-001")).toBeVisible());
    expect(titleField(panel)).toHaveValue("Mon titre");
  });

  it("« Effacer » vide tout le formulaire et rend l'encadré d'aide", async () => {
    procedures.aiPrefillItem.mockResolvedValue(PREFILLED);
    const panel = await openCreate();
    await prefill(panel);
    await waitFor(() => expect(titleField(panel)).toHaveValue("Liste d'attente"));
    await userEvent.click(panel.getByRole("button", { name: "Effacer" }));
    expect(titleField(panel)).toHaveValue("");
    expect(panel.queryByText("R-001")).toBeNull();
    expect(panel.getByRole("region", { name: "Aide de l'agent" })).toBeVisible();
  });

  it("clé absente : message dans l'encadré, saisie intacte, aucun envoi", async () => {
    procedures.aiPrefillItem.mockRejectedValue({
      code: "LLM_NOT_CONFIGURED",
      status: 409,
      data: { reason: "missing" },
    });
    const panel = await openCreate();
    await setText(titleField(panel), "Mon titre");
    await prefill(panel);
    expect(await panel.findByText(/pas encore configurée/)).toBeVisible();
    expect(titleField(panel)).toHaveValue("Mon titre");
    expect(submitInputs()).toHaveLength(0);
  });
});

describe("Création : Préremplir actif (maquette 16 l.69)", () => {
  it("phrase vide : le bouton est actif, le message demande une phrase, aucun appel", async () => {
    const panel = await openCreate();
    const button = panel.getByRole("button", { name: "Préremplir" });
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(
      await panel.findByText("Décrivez d'abord la fonctionnalité en une phrase."),
    ).toBeVisible();
    expect(procedures.aiPrefillItem).not.toHaveBeenCalled();
    await userEvent.type(panel.getByRole("textbox", { name: "Description pour l'agent" }), "a");
    expect(panel.queryByText("Décrivez d'abord la fonctionnalité en une phrase.")).toBeNull();
  });
});

describe("Enregistrement : un seul specBatch.submit et un toast avec le commit", () => {
  it("une opération, puis « F-004 enregistrée dans la spec · commit b2c3d4e »", async () => {
    indexCatchesUp();
    const panel = await openCreate();
    await setText(titleField(panel), "Notifications par e-mail");
    await userEvent.click(
      within(panel.getByRole("radiogroup", { name: /^Priorité/ })).getByRole("radio", {
        name: "Importante",
      }),
    );
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(submitInputs()[0]?.operations).toHaveLength(1);
    expect(
      await screen.findByText(/F-004 enregistrée dans la spec · commit b2c3d4e/, undefined, {
        timeout: 8_000,
      }),
    ).toBeVisible();
  });
});
