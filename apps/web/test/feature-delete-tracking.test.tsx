import { focusManager } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  draftKey,
  readDraft,
  readPending,
  saveDraft,
  savePending,
} from "../src/lib/feature-draft.ts";
import { valuesFromDetail } from "../src/lib/feature-form.ts";
import {
  advance,
  BATCH_ID,
  committingBatch,
  confirmDelete,
  conflictBatch,
  DETAIL_TYPED,
  deletedBatch,
  deleteF001,
  failedBatch,
  indexCatchesUpAfterDelete,
  liveRegion,
  liveText,
  NEW_SHA,
  NEW_SHORT_SHA,
  queuedBatch,
  serveWrite,
  setTabVisibility,
  statusRegions,
  submitInputs,
} from "./support/feature-form.tsx";
import {
  FEATURES,
  head,
  inputsOf,
  PROJECT_ID,
  renderFeatures,
  SCOPE,
  SHA,
} from "./support/features.tsx";
import { findNamed } from "./support/wait.ts";
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

/**
 * TK-48 / 48e-2, suivi d'une suppression (S-feature-form §4.4 à §4.7, §5.6, §5.7, AC-48-25) avec minuteries
 * simulées : le même suivi que l'écriture (backoff 1,5 s x1,5 plafonné à 5 s, arrêt à 60 s, puis attente de
 * l'index 2 s / 30 s), mais avec les textes de la suppression, la disparition de la ligne de la liste relue,
 * le focus sur le h1 et l'effacement du brouillon et du marqueur de la fonctionnalité supprimée.
 */
const SECOND = 1000;
const TOL = 400;
const user = () => userEvent.setup({ delay: null });

let headValue: ReturnType<typeof head>;
let getTimes: number[];
let submitTime = 0;
let getReply: () => unknown;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
  setTabVisibility(true);
  serveWrite();
  headValue = head();
  getTimes = [];
  getReply = () => queuedBatch();
  procedures.specHead.mockImplementation(async () => headValue);
  procedures.specBatchGet.mockImplementation(async () => {
    getTimes.push(Date.now());
    return getReply();
  });
});

afterEach(() => {
  setTabVisibility(true);
  focusManager.setFocused(true);
  vi.useRealTimers();
});

function submitReplies(reply: unknown): void {
  procedures.specBatchSubmit.mockImplementation(async () => {
    submitTime = Date.now();
    return reply;
  });
}
const deltas = (times: number[]) => times.map((t) => t - submitTime);
const gaps = (times: number[]) => times.slice(1).map((t, i) => t - (times[i] as number));
const steps = (panel: ReturnType<typeof within>) =>
  within(panel.getByRole("list", { name: "Avancement de l'enregistrement" })).getAllByRole(
    "listitem",
  );
const TITLE = "Connexion par e-mail";

/** Ouvre F-001, confirme la suppression ; le suivi commence. */
const startDelete = () => deleteF001(user());
const catchUp = async (ms = 4 * SECOND) => {
  indexCatchesUpAfterDelete();
  headValue = head({ commitSha: NEW_SHA });
  await advance(ms);
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Lot de suppression en attente : même backoff que l'écriture (§4.4)", () => {
  it("première relecture 1,5 s après la réponse, puis x1,5 plafonné à 5 s ; { projectId, batchId } ; jamais un second envoi", async () => {
    submitReplies(queuedBatch({ results: deletedBatch().results }));
    await startDelete();
    await advance(1400);
    expect(getTimes).toHaveLength(0);
    await advance(30 * SECOND);
    expect(deltas(getTimes)[0]).toBeGreaterThanOrEqual(1500 - 50);
    expect(deltas(getTimes)[0]).toBeLessThan(1500 + TOL);
    const spacing = gaps(getTimes);
    expect(spacing[0]).toBeGreaterThanOrEqual(2250 - 50);
    expect(spacing[1]).toBeGreaterThanOrEqual(3375 - 50);
    for (const gap of spacing.slice(2)) expect(gap).toBeLessThan(5000 + TOL);
    expect(inputsOf(procedures.specBatchGet)[0]).toEqual({
      projectId: PROJECT_ID,
      batchId: BATCH_ID,
    });
    expect(submitInputs()).toHaveLength(1);
  });

  it("arrêt à 60 s sans erreur factice : message neutre, « Vérifier maintenant », saisie gardée", async () => {
    submitReplies(queuedBatch());
    const panel = await startDelete();
    await advance(61 * SECOND);
    expect(
      await panel.findByText(
        "L'enregistrement prend plus de temps que prévu. Il continue sans vous : votre saisie est gardée.",
      ),
    ).toBeVisible();
    expect(panel.queryByRole("alert")).toBeNull();
    expect(panel.getByRole("button", { name: "Vérifier maintenant" })).toBeVisible();
    const count = getTimes.length;
    await advance(60 * SECOND);
    expect(getTimes).toHaveLength(count);
    expect(statusRegions()).toHaveLength(1);
  });

  it("queued : « En attente de son tour. » et « F-001 en cours de suppression. » (région d'état), étape 2 « En attente de son tour »", async () => {
    submitReplies(queuedBatch());
    const panel = await startDelete();
    await waitFor(() => expect(liveText()).toContain("En attente de son tour."));
    expect(liveText()).toContain("F-001 en cours de suppression.");
    expect(steps(panel)[0]).toHaveTextContent(/Envoi.*Terminé/);
    expect(steps(panel)[1]).toHaveTextContent(/Écriture dans la spec.*En attente de son tour/);
    expect(steps(panel)[2]).toHaveTextContent(/Mise à jour de la liste.*À faire/);
  });

  it("committing : « Suppression en cours… » (étape 2 et région), puis committed : étape 2 terminée, version connue de l'équipe", async () => {
    submitReplies(queuedBatch());
    getReply = () => committingBatch();
    const panel = await startDelete();
    await advance(2 * SECOND);
    await waitFor(() => expect(liveText()).toContain("Suppression en cours…"));
    expect(steps(panel)[1]).toHaveTextContent(/Écriture dans la spec.*Suppression en cours…/);
    getReply = () => deletedBatch();
    await advance(6 * SECOND);
    await waitFor(() => expect(steps(panel)[1]).toHaveTextContent(/Terminé/));
    expect(
      within(panel.getByRole("list", { name: "Avancement de l'enregistrement" })).getByLabelText(
        `Version de la spec ${NEW_SHORT_SHA}`,
      ),
    ).toBeVisible();
  });

  it("onglet masqué : relectures suspendues ; visible : reprise", async () => {
    submitReplies(queuedBatch());
    await startDelete();
    await advance(2 * SECOND);
    setTabVisibility(false);
    focusManager.setFocused(false);
    await advance(100);
    const before = getTimes.length;
    await advance(20 * SECOND);
    expect(getTimes.length).toBe(before);
    setTabVisibility(true);
    focusManager.setFocused(true);
    await advance(6 * SECOND);
    expect(getTimes.length).toBeGreaterThan(before);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Succès : la fonctionnalité disparaît de la liste relue (§4.5, §5.6)", () => {
  it("lot déjà committed : aucune relecture du lot, étape 3 « La liste se met à jour… », spec.head relu toutes les 2 s", async () => {
    submitReplies(deletedBatch());
    const panel = await startDelete();
    await waitFor(() => expect(steps(panel)[2]).toHaveTextContent(/La liste se met à jour…/));
    expect(steps(panel)[1]).toHaveTextContent(/Terminé/);
    expect(getTimes).toHaveLength(0);
    const before = procedures.specHead.mock.calls.length;
    await advance(9 * SECOND);
    const reads = procedures.specHead.mock.calls.length - before;
    expect(reads).toBeGreaterThanOrEqual(3);
    expect(reads).toBeLessThanOrEqual(6);
  });

  it("tant que l'index n'a pas rattrapé le commit, la ligne reste et rien n'est annoncé comme supprimé", async () => {
    submitReplies(deletedBatch());
    await startDelete();
    await advance(6 * SECOND);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(liveText()).not.toContain("supprimée.");
  });

  it("index à jour : panneau fermé, « F-001 supprimée. » dans la région unique, liste relue du début SANS F-001", async () => {
    submitReplies(deletedBatch());
    await startDelete();
    await advance(3 * SECOND);
    await catchUp();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(liveText()).toContain("F-001 supprimée.");
    expect(statusRegions()).toHaveLength(1);
    expect(window.location.search).not.toMatch(/new=|edit=/);
    const last = inputsOf(procedures.specListFeatures).at(-1) ?? {};
    expect(last).toMatchObject({ projectId: PROJECT_ID, limit: 50 });
    expect(last).not.toHaveProperty("cursor");
    await waitFor(() => expect(screen.queryByRole("link", { name: TITLE })).toBeNull());
    expect(screen.getByRole("link", { name: "Tableau kanban" })).toBeVisible();
  });

  it("le bloc de confirmation : version de la spec (équipe) et « Fermer » ; ni « Voir la fiche » (elle n'existe plus) ni toast", async () => {
    submitReplies(deletedBatch());
    await startDelete();
    await catchUp();
    const region = liveRegion();
    await waitFor(() => expect(region).toHaveTextContent("F-001 supprimée."));
    expect(within(region).getByLabelText(`Version de la spec ${NEW_SHORT_SHA}`)).toBeVisible();
    expect(within(region).queryByRole("link", { name: "Voir la fiche" })).toBeNull();
    expect(within(region).getByRole("button", { name: "Fermer" })).toBeVisible();
    await user().click(within(region).getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(liveText()).not.toContain("supprimée."));
    expect(statusRegions()).toHaveLength(1);
  });

  it("focus sur le titre h1 de la page (la ligne n'existe plus)", async () => {
    submitReplies(deletedBatch());
    await startDelete();
    await catchUp();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "Fonctionnalités" })).toHaveFocus(),
    );
  });

  it("les filtres de l'adresse sont gardés, le curseur est oublié", async () => {
    submitReplies(deletedBatch());
    renderFeatures({ search: "?priority=must&edit=F-001" });
    const panel = await findNamed("dialog", "Modifier F-001", { text: "Modifier F-001" }).then(
      (d) => within(d),
    );
    await panel.findByDisplayValue(TITLE);
    await confirmDelete(panel, user());
    await catchUp(5 * SECOND);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(new URLSearchParams(window.location.search).get("priority")).toBe("must");
    const last = inputsOf(procedures.specListFeatures).at(-1) ?? {};
    expect(last).toMatchObject({ priority: "must" });
    expect(last).not.toHaveProperty("cursor");
  });

  it("le brouillon de F-001 (cette organisation, ce compte) est effacé dès que le lot est committed", async () => {
    const before = valuesFromDetail(DETAIL_TYPED);
    saveDraft(SCOPE, PROJECT_ID, "F-001", {
      values: { ...before, title: "Titre du brouillon" },
      baseline: before,
      baseCommitSha: SHA,
      idempotencyKey: null,
      savedAt: new Date().toISOString(),
    });
    submitReplies(deletedBatch());
    renderFeatures({ search: "?edit=F-001" });
    const panel = await findNamed("dialog", "Modifier F-001", { text: "Modifier F-001" }).then(
      (d) => within(d),
    );
    await panel.findByText(/Brouillon repris/);
    await confirmDelete(panel, user());
    await waitFor(() => expect(localStorage.getItem(draftKey(PROJECT_ID, "F-001"))).toBeNull());
    expect(readDraft(SCOPE, PROJECT_ID, "F-001")).toBeNull();
  });

  it("le brouillon d'une AUTRE fonctionnalité et celui de la création ne sont pas touchés", async () => {
    saveDraft(SCOPE, PROJECT_ID, "new", {
      values: valuesFromDetail(DETAIL_TYPED),
      baseline: null,
      baseCommitSha: null,
      idempotencyKey: null,
      savedAt: new Date().toISOString(),
    });
    submitReplies(deletedBatch());
    await startDelete();
    await catchUp();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(readDraft(SCOPE, PROJECT_ID, "new")).not.toBeNull();
  });

  it("le marqueur de suivi est supprimé à la fin", async () => {
    submitReplies(queuedBatch());
    await startDelete();
    await advance(2 * SECOND);
    expect(readPending(SCOPE, PROJECT_ID)).toMatchObject({ kind: "delete", specId: "F-001" });
    getReply = () => deletedBatch();
    await catchUp(8 * SECOND);
    await waitFor(() => expect(readPending(SCOPE, PROJECT_ID)).toBeNull());
  });

  it("l'index rattrape le commit mais passe en échec : phrase d'enregistrement et écran de l'index en échec", async () => {
    submitReplies(deletedBatch());
    await startDelete();
    headValue = head({ commitSha: NEW_SHA, status: "failed", errorCode: "spec_too_large" });
    await advance(5 * SECOND);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(liveText()).toContain(
      "Votre modification a été enregistrée, mais la spec n'a pas pu être relue.",
    );
  });

  it("jamais de vocabulaire de git dans l'annonce (hors « Version de la spec » réservée à l'équipe)", async () => {
    submitReplies(deletedBatch());
    await startDelete();
    await catchUp();
    await waitFor(() => expect(liveText()).toContain("F-001 supprimée."));
    expect(liveText().replace(/Version de la spec \S+/g, "")).not.toMatch(
      /\blot\b|commit|branche|\bSHA\b|idempoten|payload/i,
    );
  });
});

describe("Index en retard (§4.6)", () => {
  it("après 30 s : « Pas encore à jour », phrase rassurante, « Actualiser la liste » ; la ligne reste tant que l'index n'a pas suivi", async () => {
    submitReplies(deletedBatch());
    const panel = await startDelete();
    await advance(31 * SECOND);
    await waitFor(() => expect(steps(panel)[2]).toHaveTextContent(/Pas encore à jour/));
    expect(
      panel.getByText(
        "Votre modification est enregistrée. La liste se mettra à jour dans un instant.",
      ),
    ).toBeVisible();
    expect(panel.queryByRole("alert")).toBeNull();
    await user().click(panel.getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("link", { name: TITLE })).toBeVisible();
  });

  it("fermé en état « pas encore à jour » : la page relit encore, puis « F-001 supprimée. » et la ligne disparaît", async () => {
    submitReplies(deletedBatch());
    const panel = await startDelete();
    await advance(31 * SECOND);
    await user().click(await panel.findByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await advance(20 * SECOND);
    await catchUp(6 * SECOND);
    await waitFor(() => expect(liveText()).toContain("F-001 supprimée."));
    expect(screen.queryByRole("link", { name: TITLE })).toBeNull();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Lot terminal en échec relu par specBatch.get : même rendu que l'erreur de submit (§4.7)", () => {
  it.each([
    [
      "failed / PROVIDER_UNAVAILABLE",
      () => failedBatch("PROVIDER_UNAVAILABLE"),
      "GitHub est momentanément indisponible",
    ],
    [
      "failed / PROVIDER_RATE_LIMITED",
      () => failedBatch("PROVIDER_RATE_LIMITED"),
      "Trop de demandes pour le moment",
    ],
    [
      "failed / PROVIDER_AUTH_EXPIRED",
      () => failedBatch("PROVIDER_AUTH_EXPIRED"),
      "Koklo n'a plus accès au dépôt de spec",
    ],
    [
      "failed / INTERNAL",
      () => failedBatch("INTERNAL"),
      "Nous ne savons pas si l'enregistrement a abouti",
    ],
    [
      "failed / FORBIDDEN",
      () => failedBatch("FORBIDDEN"),
      "Vous n'avez pas le droit d'enregistrer dans la spec.",
    ],
    [
      "failed / SPEC_INVALID",
      () =>
        failedBatch("SPEC_INVALID", {
          report: {
            ok: false,
            counts: { error: 1, warning: 0 },
            truncated: false,
            issues: [
              {
                rule: 7,
                code: "dangling_reference",
                severity: "error",
                path: "scenarios/TS-001.md",
                pointer: "/features/0",
                entityId: "TS-001",
                message: "Le scénario TS-001 renvoie à F-001.",
              },
            ],
          },
        }),
      "La spec obtenue ne serait pas valide",
    ],
    [
      "conflict / stale_base",
      () => conflictBatch("stale_base"),
      "La spec a changé depuis que vous avez ouvert ce formulaire",
    ],
    [
      "conflict / write_conflict",
      () => conflictBatch("write_conflict"),
      "Cette fonctionnalité a changé ou n'existe plus dans la spec",
    ],
  ])("%s", async (_name, terminal, expected) => {
    submitReplies(queuedBatch());
    getReply = terminal;
    const panel = await startDelete();
    await advance(2 * SECOND);
    const alert = await panel.findByRole("alert");
    expect(alert).toHaveTextContent(expected);
    expect(panel.getAllByRole("alert")).toHaveLength(1);
    expect(panel.queryByRole("group", { name: "Confirmer la suppression" })).toBeNull();
    expect(readDraft(SCOPE, PROJECT_ID, "F-001")).toBeNull();
    expect(screen.getByRole("dialog")).toBeVisible();
    const count = getTimes.length;
    await advance(20 * SECOND);
    expect(getTimes).toHaveLength(count);
    expect(procedures.specListFeatures.mock.calls.length).toBeGreaterThan(0);
  });

  it("étape 2 en échec : « Non enregistré » (icône + texte), la fonctionnalité reste dans la liste, le marqueur est effacé", async () => {
    submitReplies(queuedBatch());
    getReply = () => failedBatch("PROVIDER_UNAVAILABLE");
    const panel = await startDelete();
    await advance(2 * SECOND);
    await panel.findByRole("alert");
    expect(steps(panel)[1]).toHaveTextContent(/Non enregistré/);
    expect(readPending(SCOPE, PROJECT_ID)).toBeNull();
    expect(liveText()).not.toContain("supprimée.");
  });

  it("après l'échec d'un lot, « Réessayer » renvoie la suppression avec une NOUVELLE clé et le même baseSha", async () => {
    submitReplies(queuedBatch());
    getReply = () => failedBatch("PROVIDER_UNAVAILABLE");
    const panel = await startDelete();
    await advance(2 * SECOND);
    await user().click(await panel.findByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(submitInputs()).toHaveLength(2));
    expect(submitInputs()[1]?.idempotencyKey).not.toBe(submitInputs()[0]?.idempotencyKey);
    expect(submitInputs()[1]?.operations).toEqual([{ kind: "feature.delete", specId: "F-001" }]);
    expect(submitInputs()[1]?.baseSha).toBe(SHA);
  });

  it("lot failed/INTERNAL relu par get : « Réessayer » prend une NOUVELLE clé (échec connu)", async () => {
    submitReplies(queuedBatch());
    getReply = () => failedBatch("INTERNAL");
    const panel = await startDelete();
    await advance(2 * SECOND);
    await user().click(await panel.findByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(submitInputs()).toHaveLength(2));
    expect(submitInputs()[1]?.idempotencyKey).not.toBe(submitInputs()[0]?.idempotencyKey);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Suivi par la page, formulaire fermé (§5.7)", () => {
  it("« Fermer » pendant le suivi : marqueur kind « delete » posé, bloc « Suppression de « Titre » en cours… »", async () => {
    submitReplies(queuedBatch());
    const panel = await startDelete();
    await advance(2 * SECOND);
    await user().click(panel.getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(liveText()).toContain(`Suppression de « ${TITLE} » en cours…`);
    expect(statusRegions()).toHaveLength(1);
    expect(readPending(SCOPE, PROJECT_ID)).toMatchObject({
      batchId: BATCH_ID,
      kind: "delete",
      specId: "F-001",
      title: TITLE,
    });
  });

  it("le suivi continue sans le panneau ; la confirmation apparaît, la ligne disparaît, un seul envoi", async () => {
    submitReplies(queuedBatch());
    const panel = await startDelete();
    await advance(2 * SECOND);
    await user().click(panel.getByRole("button", { name: "Fermer" }));
    getReply = () => deletedBatch();
    await catchUp(8 * SECOND);
    await waitFor(() => expect(liveText()).toContain("F-001 supprimée."));
    expect(readPending(SCOPE, PROJECT_ID)).toBeNull();
    expect(screen.queryByRole("link", { name: TITLE })).toBeNull();
    expect(submitInputs()).toHaveLength(1);
    expect(readDraft(SCOPE, PROJECT_ID, "F-001")).toBeNull();
  });

  it("échec pendant que le formulaire est fermé : bloc d'alerte au-dessus du tableau, la fonctionnalité reste", async () => {
    submitReplies(queuedBatch());
    const panel = await startDelete();
    await advance(2 * SECOND);
    await user().click(panel.getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    getReply = () => failedBatch("PROVIDER_UNAVAILABLE");
    await advance(8 * SECOND);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("GitHub est momentanément indisponible");
    expect(screen.getByRole("link", { name: TITLE })).toBeVisible();
    expect(readPending(SCOPE, PROJECT_ID)).toBeNull();
  });

  it("rechargement avec un marqueur de suppression : reprise par specBatch.get, jamais par un nouvel submit", async () => {
    expect(
      savePending(SCOPE, PROJECT_ID, {
        batchId: BATCH_ID,
        kind: "delete",
        specId: "F-001",
        title: TITLE,
        savedAt: new Date().toISOString(),
      }),
    ).toBe(true);
    getReply = () => committingBatch();
    renderFeatures();
    await waitFor(() => expect(procedures.specBatchGet).toHaveBeenCalled());
    expect(inputsOf(procedures.specBatchGet)[0]).toEqual({
      projectId: PROJECT_ID,
      batchId: BATCH_ID,
    });
    expect(procedures.specBatchSubmit).not.toHaveBeenCalled();
    await waitFor(() => expect(liveText()).toContain(`Suppression de « ${TITLE} » en cours…`));
    getReply = () => deletedBatch();
    await catchUp(6 * SECOND);
    await waitFor(() => expect(liveText()).toContain("F-001 supprimée."));
    expect(procedures.specBatchSubmit).not.toHaveBeenCalled();
    expect(readPending(SCOPE, PROJECT_ID)).toBeNull();
  });

  it("cloisonnement : le marqueur d'un autre compte ou d'une autre organisation n'est jamais relu et est supprimé", async () => {
    savePending({ ...SCOPE, userId: "autre-compte" }, PROJECT_ID, {
      batchId: BATCH_ID,
      kind: "delete",
      specId: "F-001",
      title: TITLE,
      savedAt: new Date().toISOString(),
    });
    renderFeatures();
    await findNamed("table", /^Fonctionnalités du projet/, { text: TITLE });
    expect(procedures.specBatchGet).not.toHaveBeenCalled();
    expect(liveText()).not.toContain("Suppression de");
    expect(localStorage.getItem(`koklo:feature-pending:${PROJECT_ID}`)).toBeNull();
  });

  it("marqueur périmé (plus de 24 h) ou d'un autre projet : ignoré", async () => {
    savePending(SCOPE, PROJECT_ID, {
      batchId: BATCH_ID,
      kind: "delete",
      specId: "F-001",
      title: TITLE,
      savedAt: new Date(Date.now() - 25 * 3600 * 1000).toISOString(),
    });
    savePending(SCOPE, "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b02", {
      batchId: BATCH_ID,
      kind: "delete",
      specId: "F-001",
      title: TITLE,
      savedAt: new Date().toISOString(),
    });
    renderFeatures();
    await findNamed("table", /^Fonctionnalités du projet/, { text: TITLE });
    expect(procedures.specBatchGet).not.toHaveBeenCalled();
  });

  it("client : un marqueur de suppression laissé sur l'appareil n'affiche rien et ne relit rien", async () => {
    serveWrite("client");
    procedures.specHead.mockImplementation(async () => head());
    savePending(SCOPE, PROJECT_ID, {
      batchId: BATCH_ID,
      kind: "delete",
      specId: "F-001",
      title: TITLE,
      savedAt: new Date().toISOString(),
    });
    renderFeatures();
    await findNamed("table", /^Fonctionnalités du projet/, { text: TITLE });
    expect(procedures.specBatchGet).not.toHaveBeenCalled();
    expect(liveText()).not.toContain("Suppression de");
  });

  it("seules les deux autres lignes restent dans la liste relue", async () => {
    submitReplies(deletedBatch());
    await startDelete();
    await catchUp();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const table = await findNamed("table", /^Fonctionnalités du projet/, {
      text: "Tableau kanban",
    });
    expect(within(table).getByText("Export des tickets")).toBeVisible();
    expect(within(table).getAllByRole("link")).toHaveLength(FEATURES.length - 1);
  });
});
