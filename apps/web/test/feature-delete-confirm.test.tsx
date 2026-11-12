import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { savePending } from "../src/lib/feature-draft.ts";
import { serveClient } from "./support/client-space.tsx";
import {
  askDelete,
  CONFIRM_GROUP,
  CONFIRM_TEXT,
  CONFIRM_TITLE,
  DELETE_BUTTON,
  dialog,
  form,
  liveRegion,
  openCreate,
  openEdit,
  queuedBatch,
  serveWrite,
  setText,
  statusRegions,
  submitInputs,
  titleField,
} from "./support/feature-form.tsx";
import {
  CLIENT_SIDE,
  DETAIL,
  findList,
  GIT_VOCABULARY,
  head,
  PROJECT_ID,
  renderFeatures,
  SCOPE,
  TEAM,
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
 * TK-48 / 48e-2, bouton « Supprimer cette fonctionnalité » et confirmation en ligne (S-feature-form §3.2 pied,
 * §4.8, §7, AC-48-24, AC-48-27, AC-48-28) : mêmes rôles que l'écriture, absent en création, remplacement du pied
 * par un groupe « Confirmer la suppression », focus sur « Garder », aucun dialogue empilé, aucun appel avant
 * la confirmation.
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
  serveWrite();
  procedures.specBatchSubmit.mockReturnValue(new Promise(() => undefined));
});

const deleteButton = () => screen.queryByRole("button", { name: DELETE_BUTTON });
/** « un commit à l'enregistrement » est le texte du pied de la maquette 16 (l.95-103) : seul terme git permis. */
const TEAM_JARGON =
  /\blot\b|commit(?! à l'enregistrement| ?, relu dans l'historique)|branche|\bSHA\b|idempoten|payload|\bbatch\b/i;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Le bouton « Supprimer cette fonctionnalité » (accès)", () => {
  it.each(TEAM)(
    "%s : présent dans le panneau de modification, une fois la fonctionnalité chargée",
    async (role) => {
      serveWrite(role);
      const panel = await openEdit();
      expect(panel.getByRole("button", { name: DELETE_BUTTON })).toBeVisible();
      expect(panel.getAllByRole("button", { name: DELETE_BUTTON })).toHaveLength(1);
    },
  );

  it("absent en création", async () => {
    await openCreate();
    expect(deleteButton()).toBeNull();
  });

  it("absent tant que la fonctionnalité se charge (aucune référence de comparaison)", async () => {
    procedures.specGetFeature.mockReturnValue(new Promise(() => undefined));
    renderFeatures({ search: "?edit=F-001" });
    await form();
    await screen.findByText("Chargement de la fonctionnalité…");
    expect(deleteButton()).toBeNull();
  });

  it("absent quand le chargement échoue (NOT_FOUND : « Cette fonctionnalité n'existe plus dans la spec. »)", async () => {
    procedures.specGetFeature.mockRejectedValue(apiError("NOT_FOUND"));
    renderFeatures({ search: "?edit=F-001" });
    await form();
    await screen.findByText("Cette fonctionnalité n'existe plus dans la spec.");
    expect(deleteButton()).toBeNull();
  });

  it.each(CLIENT_SIDE)(
    "%s : ni bouton ni formulaire (vue client), ?edit=F-001 est ignoré",
    async (role) => {
      // TK-104 : client et business lisent la vue client, où ?edit= n'ouvre rien.
      serveClient(role, { canValidate: role === "client" });
      renderFeatures({ search: "?edit=F-001" });
      await screen.findByRole("note");
      expect(deleteButton()).toBeNull();
      expect(screen.queryByRole("button", { name: /Supprimer|Modifier|Enregistrer/ })).toBeNull();
      expect(screen.queryAllByRole("textbox")).toHaveLength(0);
      expect(submitInputs()).toHaveLength(0);
    },
  );

  it("rôle inconnu : aucun bouton", async () => {
    procedures.organizationList.mockReturnValue(new Promise(() => undefined));
    renderFeatures({ search: "?edit=F-001" });
    await findList().catch(() => undefined);
    expect(deleteButton()).toBeNull();
  });

  it("la fiche en lecture n'offre pas de suppression (elle passe par « Modifier »)", async () => {
    renderFeatures({ search: "?feature=F-001" });
    const sheet = await screen.findByRole("complementary", { name: "Fiche de la fonctionnalité" });
    expect(within(sheet).queryByRole("button", { name: /Supprimer/ })).toBeNull();
  });

  it("spec qui n'est plus prête : pas de formulaire de modification, donc pas de suppression", async () => {
    procedures.specHead.mockResolvedValue(head({ status: "building" }));
    renderFeatures({ search: "?edit=F-001" });
    await findNamed("heading", /Cahier fonctionnel/, { level: 1 });
    expect(deleteButton()).toBeNull();
  });
});

describe("Le bouton dans le pied (§3.2 point 8, §6)", () => {
  it("ghost au texte atténué (maquette 16 l.98), cible max-md:h-11, avant « Annuler » et le bouton principal dans le DOM", async () => {
    const panel = await openEdit();
    const trigger = panel.getByRole("button", { name: DELETE_BUTTON });
    expect(trigger.className).toMatch(/text-muted-foreground/);
    expect(trigger.className).toMatch(/max-md:h-11/);
    const buttons = panel.getAllByRole("button");
    const at = (name: string) => buttons.findIndex((b) => b.textContent === name);
    // Maquette 16 l.95-103 : Supprimer à gauche, puis Annuler, puis le bouton principal.
    expect(buttons.indexOf(trigger)).toBeLessThan(at("Annuler"));
    expect(at("Annuler")).toBeLessThan(at("Enregistrer les modifications"));
  });

  it("aucune couleur brute ni icône « delete » : un libellé, pas une icône seule", async () => {
    const panel = await openEdit();
    const trigger = panel.getByRole("button", { name: DELETE_BUTTON });
    expect(trigger.className).not.toMatch(/\b(?:bg|text|border)-(?:red|rose)-\d/);
    expect(trigger.textContent).toBe(DELETE_BUTTON);
  });

  it("un enregistrement est déjà en cours dans la page : le bouton est désactivé et dit pourquoi", async () => {
    procedures.specBatchGet.mockResolvedValue(queuedBatch());
    savePending(SCOPE, PROJECT_ID, {
      batchId: "01900000-0000-7000-8000-0000000000d1",
      kind: "create",
      specId: "F-004",
      title: "Autre",
      savedAt: new Date().toISOString(),
    });
    const panel = await openEdit();
    const trigger = panel.getByRole("button", { name: DELETE_BUTTON });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAccessibleDescription("Un enregistrement est déjà en cours.");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Confirmation en ligne (§4.8)", () => {
  it("le clic remplace le pied par un groupe nommé « Confirmer la suppression », sans appel", async () => {
    const panel = await openEdit();
    const confirmation = await askDelete(panel);
    expect(panel.getByRole("group", { name: CONFIRM_GROUP })).toBeVisible();
    expect(confirmation.getByText(CONFIRM_TITLE)).toBeVisible();
    expect(panel.getByRole("group", { name: CONFIRM_GROUP })).toHaveTextContent(CONFIRM_TEXT);
    expect(submitInputs()).toHaveLength(0);
    expect(procedures.specBatchSubmit).not.toHaveBeenCalled();
  });

  it("titre : identifiant en mono ; texte : critères supprimés avec elle, refus expliqué", async () => {
    const panel = await openEdit();
    const confirmation = await askDelete(panel);
    const id = confirmation.getAllByText("F-001").find((e) => /font-mono/.test(e.className));
    expect(id).toBeDefined();
    expect(
      confirmation.getByText(/Ses critères d'acceptation seront supprimés avec elle\./),
    ).toBeVisible();
  });

  it("deux boutons : « Supprimer » (destructif) et « Garder » (outline) ; le pied d'enregistrement est remplacé", async () => {
    const panel = await openEdit();
    const confirmation = await askDelete(panel);
    const confirm = confirmation.getByRole("button", { name: "Supprimer" });
    const keep = confirmation.getByRole("button", { name: "Garder" });
    expect(confirm.className).toMatch(/bg-destructive/);
    expect(keep.className).toMatch(/border-input|border\b/);
    for (const name of ["Enregistrer les modifications", "Annuler"]) {
      expect(panel.queryByRole("button", { name })).toBeNull();
    }
  });

  it("« Garder » reçoit le focus à l'ouverture", async () => {
    const panel = await openEdit();
    const confirmation = await askDelete(panel);
    await waitFor(() => expect(confirmation.getByRole("button", { name: "Garder" })).toHaveFocus());
  });

  it("pas de dialogue empilé : un seul dialogue, le panneau", async () => {
    const panel = await openEdit();
    await askDelete(panel);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect((await dialog()).contains(screen.getByRole("group", { name: CONFIRM_GROUP }))).toBe(
      true,
    );
  });

  it("annulation : « Garder » rend le pied, le focus revient sur « Supprimer cette fonctionnalité », aucun appel", async () => {
    const panel = await openEdit();
    const confirmation = await askDelete(panel);
    await userEvent.click(confirmation.getByRole("button", { name: "Garder" }));
    await waitFor(() => expect(panel.queryByRole("group", { name: CONFIRM_GROUP })).toBeNull());
    expect(panel.getByRole("button", { name: /^Enregistrer/ })).toBeVisible();
    expect(panel.getByRole("button", { name: "Annuler" })).toBeVisible();
    await waitFor(() => expect(panel.getByRole("button", { name: DELETE_BUTTON })).toHaveFocus());
    expect(procedures.specBatchSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("la saisie en cours n'est ni envoyée ni perdue par la demande de suppression", async () => {
    const panel = await openEdit();
    await setText(titleField(panel), "Titre en cours de saisie");
    const confirmation = await askDelete(panel);
    await userEvent.click(confirmation.getByRole("button", { name: "Garder" }));
    expect(titleField(panel)).toHaveValue("Titre en cours de saisie");
    expect(procedures.specBatchSubmit).not.toHaveBeenCalled();
  });

  it("le texte de la confirmation ne contient aucun terme de git ni de l'équipe technique", async () => {
    const panel = await openEdit();
    const confirmation = await askDelete(panel);
    const text = panel.getByRole("group", { name: CONFIRM_GROUP }).textContent ?? "";
    expect(text).not.toMatch(TEAM_JARGON);
    expect(text).not.toMatch(GIT_VOCABULARY);
    expect(confirmation.getByRole("button", { name: "Supprimer" })).toBeVisible();
  });

  it("icône d'avertissement décorative (aria-hidden) + texte : jamais la couleur seule", async () => {
    const panel = await openEdit();
    await askDelete(panel);
    const group = panel.getByRole("group", { name: CONFIRM_GROUP });
    const icon = group.querySelector('[aria-hidden="true"]');
    expect(icon).not.toBeNull();
    expect(group.textContent).toContain("Supprimer F-001");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Accessibilité de la confirmation (§7, §10)", () => {
  it("région d'état unique et aucune alerte tant qu'on confirme : la confirmation n'est ni status ni alert", async () => {
    const panel = await openEdit();
    await askDelete(panel);
    expect(statusRegions()).toHaveLength(1);
    expect(liveRegion().closest('[role="group"]')).toBeNull();
    expect(panel.queryByRole("alert")).toBeNull();
  });

  it("le groupe est nommé par son titre visible (aria-labelledby), pas par un aria-label muet", async () => {
    const panel = await openEdit();
    await askDelete(panel);
    const group = panel.getByRole("group", { name: CONFIRM_GROUP });
    const labelled = group.getAttribute("aria-labelledby");
    expect(
      labelled === null
        ? group.getAttribute("aria-label")
        : document.getElementById(labelled)?.textContent,
    ).toBeTruthy();
  });

  it("boutons : cibles h-11 md:h-9, pleine largeur en mobile (w-full), ordre DOM = ordre visuel", async () => {
    const panel = await openEdit();
    const confirmation = await askDelete(panel);
    const confirm = confirmation.getByRole("button", { name: "Supprimer" });
    const keep = confirmation.getByRole("button", { name: "Garder" });
    for (const button of [confirm, keep]) {
      expect(button.className).toMatch(/\bh-11\b/);
      expect(button.className).toMatch(/md:h-9/);
      expect(button.className).toMatch(/\bw-full\b/);
    }
  });

  it("aucune animation de la confirmation hors motion-safe (mouvement réduit respecté)", async () => {
    const panel = await openEdit();
    await askDelete(panel);
    const group = panel.getByRole("group", { name: CONFIRM_GROUP });
    for (const element of [group, ...Array.from(group.querySelectorAll("*"))]) {
      const classes = (element.getAttribute("class") ?? "").split(/\s+/);
      expect(
        classes.filter((c) => /(^|:)animate-/.test(c) && !c.startsWith("motion-safe:")),
      ).toEqual([]);
    }
  });

  it("Tab reste dans le panneau : de « Supprimer » vers « Garder » puis retour (piège de focus du dialogue)", async () => {
    const panel = await openEdit();
    const confirmation = await askDelete(panel);
    const user = userEvent.setup();
    const root = await dialog();
    for (let i = 0; i < 4; i++) {
      await user.tab();
      expect(root.contains(document.activeElement)).toBe(true);
    }
    expect(confirmation.getByRole("button", { name: "Garder" })).toBeVisible();
  });

  it("clavier : Entrée sur « Garder » annule, Entrée sur « Supprimer cette fonctionnalité » ouvre la confirmation", async () => {
    const panel = await openEdit();
    const user = userEvent.setup();
    panel.getByRole("button", { name: DELETE_BUTTON }).focus();
    await user.keyboard("{Enter}");
    const group = await panel.findByRole("group", { name: CONFIRM_GROUP });
    await waitFor(() =>
      expect(within(group).getByRole("button", { name: "Garder" })).toHaveFocus(),
    );
    await user.keyboard("{Enter}");
    await waitFor(() => expect(panel.queryByRole("group", { name: CONFIRM_GROUP })).toBeNull());
    expect(procedures.specBatchSubmit).not.toHaveBeenCalled();
  });

  it("modification d'une fonctionnalité sans écran pour un designer : l'aide permanente reste, le bouton est présent", async () => {
    serveWrite("designer");
    procedures.specGetFeature.mockResolvedValue({ ...DETAIL, screens: [] });
    renderFeatures({ search: "?edit=F-001" });
    await screen.findByDisplayValue("Connexion par e-mail", undefined, { timeout: 8_000 });
    const panel = await form();
    expect(panel.getByRole("button", { name: DELETE_BUTTON })).toBeVisible();
    expect(panel.getByText(/En tant que designer, vous pouvez enregistrer/)).toBeVisible();
  });
});
