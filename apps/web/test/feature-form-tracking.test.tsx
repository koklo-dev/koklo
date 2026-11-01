import { focusManager } from "@tanstack/react-query";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { draftKey, readPending, savePending } from "../src/lib/feature-draft.ts";
import {
  advance,
  BATCH_ID,
  batch,
  CREATED_ID,
  clickSave,
  committingBatch,
  conflictBatch,
  failedBatch,
  fillMinimum,
  form,
  indexCatchesUp,
  liveRegion,
  liveText,
  NEW_SHA,
  NEW_SHORT_SHA,
  NEW_TITLE,
  openCreate,
  openEdit,
  queuedBatch,
  serveWrite,
  setTabVisibility,
  setText,
  statusRegions,
  submitInputs,
  titleField,
  updatedBatch,
} from "./support/feature-form.tsx";
import {
  FEATURES,
  head,
  inputsOf,
  PROJECT_ID,
  renderFeatures,
  summary,
} from "./support/features.tsx";
import { findNamed } from "./support/wait.ts";
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
 * TK-48 / 48e, suivi du lot (S-feature-form §4.4 à §4.7, §5.6, §5.7, AC-48-25) avec minuteries simulées :
 * `specBatch.get` en backoff 1,5 s x1,5 plafonné à 5 s, arrêt à 60 s sans erreur factice, puis attente de
 * `spec.head.commitSha` (2 s, 30 s au plus), retour à la liste relue, suivi page fermée et rechargement.
 */
const SECOND = 1000;
const TOL = 400;
const user = () => userEvent.setup({ delay: null });

let headValue: ReturnType<typeof head>;
let headTimes: number[];
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
  headTimes = [];
  getTimes = [];
  getReply = () => queuedBatch();
  procedures.specHead.mockImplementation(async () => {
    headTimes.push(Date.now());
    return headValue;
  });
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

/** `specBatch.submit` répond (200) avec ce lot ; l'instant de la réponse sert de repère. */
function submitReplies(reply: unknown): void {
  procedures.specBatchSubmit.mockImplementation(async () => {
    submitTime = Date.now();
    return reply;
  });
}
const deltas = (times: number[]) => times.map((t) => t - submitTime);
const gaps = (times: number[]) => times.slice(1).map((t, i) => t - (times[i] as number));

async function fillAndSave(title = NEW_TITLE) {
  const panel = await openCreate(user());
  await fillMinimum(panel, title);
  await userEvent.setup({ delay: null }).click(panel.getByRole("button", { name: "Enregistrer" }));
  return panel;
}
const steps = (panel: ReturnType<typeof within>) =>
  within(panel.getByRole("list", { name: "Avancement de l'enregistrement" })).getAllByRole(
    "listitem",
  );

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Lot en attente : specBatch.get en backoff (§4.4)", () => {
  it("première relecture 1,5 s après la réponse, puis x1,5 : 2,25 s, 3,375 s, plafond 5 s", async () => {
    submitReplies(queuedBatch());
    await fillAndSave();
    await advance(1400);
    expect(getTimes).toHaveLength(0);
    await advance(55 * SECOND);
    const g = deltas(getTimes);
    expect(g[0]).toBeGreaterThanOrEqual(1500 - 50);
    expect(g[0]).toBeLessThan(1500 + TOL);
    const spacing = gaps(getTimes);
    expect(spacing[0]).toBeGreaterThanOrEqual(2250 - 50);
    expect(spacing[0]).toBeLessThan(2250 + TOL);
    expect(spacing[1]).toBeGreaterThanOrEqual(3375 - 50);
    expect(spacing[1]).toBeLessThan(3375 + TOL);
    for (const gap of spacing.slice(2)) {
      expect(gap).toBeGreaterThanOrEqual(5000 - 50);
      expect(gap).toBeLessThan(5000 + TOL);
    }
  });

  it("la relecture porte { projectId, batchId } et ne renvoie jamais un nouvel envoi", async () => {
    submitReplies(queuedBatch());
    await fillAndSave();
    await advance(2 * SECOND);
    expect(inputsOf(procedures.specBatchGet)[0]).toEqual({
      projectId: PROJECT_ID,
      batchId: BATCH_ID,
    });
    await advance(30 * SECOND);
    expect(submitInputs()).toHaveLength(1);
  });

  it("arrêt à 60 s après la réponse de l'envoi : plus aucune relecture", async () => {
    submitReplies(queuedBatch());
    await fillAndSave();
    await advance(62 * SECOND);
    const count = getTimes.length;
    expect(count).toBeGreaterThanOrEqual(12);
    expect(count).toBeLessThanOrEqual(14);
    expect(Math.max(...deltas(getTimes))).toBeLessThanOrEqual(60 * SECOND + TOL);
    await advance(60 * SECOND);
    expect(getTimes).toHaveLength(count);
  });

  it("onglet masqué : relectures suspendues ; onglet visible : reprise", async () => {
    submitReplies(queuedBatch());
    await fillAndSave();
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

  it("queued : « En attente de son tour. » (région d'état) et, à la création, « F-004 en cours de création. »", async () => {
    submitReplies(queuedBatch());
    const panel = await fillAndSave();
    await waitFor(() => expect(liveText()).toContain("En attente de son tour."));
    expect(liveText()).toContain(`${CREATED_ID} en cours de création.`);
    expect(steps(panel)[0]).toHaveTextContent(/Envoi.*Terminé/);
    expect(steps(panel)[1]).toHaveTextContent(/Écriture dans la spec.*En attente de son tour/);
    expect(steps(panel)[2]).toHaveTextContent(/Mise à jour de la liste.*À faire/);
  });

  it("committing : « Écriture en cours… » ; puis committed : étape 2 terminée, version connue de l'équipe", async () => {
    submitReplies(queuedBatch());
    getReply = () => committingBatch();
    const panel = await fillAndSave();
    await advance(2 * SECOND);
    await waitFor(() => expect(liveText()).toContain("Écriture en cours…"));
    expect(steps(panel)[1]).toHaveTextContent(/Écriture dans la spec.*Écriture en cours…/);
    getReply = () => batch();
    await advance(6 * SECOND);
    await waitFor(() => expect(steps(panel)[1]).toHaveTextContent(/Terminé/));
    expect(
      within(panel.getByRole("list", { name: "Avancement de l'enregistrement" })).getByLabelText(
        `Version de la spec ${NEW_SHORT_SHA}`,
      ),
    ).toBeVisible();
  });

  it("le suivi se termine dès que le lot est terminal : plus de relecture après committed", async () => {
    submitReplies(queuedBatch());
    getReply = () => batch();
    await fillAndSave();
    await advance(2 * SECOND);
    const count = getTimes.length;
    expect(count).toBe(1);
    await advance(30 * SECOND);
    expect(getTimes).toHaveLength(1);
  });
});

describe("Dépassement des 60 s : pas d'erreur (§4.4)", () => {
  const SLOW =
    "L'enregistrement prend plus de temps que prévu. Il continue sans vous : votre saisie est gardée.";

  it("message neutre, ni alerte ni texte rouge ; « Vérifier maintenant » et « Fermer » ; saisie et brouillon gardés", async () => {
    submitReplies(queuedBatch());
    const panel = await fillAndSave();
    await advance(61 * SECOND);
    expect(await panel.findByText(SLOW)).toBeVisible();
    expect(panel.queryByRole("alert")).toBeNull();
    expect(panel.getByRole("button", { name: "Vérifier maintenant" })).toBeVisible();
    expect(panel.getByRole("button", { name: "Fermer" })).toBeVisible();
    expect(titleField(panel)).toHaveValue(NEW_TITLE);
    expect(localStorage.getItem(draftKey(PROJECT_ID, "new"))).not.toBeNull();
    expect(statusRegions()).toHaveLength(1);
  });

  it("« Vérifier maintenant » relit tout de suite et ouvre une nouvelle fenêtre de suivi bornée", async () => {
    submitReplies(queuedBatch());
    const panel = await fillAndSave();
    await advance(61 * SECOND);
    const before = getTimes.length;
    await user().click(await panel.findByRole("button", { name: "Vérifier maintenant" }));
    await advance(100);
    expect(getTimes.length).toBeGreaterThan(before);
    await advance(8 * SECOND);
    const during = getTimes.length;
    expect(during).toBeGreaterThan(before + 1);
    await advance(70 * SECOND);
    const after = getTimes.length;
    await advance(30 * SECOND);
    expect(getTimes).toHaveLength(after);
  });

  it("le lot aboutit après le dépassement et « Vérifier maintenant » : la suite se déroule normalement", async () => {
    submitReplies(queuedBatch());
    const panel = await fillAndSave();
    await advance(61 * SECOND);
    indexCatchesUp();
    getReply = () => batch();
    await user().click(await panel.findByRole("button", { name: "Vérifier maintenant" }));
    await advance(3 * SECOND);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(liveText()).toContain(`${CREATED_ID} « ${NEW_TITLE} » créée.`);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Succès : attente de l'index puis retour à la liste (§4.5, §5.6)", () => {
  it("lot déjà committed à la réponse : aucune relecture du lot, version affichée, étape 3 « La liste se met à jour… »", async () => {
    submitReplies(batch());
    const panel = await fillAndSave();
    await waitFor(() => expect(steps(panel)[2]).toHaveTextContent(/La liste se met à jour…/));
    expect(steps(panel)[1]).toHaveTextContent(/Terminé/);
    expect(getTimes).toHaveLength(0);
    expect(panel.getByLabelText(`Version de la spec ${NEW_SHORT_SHA}`)).toBeVisible();
  });

  it("relit spec.head toutes les 2 s jusqu'à ce que son commitSha soit celui du lot", async () => {
    submitReplies(batch());
    await fillAndSave();
    await advance(1000);
    headTimes.length = 0;
    await advance(9 * SECOND);
    expect(headTimes.length).toBeGreaterThanOrEqual(3);
    expect(headTimes.length).toBeLessThanOrEqual(6);
    for (const gap of gaps(headTimes)) {
      expect(gap).toBeGreaterThanOrEqual(2000 - 100);
      expect(gap).toBeLessThan(2000 + TOL);
    }
  });

  it("index à jour : panneau fermé, annonce « F-004 « Titre » créée. » dans la région unique, liste relue du début", async () => {
    submitReplies(batch());
    await fillAndSave();
    await advance(3 * SECOND);
    indexCatchesUp();
    await advance(4 * SECOND);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(liveText()).toContain(`${CREATED_ID} « ${NEW_TITLE} » créée.`);
    expect(statusRegions()).toHaveLength(1);
    expect(window.location.search).not.toMatch(/new=|edit=/);
    const last = inputsOf(procedures.specListFeatures).at(-1) ?? {};
    expect(last).toMatchObject({ projectId: PROJECT_ID, limit: 50 });
    expect(last).not.toHaveProperty("cursor");
  });

  it("le bloc de confirmation : version de la spec (équipe), « Voir la fiche », « Fermer » ; jamais un toast", async () => {
    submitReplies(batch());
    await fillAndSave();
    indexCatchesUp();
    await advance(4 * SECOND);
    const region = liveRegion();
    await waitFor(() => expect(region).toHaveTextContent(`${CREATED_ID} « ${NEW_TITLE} » créée.`));
    expect(within(region).getByLabelText(`Version de la spec ${NEW_SHORT_SHA}`)).toBeVisible();
    expect(
      within(region).getByRole("link", { name: "Voir la fiche" }).getAttribute("href"),
    ).toMatch(new RegExp(`feature=${CREATED_ID}`));
    expect(within(region).getByRole("button", { name: "Fermer" })).toBeVisible();
  });

  it("le focus va sur le lien du titre de la ligne enregistrée", async () => {
    submitReplies(batch());
    await fillAndSave();
    indexCatchesUp();
    await advance(4 * SECOND);
    await waitFor(() => expect(screen.getByRole("link", { name: NEW_TITLE })).toHaveFocus());
  });

  it("les filtres de l'adresse sont gardés, le curseur est oublié", async () => {
    submitReplies(batch());
    renderFeatures({ search: "?priority=should&new=1" });
    const panel = await form();
    await fillMinimum(panel);
    await clickSave(panel);
    indexCatchesUp();
    await advance(5 * SECOND);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(new URLSearchParams(window.location.search).get("priority")).toBe("should");
    const last = inputsOf(procedures.specListFeatures).at(-1) ?? {};
    expect(last).toMatchObject({ priority: "should" });
    expect(last).not.toHaveProperty("cursor");
  });

  it("ligne hors de la liste affichée à cause des filtres : focus sur le h1 et « Elle n'apparaît pas avec les filtres actuels. »", async () => {
    submitReplies(batch());
    procedures.specListFeatures.mockResolvedValue({ items: [FEATURES[2]], nextCursor: null });
    renderFeatures({ search: "?status=adoptee&new=1" });
    const panel = await form();
    await fillMinimum(panel);
    await clickSave(panel);
    headValue = head({ commitSha: NEW_SHA });
    await advance(5 * SECOND);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "Fonctionnalités" })).toHaveFocus(),
    );
    expect(liveText()).toContain("Elle n'apparaît pas avec les filtres actuels.");
  });

  it("ligne plus loin que la première page : « Utilisez « Afficher plus de fonctionnalités » pour la voir. »", async () => {
    submitReplies(batch());
    procedures.specListFeatures.mockResolvedValue({
      items: [summary(1), summary(2)],
      nextCursor: "50",
    });
    renderFeatures({ search: "?new=1" });
    const panel = await form();
    await fillMinimum(panel);
    await clickSave(panel);
    headValue = head({ commitSha: NEW_SHA });
    await advance(5 * SECOND);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "Fonctionnalités" })).toHaveFocus(),
    );
    expect(liveText()).toContain("Utilisez « Afficher plus de fonctionnalités » pour la voir.");
  });

  it("le brouillon est supprimé dès que le lot est committed", async () => {
    submitReplies(batch());
    await fillAndSave();
    await waitFor(() => expect(localStorage.getItem(draftKey(PROJECT_ID, "new"))).toBeNull());
  });

  it("modification : « F-001 « Titre » enregistrée. »", async () => {
    submitReplies(updatedBatch("F-001"));
    const panel = await openEdit();
    await setText(titleField(panel), "Connexion modifiée");
    await clickSave(panel);
    headValue = head({ commitSha: NEW_SHA });
    procedures.specListFeatures.mockResolvedValue({
      items: [summary(1, { title: "Connexion modifiée" }), summary(2)],
      nextCursor: null,
    });
    await advance(5 * SECOND);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(liveText()).toContain("F-001 « Connexion modifiée » enregistrée.");
    expect(submitInputs()).toHaveLength(1);
  });

  it("l'index rattrape le commit mais passe en échec (spec_too_large) : écran de l'index en échec et phrase d'enregistrement", async () => {
    submitReplies(batch());
    await fillAndSave();
    headValue = head({ commitSha: NEW_SHA, status: "failed", errorCode: "spec_too_large" });
    procedures.specListFeatures.mockRejectedValue(
      apiError("SPEC_INDEX_FAILED", { errorCode: "spec_too_large" }),
    );
    await advance(5 * SECOND);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(liveText()).toContain(
      "Votre modification a été enregistrée, mais la spec n'a pas pu être relue.",
    );
    expect(await screen.findByText("La spec n'a pas pu être lue")).toBeVisible();
  });
});

describe("Index en retard (§4.6)", () => {
  it("après 30 s sans rattrapage : étape 3 « Pas encore à jour », phrase rassurante, aucune alerte", async () => {
    submitReplies(batch());
    const panel = await fillAndSave();
    await advance(31 * SECOND);
    await waitFor(() => expect(steps(panel)[2]).toHaveTextContent(/Pas encore à jour/));
    expect(
      panel.getByText(
        "Votre modification est enregistrée. La liste se mettra à jour dans un instant.",
      ),
    ).toBeVisible();
    expect(panel.queryByRole("alert")).toBeNull();
    expect(panel.getByRole("button", { name: "Actualiser la liste" })).toBeVisible();
    expect(panel.getByRole("button", { name: "Fermer" })).toBeVisible();
    expect(statusRegions()).toHaveLength(1);
  });

  it("jusque-là, spec.head est relu environ toutes les 2 s (borne 30 s)", async () => {
    submitReplies(batch());
    await fillAndSave();
    await advance(1000);
    headTimes.length = 0;
    await advance(29 * SECOND);
    expect(headTimes.length).toBeGreaterThanOrEqual(12);
    expect(headTimes.length).toBeLessThanOrEqual(16);
  });

  it("« Actualiser la liste » relit spec.head ; une fois à jour, retour à la liste", async () => {
    submitReplies(batch());
    const panel = await fillAndSave();
    await advance(31 * SECOND);
    // Erreur de test corrigée (Green 48e-1) : `indexCatchesUp()` remplace l'implémentation qui alimente
    // `headTimes`, qui ne peut donc plus grandir ; on compte les appels du mock lui-même.
    const before = procedures.specHead.mock.calls.length;
    indexCatchesUp();
    await user().click(await panel.findByRole("button", { name: "Actualiser la liste" }));
    await advance(3 * SECOND);
    expect(procedures.specHead.mock.calls.length).toBeGreaterThan(before);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(liveText()).toContain(`${CREATED_ID} « ${NEW_TITLE} » créée.`);
  });

  it("« Fermer » à ce stade ferme sans perdre l'information : le brouillon a déjà été supprimé", async () => {
    submitReplies(batch());
    const panel = await fillAndSave();
    await advance(31 * SECOND);
    await user().click(await panel.findByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(localStorage.getItem(draftKey(PROJECT_ID, "new"))).toBeNull();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Lot terminal en échec relu par specBatch.get (§4.7) : même rendu que l'erreur de submit", () => {
  const REPORT = {
    ok: false,
    counts: { error: 1, warning: 0 },
    truncated: false,
    issues: [
      {
        rule: 4,
        code: "unknown_screen",
        severity: "error",
        path: "x",
        pointer: "/screens/0",
        entityId: "S-x",
        message: "Écran inconnu",
      },
    ],
  };
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
      "failed / SPEC_INVALID",
      () => failedBatch("SPEC_INVALID", { report: REPORT }),
      "La spec obtenue ne serait pas valide",
    ],
    [
      "conflict / write_conflict",
      () => conflictBatch("write_conflict"),
      "La spec a bougé pendant l'enregistrement. Réessayez.",
    ],
    [
      "conflict / stale_base",
      () => conflictBatch("stale_base"),
      "La spec a changé depuis que vous avez ouvert ce formulaire",
    ],
  ])("%s", async (_name, terminal, expected) => {
    submitReplies(queuedBatch());
    getReply = terminal;
    const panel = await fillAndSave();
    await advance(2 * SECOND);
    const alert = await panel.findByRole("alert");
    expect(alert).toHaveTextContent(expected);
    expect(panel.getAllByRole("alert")).toHaveLength(1);
    expect(titleField(panel)).toHaveValue(NEW_TITLE);
    expect(localStorage.getItem(draftKey(PROJECT_ID, "new"))).not.toBeNull();
    const count = getTimes.length;
    await advance(20 * SECOND);
    expect(getTimes).toHaveLength(count);
  });

  it("étape 2 en échec : icône warning + texte « Non enregistré » (jamais la couleur seule)", async () => {
    submitReplies(queuedBatch());
    getReply = () => failedBatch("PROVIDER_UNAVAILABLE");
    const panel = await fillAndSave();
    await advance(2 * SECOND);
    await panel.findByRole("alert");
    expect(steps(panel)[1]).toHaveTextContent(/Non enregistré/);
  });

  it("après l'échec d'un lot, « Réessayer » prépare un nouvel envoi avec une NOUVELLE clé", async () => {
    submitReplies(queuedBatch());
    getReply = () => failedBatch("PROVIDER_UNAVAILABLE");
    const panel = await fillAndSave();
    await advance(2 * SECOND);
    await user().click(await panel.findByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(submitInputs()).toHaveLength(2));
    expect(submitInputs()[1]?.idempotencyKey).not.toBe(submitInputs()[0]?.idempotencyKey);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Suivi par la page, formulaire fermé (§5.7)", () => {
  it("« Fermer » pendant le suivi : le marqueur est posé, le bloc « Enregistrement de « Titre » en cours… » remplace la confirmation", async () => {
    submitReplies(queuedBatch());
    const panel = await fillAndSave();
    await advance(2 * SECOND);
    await user().click(panel.getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(liveText()).toContain(`Enregistrement de « ${NEW_TITLE} » en cours…`);
    expect(statusRegions()).toHaveLength(1);
    const marker = readPending(PROJECT_ID);
    expect(marker).toMatchObject({
      batchId: BATCH_ID,
      kind: "create",
      specId: CREATED_ID,
      title: NEW_TITLE,
    });
  });

  it("le suivi continue sans le panneau, puis la confirmation apparaît et le marqueur disparaît", async () => {
    submitReplies(queuedBatch());
    const panel = await fillAndSave();
    await advance(2 * SECOND);
    await user().click(panel.getByRole("button", { name: "Fermer" }));
    const before = getTimes.length;
    getReply = () => batch();
    indexCatchesUp();
    await advance(8 * SECOND);
    expect(getTimes.length).toBeGreaterThan(before);
    await waitFor(() => expect(liveText()).toContain(`${CREATED_ID} « ${NEW_TITLE} » créée.`));
    expect(readPending(PROJECT_ID)).toBeNull();
    expect(submitInputs()).toHaveLength(1);
  });

  it("même borne de 60 s, puis « Vérifier maintenant » dans le bloc de la page", async () => {
    submitReplies(queuedBatch());
    const panel = await fillAndSave();
    await advance(2 * SECOND);
    await user().click(panel.getByRole("button", { name: "Fermer" }));
    await advance(61 * SECOND);
    expect(await screen.findByRole("button", { name: "Vérifier maintenant" })).toBeVisible();
    expect(liveText()).toContain("L'enregistrement prend plus de temps que prévu.");
  });

  it("un nouveau formulaire pendant le suivi : « Enregistrer » désactivé, « Un enregistrement est déjà en cours. »", async () => {
    submitReplies(queuedBatch());
    const panel = await fillAndSave();
    await advance(2 * SECOND);
    await user().click(panel.getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user().click(await findNamed("button", "Nouvelle fonctionnalité"));
    const next = await form();
    const save = next.getByRole("button", { name: "Enregistrer" });
    expect(save).toBeDisabled();
    expect(save).toHaveAccessibleDescription("Un enregistrement est déjà en cours.");
  });

  it("échec pendant que le formulaire est fermé : bloc d'alerte au-dessus du tableau avec « Rouvrir le brouillon »", async () => {
    submitReplies(queuedBatch());
    const panel = await fillAndSave();
    await advance(2 * SECOND);
    await user().click(panel.getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    getReply = () => failedBatch("PROVIDER_UNAVAILABLE");
    await advance(8 * SECOND);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("GitHub est momentanément indisponible");
    await user().click(within(alert).getByRole("button", { name: "Rouvrir le brouillon" }));
    const reopened = await form();
    expect(titleField(reopened)).toHaveValue(NEW_TITLE);
    expect(readPending(PROJECT_ID)).toBeNull();
  });

  it("rechargement avec un marqueur : reprise par specBatch.get, jamais par un nouvel submit", async () => {
    expect(
      savePending(PROJECT_ID, {
        batchId: BATCH_ID,
        kind: "create",
        specId: CREATED_ID,
        title: NEW_TITLE,
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
    await waitFor(() =>
      expect(liveText()).toContain(`Enregistrement de « ${NEW_TITLE} » en cours…`),
    );
    getReply = () => batch();
    indexCatchesUp();
    await advance(6 * SECOND);
    await waitFor(() => expect(liveText()).toContain(`${CREATED_ID} « ${NEW_TITLE} » créée.`));
    expect(procedures.specBatchSubmit).not.toHaveBeenCalled();
    expect(readPending(PROJECT_ID)).toBeNull();
  });

  it("marqueur périmé (plus de 24 h) : ignoré, supprimé, aucune relecture", async () => {
    savePending(PROJECT_ID, {
      batchId: BATCH_ID,
      kind: "create",
      title: NEW_TITLE,
      savedAt: new Date(Date.now() - 25 * 3600 * 1000).toISOString(),
    });
    renderFeatures();
    await findNamed("table", /^Fonctionnalités du projet/, { text: "Connexion par e-mail" });
    expect(procedures.specBatchGet).not.toHaveBeenCalled();
    expect(localStorage.getItem(`koklo:feature-pending:${PROJECT_ID}`)).toBeNull();
    expect(liveText()).not.toContain("en cours…");
  });

  it("un marqueur d'un autre projet n'est jamais relu", async () => {
    savePending("7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b02", {
      batchId: BATCH_ID,
      kind: "create",
      title: NEW_TITLE,
      savedAt: new Date().toISOString(),
    });
    renderFeatures();
    await findNamed("table", /^Fonctionnalités du projet/, { text: "Connexion par e-mail" });
    expect(procedures.specBatchGet).not.toHaveBeenCalled();
  });

  it("client : un marqueur laissé sur l'appareil n'affiche rien et ne relit rien", async () => {
    serveWrite("client");
    savePending(PROJECT_ID, {
      batchId: BATCH_ID,
      kind: "create",
      title: NEW_TITLE,
      savedAt: new Date().toISOString(),
    });
    procedures.specHead.mockImplementation(async () => head());
    renderFeatures();
    await findNamed("table", /^Fonctionnalités du projet/, { text: "Connexion par e-mail" });
    expect(procedures.specBatchGet).not.toHaveBeenCalled();
    expect(liveText()).not.toContain("en cours…");
    cleanup();
  });
});
