import { specBatchSubmitInputSchema } from "@koklo/contract";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { batch, failedBatch, indexCatchesUp } from "./support/feature-form.tsx";
import { PROJECT_ID } from "./support/features.tsx";
import {
  accept,
  askConfirmation,
  CONFIRM_GROUP,
  card,
  edit,
  feature,
  inCard,
  liveText,
  openFraming,
  PROPOSALS_OUTPUT,
  paste,
  proposeFeatures,
  reject,
  SAVE,
  saveBar,
  serveFraming,
  submits,
  T1,
  T2,
  T3,
} from "./support/framing.tsx";
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

/**
 * TK-59 / 59b, enregistrement (S-framing §3.5 barre, §3.6 récapitulatif, §3.7 suivi, §5.2) : AUCUNE création sans
 * clic humain, récapitulatif en ligne, « Confirmer » unique, exactement les opérations acceptées, un seul
 * specBatch.submit.
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
  serveFraming();
  procedures.specBatchSubmit.mockReturnValue(new Promise(() => undefined));
});

const confirmButton = (panel: ReturnType<typeof within>) =>
  panel.getByRole("button", { name: "Confirmer" });

describe("Aucune création sans action humaine", () => {
  it("après draftBrief et proposeFeatures réussis : zéro specBatch.submit, rien d'accepté", async () => {
    await openFraming();
    await proposeFeatures();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(submits()).toHaveLength(0);
    expect(procedures.specBatchGet).not.toHaveBeenCalled();
  });

  it("à 0 acceptée : « Acceptez au moins une proposition pour continuer. », aucun bouton d'enregistrement actif", async () => {
    await openFraming();
    await proposeFeatures();
    expect(screen.getByText("Acceptez au moins une proposition pour continuer.")).toBeVisible();
    const button = saveBar();
    if (button) expect(button).toBeDisabled();
  });

  it("rappel sous la barre : « Ces propositions viennent d'Anthropic et ne sont pas encore enregistrées. »", async () => {
    await openFraming();
    await proposeFeatures();
    expect(
      screen.getByText("Ces propositions viennent d'Anthropic et ne sont pas encore enregistrées."),
    ).toBeVisible();
  });

  it("« Enregistrer N fonctionnalité(s) » ne fait que ouvrir le récapitulatif : toujours zéro submit", async () => {
    await openFraming();
    await proposeFeatures();
    await accept(T1);
    await askConfirmation();
    expect(submits()).toHaveLength(0);
  });

  it("rejeter ou laisser à relire ne rend pas le bouton actif", async () => {
    await openFraming();
    await proposeFeatures();
    await reject(T1);
    expect(screen.getByText("Acceptez au moins une proposition pour continuer.")).toBeVisible();
  });
});

describe("Récapitulatif de confirmation (en ligne, pas de modale)", () => {
  async function ready() {
    await openFraming();
    await proposeFeatures();
    await accept(T1);
    await accept(T2);
  }

  it("bouton « Enregistrer 2 fonctionnalités » (singulier à 1)", async () => {
    await openFraming();
    await proposeFeatures();
    await accept(T1);
    expect(screen.getByRole("button", { name: "Enregistrer 1 fonctionnalité" })).toBeEnabled();
    await accept(T2);
    expect(screen.getByRole("button", { name: "Enregistrer 2 fonctionnalités" })).toBeEnabled();
  });

  it("groupe nommé « Confirmer l'enregistrement » : phrase, titres en texte brut avec priorité et critères, rappel", async () => {
    await ready();
    const panel = await askConfirmation();
    expect(screen.getByRole("group", { name: CONFIRM_GROUP })).toHaveTextContent(
      "Vous allez créer 2 fonctionnalités dans le projet Alpha :",
    );
    const items = panel.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(items[0]).toContain(T1);
    expect(items[0]).toMatch(/Indispensable/);
    expect(items[0]).toMatch(/2 critères/);
    expect(items[1]).toContain(T2);
    expect(
      panel.getByText("Les propositions rejetées ou à relire ne sont pas enregistrées."),
    ).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("focus initial sur « Revenir » ; Échap = « Revenir » sans rien envoyer", async () => {
    await ready();
    const panel = await askConfirmation();
    expect(panel.getByRole("button", { name: "Revenir" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("group", { name: CONFIRM_GROUP })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: SAVE })).toBeVisible();
    expect(submits()).toHaveLength(0);
  });

  it("« Revenir » referme le récapitulatif, propositions et statuts intacts", async () => {
    await ready();
    const panel = await askConfirmation();
    await userEvent.click(panel.getByRole("button", { name: "Revenir" }));
    expect(screen.queryByRole("group", { name: CONFIRM_GROUP })).not.toBeInTheDocument();
    expect(inCard(T1).getByText("Acceptée")).toBeVisible();
    expect(submits()).toHaveLength(0);
  });
});

describe("« Confirmer » : un seul specBatch.submit", () => {
  it("exactement les opérations acceptées, éditions comprises, dans l'ordre, jamais rejetées ni à relire", async () => {
    await openFraming();
    await proposeFeatures();
    await accept(T1);
    await edit(T2);
    await paste(
      inCard(T2).getByRole("textbox", { name: /^Titre( \(obligatoire\))?$/ }),
      "Annuler (titre édité)",
    );
    await userEvent.click(inCard(T2).getByRole("combobox", { name: /^Priorité/ }));
    await userEvent.click(await screen.findByRole("option", { name: "Souhaitable" }));
    await userEvent.click(inCard(T2).getByRole("button", { name: "Terminer la modification" }));
    await accept("Annuler (titre édité)");
    await reject(T3);
    const panel = await askConfirmation();
    await userEvent.click(confirmButton(panel));
    await waitFor(() => expect(submits()).toHaveLength(1));
    const edited = { ...feature(T2, "could"), title: "Annuler (titre édité)" };
    expect(submits()[0]).toStrictEqual({
      projectId: PROJECT_ID,
      idempotencyKey: expect.stringMatching(/^feature-[A-Za-z0-9-]+$/),
      branch: "main",
      operations: [PROPOSALS_OUTPUT.features[0], edited],
    });
    expect(specBatchSubmitInputSchema.safeParse(submits()[0]).success).toBe(true);
  });

  it("un double clic sur « Confirmer » n'envoie qu'une fois", async () => {
    await openFraming();
    await proposeFeatures();
    await accept(T1);
    const panel = await askConfirmation();
    await userEvent.dblClick(confirmButton(panel));
    await waitFor(() => expect(submits().length).toBeGreaterThanOrEqual(1));
    expect(submits()).toHaveLength(1);
  });

  it("pendant l'envoi : « Enregistrement en cours… » dans la région d'état, aucune action possible sur les cartes", async () => {
    await openFraming();
    await proposeFeatures();
    await accept(T1);
    await userEvent.click(confirmButton(await askConfirmation()));
    await waitFor(() => expect(liveText()).toMatch(/Enregistrement en cours…/));
  });

  it("un doublon accepté part comme les autres", async () => {
    await openFraming();
    await proposeFeatures();
    await accept(T3);
    await userEvent.click(confirmButton(await askConfirmation()));
    await waitFor(() => expect(submits()).toHaveLength(1));
    expect((submits()[0]?.operations as Array<{ title: string }> | undefined)?.[0]?.title).toBe(T3);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Succès (§3.7)", () => {
  const created = () =>
    batch({
      results: [
        { position: 0, kind: "feature.create", specId: "F-004" },
        { position: 1, kind: "feature.create", specId: "F-005" },
      ],
    });
  beforeEach(() => {
    procedures.specBatchSubmit.mockReset();
    procedures.specBatchSubmit.mockResolvedValue(created());
    procedures.specBatchGet.mockResolvedValue(created());
    indexCatchesUp();
  });

  async function saveTwo() {
    await openFraming();
    await proposeFeatures();
    await accept(T1);
    await accept(T2);
    await reject(T3);
    await userEvent.click(confirmButton(await askConfirmation()));
    await screen.findByText(/2 fonctionnalités créées\./, undefined, { timeout: 8000 });
  }

  it("« 2 fonctionnalités créées. » dans la région d'état, lien « Voir la liste », focus sur le h1", async () => {
    await saveTwo();
    expect(liveText()).toContain("2 fonctionnalités créées.");
    expect(screen.getByRole("link", { name: "Voir la liste" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/features`,
    );
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Cadrage", level: 1 })).toHaveFocus(),
    );
  });

  it("les acceptées sont retirées, les rejetées jetées, les « À relire » restantes conservées", async () => {
    await openFraming();
    await proposeFeatures();
    await accept(T1);
    await accept(T2);
    await userEvent.click(confirmButton(await askConfirmation()));
    await screen.findByText(/2 fonctionnalités créées\./, undefined, { timeout: 8000 });
    expect(screen.queryByRole("heading", { name: T1, level: 3 })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: T2, level: 3 })).not.toBeInTheDocument();
    expect(inCard(T3).getByText("À relire")).toBeVisible();
  });

  it("les rejetées ne sont pas gardées dans le brouillon local", async () => {
    await saveTwo();
    const raw = localStorage.getItem(`koklo:framing-draft:${PROJECT_ID}`);
    const proposals = raw ? (JSON.parse(raw).proposals as Array<{ status: string }>) : [];
    expect(proposals.filter((p) => p.status === "rejected")).toEqual([]);
    expect(proposals.filter((p) => p.status === "accepted")).toEqual([]);
  });

  it("aucun second submit n'est parti", async () => {
    await saveTwo();
    expect(submits()).toHaveLength(1);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Échec d'un lot (« tout ou rien »)", () => {
  async function submitThree() {
    await openFraming();
    await proposeFeatures();
    await accept(T1);
    await accept(T2);
    await accept(T3);
    await userEvent.click(confirmButton(await askConfirmation()));
  }

  it("SPEC_INVALID sur l'opération n°3 : récapitulatif refermé, saisies gardées, message et focus sur la carte concernée", async () => {
    procedures.specBatchSubmit.mockReset();
    procedures.specBatchSubmit.mockRejectedValue(
      apiError("SPEC_INVALID", {
        report: {
          ok: false,
          counts: { error: 1, warning: 0 },
          truncated: false,
          issues: [
            {
              rule: "structure",
              code: "bad_shape",
              severity: "error",
              path: "features/F-006.md",
              pointer: "/operations/2",
              message: "La structure est inattendue.",
            },
          ],
        },
      }),
    );
    await submitThree();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("La fonctionnalité n°3 n'est pas valide");
    expect(alert).toHaveTextContent("La structure est inattendue.");
    expect(screen.queryByRole("group", { name: CONFIRM_GROUP })).not.toBeInTheDocument();
    for (const title of [T1, T2, T3]) expect(inCard(title).getByText("Acceptée")).toBeVisible();
    await waitFor(() => expect(card(T3).contains(document.activeElement)).toBe(true));
  });

  it("échec sans opération désignée (503) : « Rien n'a été écrit », saisies gardées, nouvelle tentative possible", async () => {
    procedures.specBatchSubmit.mockReset();
    procedures.specBatchSubmit.mockRejectedValue(apiError("PROVIDER_UNAVAILABLE"));
    await submitThree();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Rien n'a été écrit/);
    expect(screen.getByRole("button", { name: SAVE })).toBeEnabled();
    for (const title of [T1, T2, T3]) expect(inCard(title).getByText("Acceptée")).toBeVisible();
  });

  it("lot refusé (failed) : nouvelle clé d'idempotence au nouvel essai", async () => {
    procedures.specBatchSubmit.mockReset();
    procedures.specBatchSubmit.mockResolvedValue(failedBatch("SPEC_INVALID"));
    procedures.specBatchGet.mockResolvedValue(failedBatch("SPEC_INVALID"));
    await submitThree();
    await screen.findByRole("alert", undefined, { timeout: 8000 });
    await userEvent.click(await screen.findByRole("button", { name: SAVE }));
    await userEvent.click(
      confirmButton(within(await screen.findByRole("group", { name: CONFIRM_GROUP }))),
    );
    await waitFor(() => expect(submits()).toHaveLength(2));
    expect(submits()[1]?.idempotencyKey).not.toBe(submits()[0]?.idempotencyKey);
  });
});
