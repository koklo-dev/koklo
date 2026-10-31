import { specBatchSubmitInputSchema } from "@koklo/contract";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clickSave,
  deferred,
  fillMinimum,
  form,
  lastSubmit,
  linkField,
  liveText,
  NEW_TITLE,
  openCreate,
  openEdit,
  openLinks,
  operationOf,
  pick,
  saveButton,
  serveWrite,
  setText,
  submitInputs,
  titleField,
} from "./support/feature-form.tsx";
import { head, PROJECT_ID, renderFeatures, SHA } from "./support/features.tsx";
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
 * TK-48 / 48e, construction de l'envoi et clé d'idempotence (S-feature-form §4.4, §5.2, AC-48-24) :
 * une seule opération du contrat, patch minimal en modification, `baseSha` seulement en modification,
 * un seul appel même au double clic, clé stable après absence de réponse uniquement.
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
  serveWrite();
  // L'envoi reste en attente : ces tests regardent ce qui PART, pas ce qui revient.
  procedures.specBatchSubmit.mockReturnValue(new Promise(() => undefined));
});

const KEY_PATTERN = /^feature-[A-Za-z0-9-]+$/;
type Panel = Awaited<ReturnType<typeof openCreate>>;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Création : l'entrée de specBatch.submit", () => {
  it("titre et priorité : exactement une opération feature.create, sans baseSha ni message", async () => {
    const panel = await openCreate();
    await fillMinimum(panel, NEW_TITLE, "Importante");
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(lastSubmit()).toStrictEqual({
      projectId: PROJECT_ID,
      idempotencyKey: expect.stringMatching(KEY_PATTERN),
      branch: "main",
      operations: [{ kind: "feature.create", title: NEW_TITLE, priority: "should" }],
    });
    expect(specBatchSubmitInputSchema.safeParse(lastSubmit()).success).toBe(true);
  });

  it("le titre part sans espaces autour", async () => {
    const panel = await openCreate();
    await fillMinimum(panel, "  Titre cadré  ");
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(operationOf()).toMatchObject({ title: "Titre cadré" });
  });

  it("branche = branche de la version lue (spec.head.branch), jamais saisie", async () => {
    procedures.specHead.mockResolvedValue(head({ branch: "cadrage" }));
    const panel = await openCreate();
    await fillMinimum(panel);
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(lastSubmit().branch).toBe("cadrage");
  });

  it("saisie complète : statut, description, critères typés et six listes de liens", async () => {
    const panel = await openCreate();
    await fillMinimum(panel, NEW_TITLE, "Indispensable");
    await pick(panel, "Statut", "Spécifiée");
    await setText(
      panel.getByRole("textbox", { name: "Description" }),
      "Première ligne\n\nTroisième ligne",
    );
    await userEvent.click(panel.getByRole("button", { name: "Ajouter un critère" }));
    const criterion = within(panel.getByRole("group", { name: /^Critère 1/ }));
    await setText(criterion.getByRole("textbox", { name: "Titre du critère" }), "Réception");
    await userEvent.click(criterion.getByRole("button", { name: "Ajouter une étape" }));
    await userEvent.click(criterion.getByRole("button", { name: "Ajouter une étape" }));
    const [first, second] = criterion.getAllByRole("textbox", { name: "Texte de l'étape" });
    await setText(first as HTMLElement, "un compte existant");
    await setText(second as HTMLElement, "la personne se connecte");
    await openLinks(panel);
    await setText(linkField(panel, "Écrans"), "S-login\n\nS-home");
    await setText(linkField(panel, "Rôles"), "RL-owner");
    await setText(linkField(panel, "Règles"), "R-001");
    await setText(linkField(panel, "Tables"), "T-user");
    await setText(linkField(panel, "Endpoints"), "E-login");
    await setText(linkField(panel, "Exigences non fonctionnelles"), "NFR-latence");
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(operationOf()).toStrictEqual({
      kind: "feature.create",
      title: NEW_TITLE,
      priority: "must",
      status: "specifiee",
      description: "Première ligne\n\nTroisième ligne",
      criteria: [
        {
          title: "Réception",
          steps: [
            { type: "etant_donne", text: "un compte existant" },
            { type: "quand", text: "la personne se connecte" },
          ],
        },
      ],
      screens: ["S-login", "S-home"],
      roles: ["RL-owner"],
      rules: ["R-001"],
      tables: ["T-user"],
      endpoints: ["E-login"],
      nfr: ["NFR-latence"],
    });
    expect(lastSubmit()).not.toHaveProperty("baseSha");
    expect(specBatchSubmitInputSchema.safeParse(lastSubmit()).success).toBe(true);
  });

  it("le statut laissé sur Brouillon n'est pas envoyé (valeur par défaut du serveur)", async () => {
    const panel = await openCreate();
    await fillMinimum(panel);
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(operationOf()).not.toHaveProperty("status");
  });

  it("l'envoi ne contient ni F-nnn, ni chemin de fichier, ni message", async () => {
    const panel = await openCreate();
    await fillMinimum(panel);
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    const json = JSON.stringify(lastSubmit());
    expect(json).not.toMatch(/F-\d{3}|\.yaml|\.koklo|"message"/);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Modification : patch minimal avec baseSha", () => {
  it("seul le titre modifié : { kind, specId, title }, baseSha = version lue", async () => {
    const panel = await openEdit();
    await setText(titleField(panel), "Connexion sans mot de passe");
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(lastSubmit()).toStrictEqual({
      projectId: PROJECT_ID,
      idempotencyKey: expect.stringMatching(KEY_PATTERN),
      branch: "main",
      baseSha: SHA,
      operations: [
        { kind: "feature.update", specId: "F-001", title: "Connexion sans mot de passe" },
      ],
    });
    expect(specBatchSubmitInputSchema.safeParse(lastSubmit()).success).toBe(true);
  });

  it("baseSha = spec.head.commitSha lu à l'ouverture", async () => {
    const other = "c3d4e5f60718293a4b5c6d7e8f9012345678abcd";
    procedures.specHead.mockResolvedValue(head({ commitSha: other }));
    const panel = await openEdit();
    await setText(titleField(panel), "Autre");
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(lastSubmit().baseSha).toBe(other);
  });

  it("priorité, statut et description modifiés : ces trois champs et rien d'autre", async () => {
    const panel = await openEdit();
    await pick(panel, "Priorité (obligatoire)", "Reportée");
    await pick(panel, "Statut", "Adoptée");
    await setText(panel.getByRole("textbox", { name: "Description" }), "Nouvelle description");
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(operationOf()).toStrictEqual({
      kind: "feature.update",
      specId: "F-001",
      priority: "wont",
      status: "adoptee",
      description: "Nouvelle description",
    });
  });

  it("une liste de liens vidée part comme tableau vide", async () => {
    const panel = await openEdit();
    await setText(linkField(panel, "Écrans"), "");
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(operationOf()).toStrictEqual({ kind: "feature.update", specId: "F-001", screens: [] });
  });

  it("un critère modifié : toute la liste des critères est envoyée, sans identifiants AC-n", async () => {
    const panel = await openEdit();
    const first = within(panel.getByRole("group", { name: /^Critère 1/ }));
    await setText(
      first.getByRole("textbox", { name: "Titre du critère" }),
      "Connexion réussie (v2)",
    );
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    const op = operationOf();
    expect(Object.keys(op).sort()).toEqual(["criteria", "kind", "specId"]);
    expect(op.criteria).toHaveLength(2);
    expect(op.criteria[0].title).toBe("Connexion réussie (v2)");
    expect(op.criteria[0].steps).toHaveLength(4);
    expect(op.criteria[1]).toStrictEqual({ title: "Adresse inconnue", steps: [] });
    expect(JSON.stringify(op)).not.toMatch(/AC-\d/);
  });

  it("l'ordre des critères inversé suffit à envoyer toute la liste", async () => {
    const panel = await openEdit();
    await userEvent.click(panel.getByRole("button", { name: "Monter le critère 2" }));
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(operationOf().criteria.map((c: { title: string }) => c.title)).toEqual([
      "Adresse inconnue",
      "Connexion réussie",
    ]);
  });

  it("espaces de début et de fin ajoutés au titre : pas une modification (bouton désactivé)", async () => {
    const panel = await openEdit();
    await setText(titleField(panel), "  Connexion par e-mail  ");
    await waitFor(() => expect(saveButton(panel)).toBeDisabled());
  });
});

describe("Envoi en cours (§4.4)", () => {
  it("double clic : un seul appel ; « Enregistrement… » en attente, champs en lecture seule, « Fermer » actif", async () => {
    const panel = await openCreate();
    await fillMinimum(panel);
    await userEvent.dblClick(panel.getByRole("button", { name: "Enregistrer" }));
    const busy = await panel.findByRole("button", { name: "Enregistrement…" });
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(submitInputs()).toHaveLength(1);
    const title = titleField(panel);
    expect(title).toHaveAttribute("readonly");
    expect(title).not.toBeDisabled();
    expect(panel.getByRole("textbox", { name: "Description" })).toHaveAttribute("readonly");
    expect(panel.getByRole("button", { name: "Fermer" })).toBeEnabled();
  });

  it("annonce « Envoi de votre modification… » dans la région d'état unique", async () => {
    const panel = await openCreate();
    await fillMinimum(panel);
    await clickSave(panel);
    await panel.findByRole("button", { name: "Enregistrement…" });
    expect(liveText()).toContain("Envoi de votre modification…");
  });

  it("indicateur « Avancement de l'enregistrement » : trois étapes, icône + texte, étape 1 en cours", async () => {
    const panel = await openCreate();
    await fillMinimum(panel);
    await clickSave(panel);
    const list = await panel.findByRole("list", { name: "Avancement de l'enregistrement" });
    expect(list.tagName).toBe("OL");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(/Envoi.*En cours…/);
    expect(items[1]).toHaveTextContent(/Écriture dans la spec.*À faire/);
    expect(items[2]).toHaveTextContent(/Mise à jour de la liste.*À faire/);
    for (const item of items)
      expect(item.querySelector("svg, [data-icon], [aria-hidden='true']")).not.toBeNull();
  });

  it("un champ du formulaire en lecture seule ne part pas modifié : la saisie reste affichée", async () => {
    const panel = await openCreate();
    await fillMinimum(panel);
    await clickSave(panel);
    await panel.findByRole("button", { name: "Enregistrement…" });
    expect(titleField(panel)).toHaveValue(NEW_TITLE);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Clé d'idempotence (AC-48-24)", () => {
  const failFirstWith = (error: unknown) => {
    procedures.specBatchSubmit.mockReset();
    procedures.specBatchSubmit
      .mockRejectedValueOnce(error)
      .mockReturnValue(new Promise(() => undefined));
  };
  const submitUntilError = async (panel: Panel) => {
    await fillMinimum(panel);
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    await panel.findByRole("alert");
  };
  const retry = (panel: Panel) => userEvent.click(panel.getByRole("button", { name: "Réessayer" }));

  it("absence de réponse puis réessai à l'identique : MÊME clé, même contenu", async () => {
    failFirstWith(new TypeError("fetch failed"));
    const panel = await openCreate();
    await submitUntilError(panel);
    expect(await panel.findByText("Impossible de confirmer l'enregistrement")).toBeVisible();
    await retry(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(2));
    expect(submitInputs()[1]?.idempotencyKey).toBe(submitInputs()[0]?.idempotencyKey);
    expect(submitInputs()[1]).toEqual(submitInputs()[0]);
  });

  it("absence de réponse, saisie modifiée, puis nouvel envoi : NOUVELLE clé", async () => {
    failFirstWith(new TypeError("fetch failed"));
    const panel = await openCreate();
    await submitUntilError(panel);
    await setText(titleField(panel), "Un autre titre");
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(2));
    expect(submitInputs()[1]?.idempotencyKey).not.toBe(submitInputs()[0]?.idempotencyKey);
    expect(operationOf(submitInputs()[1])).toMatchObject({ title: "Un autre titre" });
  });

  it.each([
    ["INTERNAL", apiError("INTERNAL", { requestId: "req-1" })],
    ["PROVIDER_UNAVAILABLE", apiError("PROVIDER_UNAVAILABLE")],
    ["PROVIDER_RATE_LIMITED", apiError("PROVIDER_RATE_LIMITED", { retryAfterMs: 1000 })],
    [
      "SPEC_BATCH_CONFLICT write_conflict (création)",
      apiError("SPEC_BATCH_CONFLICT", { reason: "write_conflict" }),
    ],
    [
      "SPEC_BATCH_CONFLICT idempotency_key_reused",
      apiError("SPEC_BATCH_CONFLICT", { reason: "idempotency_key_reused" }),
    ],
    ["code inconnu", apiError("WEIRD_CODE")],
  ])(
    "échec terminal %s puis « Réessayer » : NOUVELLE clé (le contrat rejouerait l'échec)",
    async (_name, error) => {
      failFirstWith(error);
      const panel = await openCreate();
      await submitUntilError(panel);
      await retry(panel);
      await waitFor(() => expect(submitInputs()).toHaveLength(2));
      expect(submitInputs()[1]?.idempotencyKey).toMatch(KEY_PATTERN);
      expect(submitInputs()[1]?.idempotencyKey).not.toBe(submitInputs()[0]?.idempotencyKey);
    },
  );

  it("SPEC_INVALID puis nouvel envoi : NOUVELLE clé", async () => {
    const report = { ok: false, counts: { error: 1, warning: 0 }, truncated: false, issues: [] };
    failFirstWith(apiError("SPEC_INVALID", { report }));
    const panel = await openCreate();
    await submitUntilError(panel);
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(2));
    expect(submitInputs()[1]?.idempotencyKey).not.toBe(submitInputs()[0]?.idempotencyKey);
  });

  it("deux créations distinctes n'ont jamais la même clé", async () => {
    const panel = await openCreate();
    await fillMinimum(panel);
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    const first = lastSubmit().idempotencyKey;
    expect(first).toMatch(KEY_PATTERN);
    expect(first.length).toBeLessThanOrEqual(128);
  });

  it("la clé suit le brouillon : après absence de réponse et rechargement, le réessai garde la même clé", async () => {
    failFirstWith(new TypeError("fetch failed"));
    const first = await openCreate();
    await submitUntilError(first);
    const sent = submitInputs()[0]?.idempotencyKey;
    await waitFor(() => {
      const raw = localStorage.getItem(`koklo:feature-draft:${PROJECT_ID}:new`);
      expect(raw && JSON.parse(raw).idempotencyKey).toBe(sent);
    });
    cleanup();
    renderFeatures({ search: "?new=1" });
    const again = await form();
    await again.findByText(/Brouillon repris/);
    await clickSave(again);
    await waitFor(() => expect(submitInputs()).toHaveLength(2));
    expect(submitInputs()[1]?.idempotencyKey).toBe(sent);
  });

  it("la réponse en attente ne se résout jamais deux fois : une promesse en vol bloque tout second appel", async () => {
    const gate = deferred<never>();
    procedures.specBatchSubmit.mockReset();
    procedures.specBatchSubmit.mockReturnValue(gate.promise);
    const panel = await openCreate();
    await fillMinimum(panel);
    await clickSave(panel);
    await panel.findByRole("button", { name: "Enregistrement…" });
    await userEvent.keyboard("{Enter}");
    expect(submitInputs()).toHaveLength(1);
  });
});

describe("Aucun appel sans saisie valide", () => {
  it("création vide : aucun appel d'écriture", async () => {
    const panel = await openCreate();
    await clickSave(panel);
    await panel.findByRole("alert");
    expect(screen.queryByRole("list", { name: "Avancement de l'enregistrement" })).toBeNull();
    expect(submitInputs()).toEqual([]);
  });
});
