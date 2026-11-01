import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  dialog,
  form,
  openCreate,
  serveWrite,
  submitInputs,
  titleField,
} from "./support/feature-form.tsx";
import {
  CLIENT_SIDE,
  findTable,
  head,
  inputsOf,
  PROJECT_ID,
  renderFeatures,
  TEAM,
} from "./support/features.tsx";
import { findNamed } from "./support/wait.ts";
import { polyfillRadix, procedures, resetWebMocks, router, watchUrl } from "./support/web-mocks.ts";

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
 * TK-48 / 48e, accès au formulaire (S-feature-form §1, §2, §4.1, §5.1, AC-48-27) : boutons par rôle et par
 * état de la spec, adresses `?new=1` et `?edit=F-nnn`, ouverture, fermeture et retour du focus.
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
  serveWrite();
});

const NEW_BUTTON = "Nouvelle fonctionnalité";
const newButtons = () => screen.queryAllByRole("button", { name: NEW_BUTTON });
const writeCalls = () => procedures.specBatchSubmit.mock.calls.length;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Bouton « Nouvelle fonctionnalité » par rôle", () => {
  it.each(TEAM)("%s : un bouton à droite du titre de page, quand la spec est lue", async (role) => {
    serveWrite(role);
    renderFeatures();
    await findTable();
    expect(await findNamed("button", NEW_BUTTON)).toBeVisible();
    expect(newButtons()).toHaveLength(1);
  });

  it.each(CLIENT_SIDE)(
    "%s : aucun bouton, aucun emplacement vide, aucun bouton grisé",
    async (role) => {
      serveWrite(role);
      renderFeatures();
      await findTable();
      expect(newButtons()).toHaveLength(0);
      expect(screen.queryByRole("button", { name: /Modifier|Enregistrer|Nouvelle/ })).toBeNull();
      expect(screen.queryAllByRole("button").filter((b) => b.hasAttribute("disabled"))).toEqual([]);
    },
  );

  it("tant que le rôle est inconnu, aucun bouton (jamais d'apparition puis de disparition)", async () => {
    procedures.organizationList.mockReturnValue(new Promise(() => undefined));
    renderFeatures();
    await findTable();
    expect(newButtons()).toHaveLength(0);
  });

  it("spec en préparation : aucun bouton", async () => {
    procedures.specHead.mockResolvedValue(head({ status: "building" }));
    procedures.specListFeatures.mockResolvedValue({ items: [], nextCursor: null });
    renderFeatures();
    await screen.findByText("La spec est en cours de préparation");
    expect(newButtons()).toHaveLength(0);
  });

  it("index en échec : aucun bouton", async () => {
    procedures.specHead.mockResolvedValue(head({ status: "failed", errorCode: "spec_too_large" }));
    renderFeatures();
    await screen.findByText("La spec n'a pas pu être lue");
    expect(newButtons()).toHaveLength(0);
  });

  it("projet sans dépôt de spec : on y crée d'abord le dépôt, aucun bouton d'écriture", async () => {
    procedures.specHead.mockResolvedValue(null);
    renderFeatures();
    await screen.findByText("Ce projet n'a pas de dépôt de spec");
    expect(newButtons()).toHaveLength(0);
  });

  it("pendant le chargement de la spec : aucun bouton", async () => {
    procedures.specHead.mockReturnValue(new Promise(() => undefined));
    renderFeatures();
    await screen.findByText("Chargement des fonctionnalités…");
    expect(newButtons()).toHaveLength(0);
  });

  it("erreur de liste : aucun bouton", async () => {
    procedures.specListFeatures.mockRejectedValue(new Error("boom"));
    renderFeatures();
    await screen.findByText("Impossible de charger les fonctionnalités");
    expect(newButtons()).toHaveLength(0);
  });

  it("état vide : le bouton est aussi dans la carte « Aucune fonctionnalité pour le moment »", async () => {
    procedures.specHead.mockResolvedValue(
      head({ counts: { features: 0, tables: 0, endpoints: 0 } }),
    );
    procedures.specListFeatures.mockResolvedValue({ items: [], nextCursor: null });
    renderFeatures();
    const heading = await findNamed("heading", "Aucune fonctionnalité pour le moment");
    const card = heading.parentElement as HTMLElement;
    expect(within(card).getByRole("button", { name: NEW_BUTTON })).toBeVisible();
  });

  it("état vide côté client : aucun bouton", async () => {
    serveWrite("client");
    procedures.specHead.mockResolvedValue(
      head({ counts: { features: 0, tables: 0, endpoints: 0 } }),
    );
    procedures.specListFeatures.mockResolvedValue({ items: [], nextCursor: null });
    renderFeatures();
    await findNamed("heading", "Aucune fonctionnalité pour le moment");
    expect(newButtons()).toHaveLength(0);
  });
});

describe("Ouverture de la création", () => {
  it("le bouton pousse ?new=1 dans l'historique et ouvre un dialogue nommé « Nouvelle fonctionnalité »", async () => {
    renderFeatures();
    await findTable();
    const length = window.history.length;
    await userEvent.click(await findNamed("button", NEW_BUTTON));
    const panel = await dialog();
    expect(panel).toHaveAccessibleName(NEW_BUTTON);
    expect(within(panel).getByRole("heading", { level: 2, name: NEW_BUTTON })).toBeVisible();
    expect(new URLSearchParams(window.location.search).get("new")).toBe("1");
    expect(window.history.length).toBe(length + 1);
  });

  it("focus initial sur le champ « Titre (obligatoire) », sans appel à spec.getFeature", async () => {
    const panel = await openCreate();
    await waitFor(() => expect(titleField(panel)).toHaveFocus());
    expect(procedures.specGetFeature).not.toHaveBeenCalled();
  });

  it("?new=1 à l'arrivée ouvre le formulaire de création", async () => {
    renderFeatures({ search: "?new=1" });
    expect(await dialog()).toHaveAccessibleName(NEW_BUTTON);
  });

  it.each(["new=2", "new=true", "edit=x", "edit=F-1", "edit=f-001"])(
    "adresse ?%s invalide : ignorée, aucun dialogue",
    async (search) => {
      renderFeatures({ search: `?${search}` });
      await findTable();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(procedures.specGetFeature).not.toHaveBeenCalled();
    },
  );

  it("les filtres de l'adresse sont gardés à l'ouverture", async () => {
    renderFeatures({ search: "?priority=must" });
    await findTable();
    await userEvent.click(await findNamed("button", NEW_BUTTON));
    await dialog();
    const params = new URLSearchParams(window.location.search);
    expect(params.get("priority")).toBe("must");
    expect(params.get("new")).toBe("1");
  });
});

describe("Client et business : adresses d'écriture ignorées (AC-48-27)", () => {
  it.each(CLIENT_SIDE)(
    "%s : ?new=1 n'ouvre rien, le paramètre est retiré, aucun appel d'écriture",
    async (role) => {
      serveWrite(role);
      renderFeatures({ search: "?new=1&status=brouillon" });
      await findTable();
      expect(screen.queryByRole("dialog")).toBeNull();
      await waitFor(() =>
        expect(new URLSearchParams(window.location.search).has("new")).toBe(false),
      );
      expect(new URLSearchParams(window.location.search).get("status")).toBe("brouillon");
      expect(writeCalls()).toBe(0);
    },
  );

  it.each(CLIENT_SIDE)(
    "%s : ?edit=F-001 ouvre la fiche en lecture, jamais le formulaire",
    async (role) => {
      serveWrite(role);
      renderFeatures({ search: "?edit=F-001" });
      const panel = await findNamed("dialog", "Connexion par e-mail");
      expect(within(panel).queryByRole("button", { name: /Modifier|Enregistrer/ })).toBeNull();
      expect(within(panel).queryByRole("textbox")).toBeNull();
      await waitFor(() => {
        const params = new URLSearchParams(window.location.search);
        expect(params.has("edit")).toBe(false);
        expect(params.get("feature")).toBe("F-001");
      });
      expect(writeCalls()).toBe(0);
    },
  );

  it.each(CLIENT_SIDE)("%s : la fiche n'a pas de bouton « Modifier »", async (role) => {
    serveWrite(role);
    renderFeatures({ search: "?feature=F-001" });
    const panel = await findNamed("dialog", "Connexion par e-mail");
    await within(panel).findByText("Critères d'acceptation");
    expect(within(panel).queryByRole("button", { name: "Modifier" })).toBeNull();
  });

  it("aucune adresse d'écriture ne se transforme en appel `submit` pour un rôle inconnu", async () => {
    serveWrite("visiteur" as never);
    renderFeatures({ search: "?new=1" });
    await findTable();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(writeCalls()).toBe(0);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Ouverture de la modification", () => {
  it.each(TEAM)(
    "%s : ?edit=F-001 ouvre « Modifier F-001 » et lit la fonctionnalité",
    async (role) => {
      serveWrite(role);
      renderFeatures({ search: "?edit=F-001" });
      const panel = await dialog();
      expect(panel).toHaveAccessibleName("Modifier F-001");
      expect(inputsOf(procedures.specGetFeature)).toEqual([
        { projectId: PROJECT_ID, specId: "F-001" },
      ]);
    },
  );

  it("l'identifiant du titre est en police mono", async () => {
    renderFeatures({ search: "?edit=F-001" });
    const panel = await dialog();
    const mono = within(panel)
      .getByRole("heading", { level: 2 })
      .querySelector("[class*='font-mono']");
    expect(mono).toHaveTextContent("F-001");
  });

  it("la fiche d'une équipe propose « Modifier » : la fiche est remplacée par le formulaire", async () => {
    renderFeatures({ search: "?feature=F-001" });
    const sheet = await findNamed("dialog", "Connexion par e-mail");
    await userEvent.click(await within(sheet).findByRole("button", { name: "Modifier" }));
    const panel = await findNamed("dialog", "Modifier F-001");
    expect(panel).toBeVisible();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const params = new URLSearchParams(window.location.search);
    expect(params.get("edit")).toBe("F-001");
    expect(params.has("feature")).toBe(false);
  });

  it("Retour du navigateur depuis le formulaire revient à la fiche", async () => {
    renderFeatures({ search: "?feature=F-001" });
    const sheet = await findNamed("dialog", "Connexion par e-mail");
    await userEvent.click(await within(sheet).findByRole("button", { name: "Modifier" }));
    await findNamed("dialog", "Modifier F-001");
    window.history.back();
    // Le texte « Connexion par e-mail » est déjà dans la ligne du tableau : attendre la disparition du
    // formulaire, puis la fiche, plutôt que de lire le rôle tout de suite (jsdom traite back() en différé).
    await waitFor(
      () => expect(screen.queryByRole("dialog", { name: "Modifier F-001" })).toBeNull(),
      {
        timeout: 8000,
      },
    );
    await waitFor(
      () => expect(screen.getByRole("dialog", { name: "Connexion par e-mail" })).toBeVisible(),
      { timeout: 8000 },
    );
    expect(new URLSearchParams(window.location.search).get("feature")).toBe("F-001");
  });

  it("modification d'une fonctionnalité qui n'existe plus : « Cette fonctionnalité n'existe plus dans la spec. »", async () => {
    const { apiError } = await import("./support/web-mocks.ts");
    procedures.specGetFeature.mockRejectedValue(apiError("NOT_FOUND"));
    renderFeatures({ search: "?edit=F-001" });
    const panel = await dialog();
    expect(
      await within(panel).findByText("Cette fonctionnalité n'existe plus dans la spec."),
    ).toBeVisible();
    expect(within(panel).getByRole("button", { name: "Fermer" })).toBeVisible();
    expect(within(panel).queryByRole("textbox")).toBeNull();
    expect(within(panel).queryByRole("button", { name: "Enregistrer" })).toBeNull();
  });

  it("chargement : « Chargement de la fonctionnalité… » en attente, sans champ ni bouton « Enregistrer »", async () => {
    procedures.specGetFeature.mockReturnValue(new Promise(() => undefined));
    renderFeatures({ search: "?edit=F-001" });
    const panel = await form();
    const loading = await panel.findByText("Chargement de la fonctionnalité…");
    expect(loading.closest("[aria-busy='true']")).not.toBeNull();
    expect(panel.queryByRole("textbox")).toBeNull();
    expect(panel.queryByRole("button", { name: "Enregistrer" })).toBeNull();
  });
});

describe("Fermeture (sans confirmation, brouillon gardé)", () => {
  it("« Fermer » ferme, retire ?new=1 et rend le focus au bouton « Nouvelle fonctionnalité »", async () => {
    const panel = await openCreate();
    await userEvent.click(panel.getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.location.search).toBe("");
    expect(screen.getByRole("button", { name: NEW_BUTTON })).toHaveFocus();
  });

  it("Échap ferme sans aucun dialogue de confirmation", async () => {
    const panel = await openCreate();
    await userEvent.type(titleField(panel), "Un début");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByText(/Quitter sans enregistrer/)).toBeNull();
  });

  it("le bouton de fermeture de l'angle est distinct de « Fermer » (un seul bouton nommé « Fermer »)", async () => {
    const panel = await openCreate();
    expect(panel.getAllByRole("button", { name: "Fermer" })).toHaveLength(1);
    expect(panel.getByRole("button", { name: "Fermer le formulaire" })).toBeVisible();
  });

  it("Retour du navigateur ferme le formulaire", async () => {
    await openCreate();
    window.history.back();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.location.search).toBe("");
  });

  it("fermer ne déclenche aucun appel d'écriture", async () => {
    const panel = await openCreate();
    await userEvent.click(panel.getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(submitInputs()).toEqual([]);
  });
});

describe("Session", () => {
  it("UNAUTHORIZED à l'enregistrement : redirection vers /login, sans texte d'erreur", async () => {
    const { apiError } = await import("./support/web-mocks.ts");
    procedures.specBatchSubmit.mockRejectedValue(apiError("UNAUTHORIZED"));
    const { fillMinimum, clickSave } = await import("./support/feature-form.tsx");
    const panel = await openCreate();
    await fillMinimum(panel);
    await clickSave(panel);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText(/n'a pas abouti|Impossible de confirmer/)).toBeNull();
  });

  const featureKeys = () => Object.keys(localStorage).filter((k) => k.startsWith("koklo:feature-"));

  it("UNAUTHORIZED (session expirée) : brouillon et marqueur effacés, et le démontage ne les réécrit pas", async () => {
    const { apiError } = await import("./support/web-mocks.ts");
    const { fillMinimum, clickSave } = await import("./support/feature-form.tsx");
    procedures.specBatchSubmit.mockRejectedValue(apiError("UNAUTHORIZED"));
    const view = renderFeatures({ search: "?new=1" });
    const panel = await form();
    await fillMinimum(panel);
    await clickSave(panel);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    expect(featureKeys()).toEqual([]);
    view.unmount();
    expect(featureKeys()).toEqual([]);
  });
});
