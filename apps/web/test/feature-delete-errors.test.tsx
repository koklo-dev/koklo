import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { draftKey } from "../src/lib/feature-draft.ts";
import {
  confirmDelete,
  DELETE_BUTTON,
  form,
  openEdit,
  serveWrite,
  setText,
  statusRegions,
  submitInputs,
  titleField,
} from "./support/feature-form.tsx";
import { DETAIL, PROJECT_ID, type Role, renderFeatures } from "./support/features.tsx";
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
 * TK-48 / 48e-2, échecs d'une suppression (S-feature-form §4.7 « table unique », §4.8, AC-48-26, AC-48-27) :
 * le même rendu qu'en création et en modification, une seule alerte, la fonctionnalité reste dans la liste,
 * la saisie en cours est conservée, jamais la valeur brute du serveur, aucun vocabulaire de git.
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
  serveWrite();
});

const TEAM_JARGON = /\blot\b|commit|branche|\bSHA\b|idempoten|payload|\bbatch\b/i;
type Panel = Awaited<ReturnType<typeof openEdit>>;

/** Ouvre F-001, saisit un titre (à conserver), confirme la suppression ; le serveur répond `error`. */
async function failWith(error: unknown, role: Role = "owner", prepare?: () => void) {
  serveWrite(role);
  prepare?.();
  procedures.specBatchSubmit.mockRejectedValue(error);
  const panel = await openEdit();
  await setText(titleField(panel), "Titre à garder");
  await confirmDelete(panel);
  const alert = await panel.findByRole("alert");
  return { panel, alert };
}
const kept = (panel: Panel) => expect(titleField(panel)).toHaveValue("Titre à garder");

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: tableau §4.7, un test par ligne
describe("Table des échecs de submit, appliquée à la suppression", () => {
  it("réseau coupé : « Impossible de confirmer l'enregistrement », « Réessayer » ; la suppression n'est pas affirmée", async () => {
    const { panel, alert } = await failWith(new TypeError("fetch failed"));
    expect(within(alert).getByText("Impossible de confirmer l'enregistrement")).toBeVisible();
    expect(within(alert).getByRole("button", { name: "Réessayer" })).toBeVisible();
    expect(panel.getAllByRole("alert")).toHaveLength(1);
    kept(panel);
    expect(statusRegions()).toHaveLength(1);
  });

  it("l'alerte remplace la confirmation : on retrouve le pied normal (Enregistrer, Fermer, Supprimer cette fonctionnalité)", async () => {
    const { panel } = await failWith(apiError("PROVIDER_UNAVAILABLE"));
    expect(panel.queryByRole("group", { name: "Confirmer la suppression" })).toBeNull();
    expect(panel.getByRole("button", { name: "Fermer" })).toBeVisible();
    expect(panel.getByRole("button", { name: DELETE_BUTTON })).toBeVisible();
  });

  it("INTERNAL : « Nous ne savons pas si l'enregistrement a abouti », référence en mono, « Vérifier la liste », pas de réessai aveugle", async () => {
    const { panel, alert } = await failWith(apiError("INTERNAL", { requestId: "req-42" }));
    expect(
      within(alert).getByText("Nous ne savons pas si l'enregistrement a abouti"),
    ).toBeVisible();
    expect(within(alert).getByText("req-42").className).toMatch(/font-mono/);
    expect(within(alert).getByRole("button", { name: "Vérifier la liste" })).toBeVisible();
    expect(within(alert).getByRole("button", { name: "Réessayer" })).toBeVisible();
    expect(submitInputs()).toHaveLength(1);
    kept(panel);
  });

  it("« Vérifier la liste » ferme le panneau, relit la liste et garde le brouillon", async () => {
    const { alert } = await failWith(apiError("INTERNAL", { requestId: "r" }));
    const reads = procedures.specListFeatures.mock.calls.length;
    await userEvent.click(within(alert).getByRole("button", { name: "Vérifier la liste" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(procedures.specListFeatures.mock.calls.length).toBeGreaterThan(reads),
    );
    expect(submitInputs()).toHaveLength(1);
  });

  it.each(["owner", "admin"] as const)("503, %s : texte + lien /github", async (role) => {
    const { alert } = await failWith(apiError("PROVIDER_UNAVAILABLE"), role);
    expect(alert).toHaveTextContent("GitHub est momentanément indisponible");
    expect(alert).toHaveTextContent("Rien n'a été écrit. Réessayez dans un instant.");
    expect(
      within(alert).getByRole("link", { name: "Vérifier l'état de l'application GitHub" }),
    ).toHaveAttribute("href", "/github");
  });

  it("503, développeur : même texte, sans lien", async () => {
    const { alert } = await failWith(apiError("PROVIDER_UNAVAILABLE"), "dev");
    expect(alert).toHaveTextContent("GitHub est momentanément indisponible");
    expect(within(alert).queryByRole("link")).toBeNull();
  });

  it("429 : « Trop de demandes pour le moment », retryAfterMs ignoré", async () => {
    const { alert } = await failWith(apiError("PROVIDER_RATE_LIMITED", { retryAfterMs: 7000 }));
    expect(alert).toHaveTextContent("Trop de demandes pour le moment");
    expect(alert.textContent).not.toMatch(/7000|dans \d/);
  });

  const EXPIRED = { kind: "installation", refreshable: false };

  it("PROVIDER_AUTH_EXPIRED, propriétaire : lien « Ouvrir la page GitHub », « Fermer », pas de « Réessayer »", async () => {
    const { alert } = await failWith(apiError("PROVIDER_AUTH_EXPIRED", EXPIRED), "owner");
    expect(within(alert).getByRole("link", { name: "Ouvrir la page GitHub" })).toHaveAttribute(
      "href",
      "/github",
    );
    expect(within(alert).queryByRole("button", { name: "Réessayer" })).toBeNull();
  });

  it("PROVIDER_AUTH_EXPIRED, développeur : consigne sans lien", async () => {
    const { alert } = await failWith(apiError("PROVIDER_AUTH_EXPIRED", EXPIRED), "dev");
    expect(alert).toHaveTextContent(
      "Demandez à un propriétaire ou à un administrateur d'autoriser de nouveau Koklo.",
    );
    expect(within(alert).queryByRole("link")).toBeNull();
  });

  it("FORBIDDEN, développeur : « Vous n'avez pas le droit d'enregistrer dans la spec. » et « Fermer »", async () => {
    const { alert } = await failWith(apiError("FORBIDDEN"), "dev");
    expect(alert).toHaveTextContent("Vous n'avez pas le droit d'enregistrer dans la spec.");
    expect(within(alert).getByRole("button", { name: "Fermer" })).toBeVisible();
    expect(within(alert).queryByRole("button", { name: "Aller à Éléments liés" })).toBeNull();
  });

  it("FORBIDDEN, designer : règle de l'écran ; « Aller à Éléments liés » ouvre la section et place le focus sur « Écrans »", async () => {
    const { panel, alert } = await failWith(apiError("FORBIDDEN"), "designer");
    expect(alert).toHaveTextContent(
      "Vous ne pouvez enregistrer que les fonctionnalités liées à un écran",
    );
    await userEvent.click(within(alert).getByRole("button", { name: "Aller à Éléments liés" }));
    await waitFor(() => expect(panel.getByRole("textbox", { name: "Écrans" })).toHaveFocus());
  });

  it("NOT_FOUND (projet ou dépôt de spec disparu) : « Ce projet n'a plus de dépôt de spec », « Voir les projets », « Fermer »", async () => {
    const { panel, alert } = await failWith(apiError("NOT_FOUND"));
    expect(alert).toHaveTextContent("Ce projet n'a plus de dépôt de spec");
    expect(within(alert).getByRole("link", { name: "Voir les projets" })).toHaveAttribute(
      "href",
      "/projects",
    );
    expect(within(alert).getByRole("button", { name: "Fermer" })).toBeVisible();
    kept(panel);
  });

  it("SPEC_INVALID (une référence empêche la suppression) : diagnostics listés, F-001 reste, rien n'est écrit", async () => {
    const report = {
      ok: false,
      counts: { error: 1, warning: 0 },
      truncated: true,
      issues: [
        {
          rule: 7,
          code: "dangling_reference",
          severity: "error",
          path: "scenarios/TS-001.md",
          pointer: "/features/0",
          entityId: "TS-001",
          message: "Le scénario TS-001 renvoie à F-001, qui n'existerait plus.",
        },
      ],
    };
    const { panel, alert } = await failWith(apiError("SPEC_INVALID", { report }));
    expect(alert).toHaveTextContent("La spec obtenue ne serait pas valide");
    expect(alert).toHaveTextContent("Rien n'a été écrit. La fonctionnalité reste dans la spec");
    expect(alert.textContent).not.toMatch(/Corrigez/);
    expect(
      within(alert).getByText("Le scénario TS-001 renvoie à F-001, qui n'existerait plus."),
    ).toBeVisible();
    expect(within(alert).getByText("TS-001").className).toMatch(/font-mono/);
    expect(within(alert).getByText("dangling_reference").className).toMatch(/font-mono/);
    expect(alert).toHaveTextContent("D'autres problèmes ne sont pas affichés.");
    // Le diagnostic ne se rattache à aucun champ du formulaire : texte, pas de lien vers un champ.
    expect(within(alert).queryAllByRole("link")).toHaveLength(0);
    kept(panel);
  });

  it("valeur inconnue du serveur : texte générique, jamais la valeur brute", async () => {
    const { alert } = await failWith(apiError("SOMETHING_NEW", { secret: "valeur-brute" }));
    expect(alert).toHaveTextContent("L'enregistrement n'a pas abouti. Votre saisie est gardée.");
    expect(alert.textContent).not.toMatch(/SOMETHING_NEW|valeur-brute/);
  });

  it("une seule alerte à la fois, aucune alerte dans la région d'état, aucun vocabulaire de git", async () => {
    const { panel, alert } = await failWith(apiError("PROVIDER_UNAVAILABLE"));
    expect(panel.getAllByRole("alert")).toHaveLength(1);
    expect(alert.textContent).not.toMatch(TEAM_JARGON);
    expect(statusRegions()).toHaveLength(1);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Conflits d'une suppression", () => {
  const stale = () => apiError("SPEC_BATCH_CONFLICT", { reason: "stale_base" });
  const writeConflict = () => apiError("SPEC_BATCH_CONFLICT", { reason: "write_conflict" });

  it("stale_base : « La spec a changé… », « Recharger la version actuelle » ; la suppression n'est PAS renvoyée toute seule", async () => {
    const { panel, alert } = await failWith(stale());
    expect(alert).toHaveTextContent("La spec a changé depuis que vous avez ouvert ce formulaire");
    expect(alert).toHaveTextContent("Rien n'a été écrit.");
    expect(
      within(alert).getByRole("button", { name: "Recharger la version actuelle" }),
    ).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(submitInputs()).toHaveLength(1);
    kept(panel);
  });

  it("write_conflict : « Cette fonctionnalité a changé ou n'existe plus dans la spec » + « Recharger la version actuelle »", async () => {
    const { alert } = await failWith(writeConflict());
    expect(alert).toHaveTextContent("Cette fonctionnalité a changé ou n'existe plus dans la spec");
    expect(alert).toHaveTextContent("Rechargez-la pour voir où elle en est.");
    expect(
      within(alert).getByRole("button", { name: "Recharger la version actuelle" }),
    ).toBeVisible();
    expect(within(alert).queryByRole("button", { name: "Réessayer" })).toBeNull();
  });

  it("recharger relit spec.head et spec.getFeature ; la fonctionnalité revient avec la version actuelle, on peut redemander la suppression", async () => {
    const { panel, alert } = await failWith(stale());
    const heads = procedures.specHead.mock.calls.length;
    const reads = procedures.specGetFeature.mock.calls.length;
    procedures.specGetFeature.mockResolvedValue({ ...DETAIL, description: "Changée ailleurs" });
    await userEvent.click(
      within(alert).getByRole("button", { name: "Recharger la version actuelle" }),
    );
    await waitFor(() => expect(procedures.specGetFeature.mock.calls.length).toBeGreaterThan(reads));
    expect(procedures.specHead.mock.calls.length).toBeGreaterThan(heads);
    await waitFor(() => expect(panel.getByRole("button", { name: DELETE_BUTTON })).toBeVisible());
    expect(panel.queryByRole("alert")).toBeNull();
    kept(panel);
  });

  it("déjà supprimée par quelqu'un d'autre : write_conflict, puis le rechargement dit que la fonctionnalité n'existe plus", async () => {
    const { panel, alert } = await failWith(writeConflict());
    procedures.specGetFeature.mockRejectedValue(apiError("NOT_FOUND"));
    await userEvent.click(
      within(alert).getByRole("button", { name: "Recharger la version actuelle" }),
    );
    expect(
      await panel.findByText("Cette fonctionnalité n'existe plus dans la spec."),
    ).toBeVisible();
    expect(panel.getByRole("button", { name: "Fermer" })).toBeVisible();
    expect(panel.queryByRole("button", { name: DELETE_BUTTON })).toBeNull();
    expect(submitInputs()).toHaveLength(1);
  });

  it("la saisie en cours et le brouillon de la fonctionnalité sont gardés après un échec", async () => {
    const { panel } = await failWith(stale());
    kept(panel);
    await waitFor(() => expect(localStorage.getItem(draftKey(PROJECT_ID, "F-001"))).not.toBeNull());
  });
});

describe("Refus préalable du designer (règle documentée : au moins un écran avant)", () => {
  async function designerOnFeatureWithoutScreen() {
    serveWrite("designer");
    procedures.specGetFeature.mockResolvedValue({ ...DETAIL, screens: [] });
    procedures.specBatchSubmit.mockReturnValue(new Promise(() => undefined));
    renderFeatures({ search: "?edit=F-001" });
    const panel = await form();
    await panel.findByDisplayValue("Connexion par e-mail");
    return panel;
  }

  it("sans écran lié : la confirmation ne part pas, la règle du designer s'affiche, aucun appel", async () => {
    const panel = await designerOnFeatureWithoutScreen();
    await confirmDelete(panel);
    const alert = await panel.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Vous ne pouvez enregistrer que les fonctionnalités liées à un écran",
    );
    expect(within(alert).getByRole("button", { name: "Aller à Éléments liés" })).toBeVisible();
    expect(submitInputs()).toHaveLength(0);
    expect(procedures.specBatchSubmit).not.toHaveBeenCalled();
  });

  it("avec un écran lié (valeur lue) : la suppression part", async () => {
    serveWrite("designer");
    procedures.specBatchSubmit.mockReturnValue(new Promise(() => undefined));
    const panel = await openEdit();
    await confirmDelete(panel);
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(submitInputs()[0]?.operations).toEqual([{ kind: "feature.delete", specId: "F-001" }]);
  });

  it("le serveur reste l'autorité : un FORBIDDEN malgré un écran lié est rendu tel quel", async () => {
    const { alert } = await failWith(apiError("FORBIDDEN"), "designer");
    expect(alert).toHaveTextContent(
      "Vous ne pouvez enregistrer que les fonctionnalités liées à un écran",
    );
  });
});
