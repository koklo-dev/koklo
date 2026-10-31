import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { draftKey } from "../src/lib/feature-draft.ts";
import {
  clickSave,
  fillMinimum,
  linkField,
  NEW_TITLE,
  openCreate,
  openLinks,
  serveWrite,
  setText,
  submitInputs,
  titleField,
} from "./support/feature-form.tsx";
import { PROJECT_ID, type Role } from "./support/features.tsx";
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
 * TK-48 / 48e, table unique des échecs de `specBatch.submit` (S-feature-form §4.7, AC-48-26) : une seule
 * alerte, icône + titre + texte + action, saisie toujours conservée, jamais la valeur brute du serveur.
 * (Les lots terminaux relus par `get` sont dans feature-form-tracking.test.tsx.)
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
});

type Panel = Awaited<ReturnType<typeof openCreate>>;
async function failWith(
  error: unknown,
  role: Role = "owner",
  prepare?: (panel: Panel) => Promise<void>,
) {
  serveWrite(role);
  procedures.specBatchSubmit.mockRejectedValue(error);
  const panel = await openCreate();
  await fillMinimum(panel);
  await prepare?.(panel);
  await clickSave(panel);
  const alert = await panel.findByRole("alert");
  return { panel, alert };
}
const REPORT = (over: Record<string, unknown> = {}) => ({
  ok: false,
  counts: { error: 2, warning: 0 },
  truncated: false,
  issues: [
    {
      rule: 4,
      code: "unknown_screen",
      severity: "error",
      path: "features/F-004.md",
      pointer: "/screens/0",
      entityId: "S-inconnu",
      message: "Écran inconnu dans la spec",
    },
    {
      rule: "structure",
      code: "bad_shape",
      severity: "error",
      path: "features/F-004.md",
      pointer: "/schemaVersion",
      message: "Structure inattendue",
    },
  ],
  ...over,
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: tableau §4.7, un test par ligne
describe("Table des échecs de submit", () => {
  it("réseau coupé : « Impossible de confirmer l'enregistrement », « Réessayer », saisie gardée", async () => {
    const { panel, alert } = await failWith(new TypeError("fetch failed"));
    expect(within(alert).getByText("Impossible de confirmer l'enregistrement")).toBeVisible();
    expect(alert).toHaveTextContent(
      "Votre connexion a été interrompue. Réessayer ne créera pas de doublon.",
    );
    expect(within(alert).getByRole("button", { name: "Réessayer" })).toBeVisible();
    expect(titleField(panel)).toHaveValue(NEW_TITLE);
    expect(panel.getAllByRole("alert")).toHaveLength(1);
  });

  it("INTERNAL : « Nous ne savons pas si l'enregistrement a abouti », référence en mono, pas de réessai aveugle", async () => {
    const { panel, alert } = await failWith(apiError("INTERNAL", { requestId: "req-42" }));
    expect(
      within(alert).getByText("Nous ne savons pas si l'enregistrement a abouti"),
    ).toBeVisible();
    expect(alert).toHaveTextContent(
      "Vérifiez la liste avant de réessayer, pour ne pas créer deux fois la même fonctionnalité.",
    );
    const reference = within(alert).getByText("req-42");
    expect(reference.className).toMatch(/font-mono/);
    expect(alert).toHaveTextContent("Référence : req-42");
    expect(within(alert).getByRole("button", { name: "Vérifier la liste" })).toBeVisible();
    expect(within(alert).getByRole("button", { name: "Réessayer" })).toBeVisible();
    expect(submitInputs()).toHaveLength(1);
    expect(titleField(panel)).toHaveValue(NEW_TITLE);
  });

  it("« Vérifier la liste » ferme le panneau, relit la liste et garde le brouillon", async () => {
    const { panel, alert } = await failWith(apiError("INTERNAL", { requestId: "r" }));
    const reads = procedures.specListFeatures.mock.calls.length;
    await userEvent.click(within(alert).getByRole("button", { name: "Vérifier la liste" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(procedures.specListFeatures.mock.calls.length).toBeGreaterThan(reads),
    );
    expect(localStorage.getItem(draftKey(PROJECT_ID, "new"))).not.toBeNull();
    expect(submitInputs()).toHaveLength(1);
    expect(panel).toBeDefined();
  });

  it.each(["owner", "admin"] as const)(
    "503, %s : « GitHub est momentanément indisponible » + lien /github",
    async (role) => {
      const { alert } = await failWith(apiError("PROVIDER_UNAVAILABLE"), role);
      expect(within(alert).getByText("GitHub est momentanément indisponible")).toBeVisible();
      expect(alert).toHaveTextContent("Rien n'a été écrit. Réessayez dans un instant.");
      expect(
        within(alert).getByRole("link", { name: "Vérifier l'état de l'application GitHub" }),
      ).toHaveAttribute("href", "/github");
      expect(within(alert).getByRole("button", { name: "Réessayer" })).toBeVisible();
    },
  );

  it.each(["dev", "designer"] as const)("503, %s : même texte, sans lien /github", async (role) => {
    const { alert } = await failWith(apiError("PROVIDER_UNAVAILABLE"), role, (panel) =>
      role === "designer" ? linkScreen(panel) : Promise.resolve(),
    );
    expect(alert).toHaveTextContent("GitHub est momentanément indisponible");
    expect(within(alert).queryByRole("link")).toBeNull();
  });

  it("429 : « Trop de demandes pour le moment », pas de compte à rebours, retryAfterMs ignoré", async () => {
    const { alert } = await failWith(apiError("PROVIDER_RATE_LIMITED", { retryAfterMs: 7000 }));
    expect(within(alert).getByText("Trop de demandes pour le moment")).toBeVisible();
    expect(alert).toHaveTextContent("Rien n'a été écrit. Réessayez dans un instant.");
    expect(alert.textContent).not.toMatch(/7\s?(s|sec)|7000|dans \d/);
    expect(within(alert).getByRole("button", { name: "Réessayer" })).toBeVisible();
  });

  it.each(["owner", "admin"] as const)(
    "PROVIDER_AUTH_EXPIRED, %s : lien « Ouvrir la page GitHub », « Fermer », pas de « Réessayer »",
    async (role) => {
      const { alert } = await failWith(
        apiError("PROVIDER_AUTH_EXPIRED", { kind: "installation", refreshable: false }),
        role,
      );
      expect(within(alert).getByText("Koklo n'a plus accès au dépôt de spec")).toBeVisible();
      expect(alert).toHaveTextContent(
        "Autorisez de nouveau Koklo sur GitHub, puis revenez enregistrer : votre saisie est gardée.",
      );
      expect(within(alert).getByRole("link", { name: "Ouvrir la page GitHub" })).toHaveAttribute(
        "href",
        "/github",
      );
      expect(within(alert).queryByRole("button", { name: "Réessayer" })).toBeNull();
    },
  );

  it("PROVIDER_AUTH_EXPIRED, développeur : consigne sans lien", async () => {
    const { alert } = await failWith(
      apiError("PROVIDER_AUTH_EXPIRED", { kind: "installation", refreshable: false }),
      "dev",
    );
    expect(alert).toHaveTextContent(
      "Demandez à un propriétaire ou à un administrateur d'autoriser de nouveau Koklo.",
    );
    expect(within(alert).queryByRole("link")).toBeNull();
  });

  it("FORBIDDEN, développeur : « Vous n'avez pas le droit d'enregistrer dans la spec. »", async () => {
    const { alert } = await failWith(apiError("FORBIDDEN"), "dev");
    expect(alert).toHaveTextContent("Vous n'avez pas le droit d'enregistrer dans la spec.");
    expect(within(alert).getByRole("button", { name: "Fermer" })).toBeVisible();
    expect(within(alert).queryByRole("button", { name: "Aller à Éléments liés" })).toBeNull();
  });

  it("FORBIDDEN, designer (écran lié côté client, refus serveur) : explication et « Aller à Éléments liés » vers « Écrans »", async () => {
    const { panel, alert } = await failWith(apiError("FORBIDDEN"), "designer", linkScreen);
    expect(
      within(alert).getByText(
        "Vous ne pouvez enregistrer que les fonctionnalités liées à un écran",
      ),
    ).toBeVisible();
    expect(alert).toHaveTextContent(
      "Ajoutez un écran dans « Éléments liés », ou demandez à un développeur.",
    );
    await userEvent.click(within(alert).getByRole("button", { name: "Aller à Éléments liés" }));
    await waitFor(() => expect(linkField(panel, "Écrans")).toHaveFocus());
  });

  it("NOT_FOUND : « Ce projet n'a plus de dépôt de spec », lien « Voir les projets », « Fermer », saisie gardée", async () => {
    const { panel, alert } = await failWith(apiError("NOT_FOUND"));
    expect(within(alert).getByText("Ce projet n'a plus de dépôt de spec")).toBeVisible();
    expect(alert).toHaveTextContent("Ou il n'existe plus. Votre saisie est gardée.");
    expect(within(alert).getByRole("link", { name: "Voir les projets" })).toHaveAttribute(
      "href",
      "/projects",
    );
    expect(within(alert).getByRole("button", { name: "Fermer" })).toBeVisible();
    expect(titleField(panel)).toHaveValue(NEW_TITLE);
  });

  it("write_conflict à la création : « La spec a bougé pendant l'enregistrement. Réessayez. » + « Réessayer »", async () => {
    const { alert } = await failWith(apiError("SPEC_BATCH_CONFLICT", { reason: "write_conflict" }));
    expect(alert).toHaveTextContent("La spec a bougé pendant l'enregistrement. Réessayez.");
    expect(within(alert).getByRole("button", { name: "Réessayer" })).toBeVisible();
    expect(
      within(alert).queryByRole("button", { name: "Recharger la version actuelle" }),
    ).toBeNull();
  });

  it("idempotency_key_reused : « Cet envoi ne peut pas être repris tel quel » + « Réessayer »", async () => {
    const { alert } = await failWith(
      apiError("SPEC_BATCH_CONFLICT", { reason: "idempotency_key_reused" }),
    );
    expect(within(alert).getByText("Cet envoi ne peut pas être repris tel quel")).toBeVisible();
    expect(alert).toHaveTextContent("Réessayez : un nouvel envoi sera préparé avec votre saisie.");
    expect(within(alert).getByRole("button", { name: "Réessayer" })).toBeVisible();
  });

  it("VALIDATION sur un champ du formulaire : « Une valeur est refusée », ligne technique, lien vers le champ", async () => {
    const { panel, alert } = await failWith(
      apiError("VALIDATION", { field: "title", message: "Secret serveur <b>x</b>" }),
    );
    expect(within(alert).getByText("Une valeur est refusée")).toBeVisible();
    expect(alert).toHaveTextContent("Champ : title");
    expect(alert.textContent).not.toContain("Secret serveur");
    await userEvent.click(within(alert).getByRole("link", { name: /Titre|title/ }));
    await waitFor(() => expect(titleField(panel)).toHaveFocus());
  });

  it("VALIDATION sur un champ inconnu : texte générique, message du serveur jamais affiché", async () => {
    const { alert } = await failWith(
      apiError("VALIDATION", { field: "branch", message: "Secret serveur" }),
    );
    expect(within(alert).getByText("Une valeur est refusée")).toBeVisible();
    expect(alert.textContent).not.toContain("Secret serveur");
    expect(document.body.textContent).not.toContain("Secret serveur");
  });

  it.each([
    ["code inconnu", apiError("WEIRD_CODE_42")],
    ["raison de conflit inconnue", apiError("SPEC_BATCH_CONFLICT", { reason: "weird_reason" })],
    [
      "SPEC_INDEX_FAILED (n'est pas une erreur de submit)",
      apiError("SPEC_INDEX_FAILED", { errorCode: "spec_too_large" }),
    ],
  ])(
    "%s : « L'enregistrement n'a pas abouti. Votre saisie est gardée. » + « Réessayer », valeur brute jamais affichée",
    async (_name, error) => {
      const { panel, alert } = await failWith(error);
      expect(alert).toHaveTextContent("L'enregistrement n'a pas abouti. Votre saisie est gardée.");
      expect(within(alert).getByRole("button", { name: "Réessayer" })).toBeVisible();
      expect(document.body.textContent).not.toMatch(
        /WEIRD_CODE|weird_reason|SPEC_INDEX_FAILED|spec_too_large/,
      );
      expect(titleField(panel)).toHaveValue(NEW_TITLE);
    },
  );
});

async function linkScreen(panel: Panel): Promise<void> {
  await openLinks(panel);
  await setText(linkField(panel, "Écrans"), "S-login");
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("SPEC_INVALID : diagnostics liés aux champs (§4.7)", () => {
  const invalid = (report = REPORT()) => failWith(apiError("SPEC_INVALID", { report }));

  it("« La spec obtenue ne serait pas valide », rien d'écrit, liste des diagnostics, saisie conservée", async () => {
    const { panel, alert } = await invalid();
    expect(within(alert).getByText("La spec obtenue ne serait pas valide")).toBeVisible();
    expect(alert).toHaveTextContent("Rien n'a été écrit. Corrigez les points ci-dessous.");
    expect(alert).toHaveTextContent("Écran inconnu dans la spec");
    expect(alert).toHaveTextContent("Structure inattendue");
    expect(titleField(panel)).toHaveValue(NEW_TITLE);
    expect(panel.getAllByRole("alert")).toHaveLength(1);
  });

  it("équipe : code du diagnostic en mono et identifiant d'entité", async () => {
    const { alert } = await invalid();
    const code = within(alert).getByText("unknown_screen");
    expect(code.className).toMatch(/font-mono/);
    expect(within(alert).getByText("S-inconnu").className).toMatch(/font-mono/);
  });

  it("un diagnostic dont le pointeur nomme un champ devient un lien qui y place le focus et le marque invalide", async () => {
    const { panel, alert } = await invalid();
    const link = within(alert).getByRole("link", { name: /Écran inconnu dans la spec/ });
    await userEvent.click(link);
    await waitFor(() => expect(linkField(panel, "Écrans")).toHaveFocus());
    expect(linkField(panel, "Écrans")).toHaveAttribute("aria-invalid", "true");
    expect(panel.getByRole("button", { name: /Éléments liés/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("un diagnostic sans champ connu reste dans la liste, sans lien", async () => {
    const { alert } = await invalid();
    expect(within(alert).queryByRole("link", { name: /Structure inattendue/ })).toBeNull();
    expect(within(alert).getByText(/Structure inattendue/)).toBeVisible();
  });

  it("rapport tronqué : « D'autres problèmes ne sont pas affichés. »", async () => {
    const { alert } = await invalid(REPORT({ truncated: true }));
    expect(alert).toHaveTextContent("D'autres problèmes ne sont pas affichés.");
  });

  it("rapport non tronqué : pas de mention de troncature", async () => {
    const { alert } = await invalid();
    expect(alert.textContent).not.toContain("D'autres problèmes");
  });

  it("jusqu'à 100 diagnostics affichés", async () => {
    const issue = (n: number) => ({
      rule: 7,
      code: `c${n}`,
      severity: "error",
      path: "p",
      pointer: "/x",
      message: `Problème numéro ${n}`,
    });
    const { alert } = await invalid(
      REPORT({ issues: Array.from({ length: 100 }, (_, i) => issue(i + 1)) }),
    );
    expect(alert).toHaveTextContent("Problème numéro 100");
    expect(within(alert).getAllByText(/^Problème numéro/)).toHaveLength(100);
  });
});

describe("Après un échec, la saisie n'est jamais perdue", () => {
  it.each([
    ["réseau", new TypeError("x")],
    ["INTERNAL", apiError("INTERNAL", { requestId: "r" })],
    ["503", apiError("PROVIDER_UNAVAILABLE")],
    ["SPEC_INVALID", apiError("SPEC_INVALID", { report: REPORT() })],
  ])("%s : champs intacts, boutons de nouveau actifs, brouillon écrit", async (_name, error) => {
    const { panel } = await failWith(error);
    expect(titleField(panel)).toHaveValue(NEW_TITLE);
    expect(titleField(panel)).not.toHaveAttribute("readonly");
    expect(panel.getByRole("button", { name: "Enregistrer" })).toBeEnabled();
    await waitFor(() => expect(localStorage.getItem(draftKey(PROJECT_ID, "new"))).not.toBeNull());
  });

  it("une alerte à la fois : un nouvel échec remplace le précédent", async () => {
    const { panel } = await failWith(new TypeError("x"));
    procedures.specBatchSubmit.mockRejectedValue(apiError("PROVIDER_RATE_LIMITED"));
    await userEvent.click(panel.getByRole("button", { name: "Réessayer" }));
    await panel.findByText("Trop de demandes pour le moment");
    expect(panel.getAllByRole("alert")).toHaveLength(1);
    expect(panel.queryByText("Impossible de confirmer l'enregistrement")).toBeNull();
  });
});
