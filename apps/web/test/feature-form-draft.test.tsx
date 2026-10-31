import { SidebarProvider } from "@koklo/ui";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavUser } from "../src/components/nav-user.tsx";
import { OrganizationsPage } from "../src/components/organizations-page.tsx";
import { draftKey, saveDraft, savePending } from "../src/lib/feature-draft.ts";
import { EMPTY_VALUES, valuesFromDetail } from "../src/lib/feature-form.ts";
import {
  advance,
  clickSave,
  DETAIL_TYPED as DETAIL,
  fillMinimum,
  form,
  liveText,
  openCreate,
  openEdit,
  operationOf,
  serveWrite,
  setText,
  statusRegions,
  submitInputs,
  titleField,
} from "./support/feature-form.tsx";
import { head, PROJECT_ID, renderFeatures, SHA } from "./support/features.tsx";
import { renderWithQuery } from "./support/render.tsx";
import { findNamed } from "./support/wait.ts";
import {
  polyfillRadix,
  procedures,
  resetWebMocks,
  signOut,
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
 * TK-48 / 48e, brouillon (S-feature-form §5.5, §4.9) : sauvegarde automatique locale 500 ms après la dernière
 * frappe, reprise avec bandeau, abandon avec confirmation en ligne, fonctionnalité changée depuis le
 * brouillon, `localStorage` indisponible, effacement à la déconnexion.
 */
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
  serveWrite();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const NEW_KEY = draftKey(PROJECT_ID, "new");
const EDIT_KEY = draftKey(PROJECT_ID, "F-001");
const stored = (key: string) => {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
};
const OLD_SHA = "a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0";
const CONFIRM = "Abandonner ce brouillon ? Votre saisie sera effacée.";

async function reopenNew() {
  cleanup();
  renderFeatures({ search: "?new=1" });
  return form();
}
async function typeThenClose() {
  const panel = await openCreate(userEvent.setup({ delay: null }));
  await fillMinimum(panel, "Brouillon en cours");
  await advance(700);
  await userEvent.setup({ delay: null }).click(panel.getByRole("button", { name: "Fermer" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Sauvegarde automatique", () => {
  it("écrite 500 ms après la dernière frappe, pas avant", async () => {
    const panel = await openCreate(userEvent.setup({ delay: null }));
    await userEvent.setup({ delay: null }).type(titleField(panel), "Début");
    await advance(300);
    expect(stored(NEW_KEY)).toBeNull();
    await advance(400);
    expect(stored(NEW_KEY)?.values?.title).toBe("Début");
  });

  it("chaque frappe repousse l'écriture (anti-rebond)", async () => {
    const panel = await openCreate(userEvent.setup({ delay: null }));
    const u = userEvent.setup({ delay: null });
    await u.type(titleField(panel), "a");
    await advance(400);
    await u.type(titleField(panel), "b");
    await advance(400);
    expect(stored(NEW_KEY)).toBeNull();
    await advance(200);
    expect(stored(NEW_KEY)?.values?.title).toBe("ab");
  });

  it("clé koklo:feature-draft:<projectId>:new ; contenu : valeurs, référence, version, clé, date", async () => {
    const panel = await openCreate(userEvent.setup({ delay: null }));
    await fillMinimum(panel, "Contenu");
    await advance(700);
    const draft = stored(NEW_KEY);
    expect(draft).toMatchObject({ baseline: null, baseCommitSha: null, idempotencyKey: null });
    expect(draft.values).toMatchObject({ title: "Contenu", priority: "should" });
    expect(Number.isNaN(Date.parse(draft.savedAt))).toBe(false);
  });

  it("en modification : clé koklo:feature-draft:<projectId>:F-001 avec la référence lue et sa version", async () => {
    const panel = await openEdit();
    await setText(titleField(panel), "Titre modifié");
    await advance(700);
    const draft = stored(EDIT_KEY);
    expect(draft.values.title).toBe("Titre modifié");
    expect(draft.baseline.title).toBe("Connexion par e-mail");
    expect(draft.baseCommitSha).toBe(SHA);
  });

  it("rien n'est écrit tant que la saisie ne diffère pas de la référence", async () => {
    await openCreate(userEvent.setup({ delay: null }));
    await advance(2000);
    expect(stored(NEW_KEY)).toBeNull();
    cleanup();
    await openEdit();
    await advance(2000);
    expect(stored(EDIT_KEY)).toBeNull();
  });

  it("aucune annonce à chaque sauvegarde (bruit pour un lecteur d'écran)", async () => {
    const panel = await openCreate(userEvent.setup({ delay: null }));
    const before = liveText();
    await userEvent.setup({ delay: null }).type(titleField(panel), "Quelque chose");
    await advance(700);
    expect(liveText()).toBe(before);
    expect(liveText()).not.toMatch(/brouillon|enregistr/i);
  });

  it("revenir à la référence efface le brouillon qui n'a plus lieu d'être", async () => {
    const panel = await openEdit();
    await setText(titleField(panel), "Autre");
    await advance(700);
    expect(stored(EDIT_KEY)).not.toBeNull();
    await setText(titleField(panel), "Connexion par e-mail");
    await advance(700);
    expect(stored(EDIT_KEY)).toBeNull();
  });
});

describe("Fermer et reprendre", () => {
  it("fermer avec un brouillon : « Brouillon gardé sur cet appareil. » dans la région d'état, sans confirmation", async () => {
    await typeThenClose();
    expect(liveText()).toContain("Brouillon gardé sur cet appareil.");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(stored(NEW_KEY)).not.toBeNull();
  });

  it("fermer sans rien saisir : aucune annonce de brouillon", async () => {
    const panel = await openCreate(userEvent.setup({ delay: null }));
    await userEvent.setup({ delay: null }).click(panel.getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(liveText()).not.toContain("Brouillon gardé");
  });

  it("Échap garde aussi le brouillon", async () => {
    const panel = await openCreate(userEvent.setup({ delay: null }));
    await fillMinimum(panel, "Au clavier");
    await advance(700);
    await userEvent.setup({ delay: null }).keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(liveText()).toContain("Brouillon gardé sur cet appareil.");
  });

  it("à la réouverture : bandeau « Brouillon repris, enregistré le … », champs restaurés, une seule région d'état", async () => {
    await typeThenClose();
    const panel = await reopenNew();
    expect(await panel.findByText(/^Brouillon repris, enregistré le .+\.$/)).toBeVisible();
    expect(titleField(panel)).toHaveValue("Brouillon en cours");
    expect(panel.getByRole("combobox", { name: "Priorité (obligatoire)" })).toHaveTextContent(
      "Importante",
    );
    expect(panel.getByRole("button", { name: "Abandonner le brouillon" })).toBeVisible();
    expect(statusRegions()).toHaveLength(1);
  });

  it("le brouillon est propre à la cible : celui de « new » n'apparaît pas en modification", async () => {
    await typeThenClose();
    cleanup();
    const panel = await openEdit();
    expect(panel.queryByText(/Brouillon repris/)).toBeNull();
    expect(titleField(panel)).toHaveValue("Connexion par e-mail");
  });

  it("brouillon de modification repris sur la même version : valeurs saisies, bandeau simple", async () => {
    const panel = await openEdit();
    await setText(titleField(panel), "Titre en cours");
    await advance(700);
    cleanup();
    const again = await openEdit();
    await again.findByText(/Brouillon repris/);
    expect(titleField(again)).toHaveValue("Titre en cours");
    expect(again.queryByText("Cette fonctionnalité a changé depuis votre brouillon.")).toBeNull();
  });
});

describe("Abandon avec confirmation en ligne", () => {
  async function resumed() {
    await typeThenClose();
    return reopenNew();
  }

  it("« Abandonner le brouillon » demande confirmation dans le panneau : « Garder » reçoit le focus, aucun dialogue empilé", async () => {
    const panel = await resumed();
    await userEvent
      .setup({ delay: null })
      .click(await panel.findByRole("button", { name: "Abandonner le brouillon" }));
    expect(await panel.findByText(CONFIRM)).toBeVisible();
    await waitFor(() => expect(panel.getByRole("button", { name: "Garder" })).toHaveFocus());
    expect(panel.getByRole("button", { name: "Abandonner" })).toBeVisible();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("« Garder » referme la confirmation sans rien perdre", async () => {
    const panel = await resumed();
    const u = userEvent.setup({ delay: null });
    await u.click(await panel.findByRole("button", { name: "Abandonner le brouillon" }));
    await u.click(await panel.findByRole("button", { name: "Garder" }));
    expect(panel.queryByText(CONFIRM)).toBeNull();
    expect(titleField(panel)).toHaveValue("Brouillon en cours");
    expect(stored(NEW_KEY)).not.toBeNull();
  });

  it("« Abandonner » efface le brouillon, recharge le formulaire vierge et annonce « Brouillon abandonné. »", async () => {
    const panel = await resumed();
    const u = userEvent.setup({ delay: null });
    await u.click(await panel.findByRole("button", { name: "Abandonner le brouillon" }));
    await u.click(await panel.findByRole("button", { name: "Abandonner" }));
    await waitFor(() => expect(titleField(panel)).toHaveValue(""));
    expect(panel.getByRole("combobox", { name: "Priorité (obligatoire)" })).toHaveTextContent(
      "Choisir une priorité",
    );
    expect(liveText()).toContain("Brouillon abandonné.");
    expect(stored(NEW_KEY)).toBeNull();
    expect(panel.queryByText(/Brouillon repris/)).toBeNull();
  });

  it("en modification : l'abandon recharge les valeurs de la version actuelle", async () => {
    const panel = await openEdit();
    await setText(titleField(panel), "Titre en cours");
    await advance(700);
    cleanup();
    const again = await openEdit();
    const u = userEvent.setup({ delay: null });
    await u.click(await again.findByRole("button", { name: "Abandonner le brouillon" }));
    await u.click(await again.findByRole("button", { name: "Abandonner" }));
    await waitFor(() => expect(titleField(again)).toHaveValue("Connexion par e-mail"));
    expect(stored(EDIT_KEY)).toBeNull();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Brouillon expiré, corrompu ou stockage indisponible", () => {
  const draft = (over: Record<string, unknown> = {}) => ({
    values: { ...EMPTY_VALUES, title: "Ancien brouillon", priority: "must" as const },
    baseline: null,
    baseCommitSha: null,
    idempotencyKey: null,
    savedAt: new Date().toISOString(),
    ...over,
  });

  it("brouillon vieux de plus de 7 jours : ignoré et supprimé", async () => {
    saveDraft(
      PROJECT_ID,
      "new",
      draft({ savedAt: new Date(Date.now() - 8 * 86_400_000).toISOString() }),
    );
    renderFeatures({ search: "?new=1" });
    const panel = await form();
    expect(titleField(panel)).toHaveValue("");
    expect(panel.queryByText(/Brouillon repris/)).toBeNull();
    expect(stored(NEW_KEY)).toBeNull();
  });

  it("brouillon de 6 jours : repris", async () => {
    saveDraft(
      PROJECT_ID,
      "new",
      draft({ savedAt: new Date(Date.now() - 6 * 86_400_000).toISOString() }),
    );
    renderFeatures({ search: "?new=1" });
    const panel = await form();
    await panel.findByText(/Brouillon repris/);
    expect(titleField(panel)).toHaveValue("Ancien brouillon");
  });

  it("contenu corrompu : le formulaire s'ouvre vierge, sans erreur", async () => {
    localStorage.setItem(NEW_KEY, "{pas du json");
    renderFeatures({ search: "?new=1" });
    const panel = await form();
    expect(titleField(panel)).toHaveValue("");
    expect(panel.queryByRole("alert")).toBeNull();
  });

  it("localStorage indisponible : le formulaire fonctionne et l'envoi part", async () => {
    const boom = () => {
      throw new DOMException("denied", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(boom);
    procedures.specBatchSubmit.mockReturnValue(new Promise(() => undefined));
    const panel = await openCreate(userEvent.setup({ delay: null }));
    await fillMinimum(panel);
    await advance(700);
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(panel.queryByRole("alert")).toBeNull();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("La fonctionnalité a changé depuis le brouillon (§5.5)", () => {
  const before = valuesFromDetail(DETAIL);
  const withDraft = () =>
    saveDraft(PROJECT_ID, "F-001", {
      values: { ...before, title: "Titre du brouillon" },
      baseline: before,
      baseCommitSha: OLD_SHA,
      idempotencyKey: null,
      savedAt: new Date().toISOString(),
    });
  beforeEach(() => {
    procedures.specGetFeature.mockResolvedValue({
      ...DETAIL,
      description: "Description changée dans la spec",
      commitSha: SHA,
    });
    procedures.specHead.mockResolvedValue(head({ commitSha: SHA }));
  });

  it("le bandeau propose « Garder mon brouillon » et « Repartir de la version actuelle »", async () => {
    withDraft();
    renderFeatures({ search: "?edit=F-001" });
    const panel = await form();
    expect(
      await panel.findByText("Cette fonctionnalité a changé depuis votre brouillon."),
    ).toBeVisible();
    expect(panel.getByRole("button", { name: "Garder mon brouillon" })).toBeVisible();
    expect(panel.getByRole("button", { name: "Repartir de la version actuelle" })).toBeVisible();
  });

  it("« Garder mon brouillon » : votre saisie l'emporte, le reste suit la version actuelle, patch minimal avec le baseSha actuel", async () => {
    withDraft();
    procedures.specBatchSubmit.mockReturnValue(new Promise(() => undefined));
    renderFeatures({ search: "?edit=F-001" });
    const panel = await form();
    await userEvent
      .setup({ delay: null })
      .click(await panel.findByRole("button", { name: "Garder mon brouillon" }));
    expect(titleField(panel)).toHaveValue("Titre du brouillon");
    expect(panel.getByRole("textbox", { name: "Description" })).toHaveValue(
      "Description changée dans la spec",
    );
    await clickSave(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(submitInputs()[0]?.baseSha).toBe(SHA);
    expect(operationOf()).toStrictEqual({
      kind: "feature.update",
      specId: "F-001",
      title: "Titre du brouillon",
    });
  });

  it("« Repartir de la version actuelle » demande la même confirmation en ligne, puis repart de la version lue", async () => {
    withDraft();
    renderFeatures({ search: "?edit=F-001" });
    const panel = await form();
    const u = userEvent.setup({ delay: null });
    await u.click(await panel.findByRole("button", { name: "Repartir de la version actuelle" }));
    expect(await panel.findByText(CONFIRM)).toBeVisible();
    await u.click(panel.getByRole("button", { name: "Abandonner" }));
    await waitFor(() => expect(titleField(panel)).toHaveValue("Connexion par e-mail"));
    expect(panel.getByRole("textbox", { name: "Description" })).toHaveValue(
      "Description changée dans la spec",
    );
    expect(stored(EDIT_KEY)).toBeNull();
  });

  it("champs modifiés des deux côtés : signalés comme pour un conflit (valeur actuelle + reprendre)", async () => {
    withDraft();
    procedures.specGetFeature.mockResolvedValue({
      ...DETAIL,
      title: "Titre changé dans la spec",
      commitSha: SHA,
    });
    renderFeatures({ search: "?edit=F-001" });
    const panel = await form();
    await userEvent
      .setup({ delay: null })
      .click(await panel.findByRole("button", { name: "Garder mon brouillon" }));
    expect(
      await panel.findByText("Valeur actuelle dans la spec : Titre changé dans la spec"),
    ).toBeVisible();
    expect(panel.getByRole("button", { name: "Reprendre la valeur actuelle" })).toBeVisible();
    expect(titleField(panel)).toHaveValue("Titre du brouillon");
  });
});

describe("Effacé à la déconnexion", () => {
  beforeEach(() => {
    saveDraft(PROJECT_ID, "new", {
      values: { ...EMPTY_VALUES, title: "À effacer" },
      baseline: null,
      baseCommitSha: null,
      idempotencyKey: "feature-1",
      savedAt: new Date().toISOString(),
    });
    savePending(PROJECT_ID, {
      batchId: "01900000-0000-7000-8000-0000000000d1",
      kind: "create",
      title: "En vol",
      savedAt: new Date().toISOString(),
    });
    localStorage.setItem("koklo:theme", "dark");
    signOut.mockResolvedValue({ data: {}, error: null });
  });
  const kept = () => Object.keys(localStorage);

  it("menu utilisateur « Se déconnecter » : brouillons et marqueurs effacés, le reste conservé", async () => {
    render(
      <SidebarProvider>
        <NavUser />
      </SidebarProvider>,
    );
    const u = userEvent.setup({ delay: null });
    await u.click(screen.getByRole("button", { name: /Menu utilisateur/ }));
    await u.click(await findNamed("menuitem", "Se déconnecter"));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    await waitFor(() => expect(kept()).toEqual(["koklo:theme"]));
  });

  it("écran des organisations « Se déconnecter » : mêmes effacements", async () => {
    procedures.organizationList.mockResolvedValue([]);
    renderWithQuery(<OrganizationsPage />);
    await userEvent.setup({ delay: null }).click(await findNamed("button", "Se déconnecter"));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    await waitFor(() => expect(kept()).toEqual(["koklo:theme"]));
  });
});
