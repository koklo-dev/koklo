import { specBatchSubmitInputSchema } from "@koklo/contract";
import { beforeEach, describe, expect, it } from "vitest";
import { readPending, savePending } from "../src/lib/feature-draft.ts";
import { describeSaveError } from "../src/lib/feature-errors.ts";
import { checkDesignerScreens, EMPTY_VALUES, valuesFromDetail } from "../src/lib/feature-form.ts";
import { buildDeleteOperation, buildSubmitInput } from "../src/lib/feature-operation.ts";
import { DETAIL_TYPED } from "./support/feature-form.tsx";
import { PROJECT_ID, SCOPE, SHA } from "./support/features.tsx";
import { apiError } from "./support/web-mocks.ts";

/**
 * TK-48 / 48e-2, suppression : opération du contrat, contrôle préalable du designer, table des échecs en mode
 * « delete » et marqueur de suivi `kind: "delete"` (S-feature-form §4.7, §4.8, §5.2, §5.7, AC-48-24).
 */
beforeEach(() => localStorage.clear());

const KEY = "feature-0b8f3c52-5a53-4f8c-9d3a-1f1d3c1b7a10";
const apiFailure = (code: string, data?: Record<string, unknown>) => ({
  source: "submit" as const,
  error: apiError(code, data),
});

describe("buildDeleteOperation", () => {
  it("{ kind: 'feature.delete', specId } et rien d'autre", () => {
    expect(buildDeleteOperation("F-003")).toStrictEqual({
      kind: "feature.delete",
      specId: "F-003",
    });
  });

  it("l'entrée de specBatch.submit : une opération, baseSha = version lue, ni message ni autre champ", () => {
    const input = buildSubmitInput(
      { projectId: PROJECT_ID, idempotencyKey: KEY, branch: "main", baseSha: SHA },
      buildDeleteOperation("F-001"),
    );
    expect(input).toStrictEqual({
      projectId: PROJECT_ID,
      idempotencyKey: KEY,
      branch: "main",
      baseSha: SHA,
      operations: [{ kind: "feature.delete", specId: "F-001" }],
    });
    expect(specBatchSubmitInputSchema.safeParse(input).success).toBe(true);
  });
});

describe("checkDesignerScreens en suppression (règle documentée : au moins un écran avant)", () => {
  const withScreens = valuesFromDetail(DETAIL_TYPED);
  const withoutScreens = { ...withScreens, screens: "" };

  it("fonctionnalité liée à un écran : suppression permise, quelle que soit la saisie en cours", () => {
    expect(checkDesignerScreens("delete", withScreens, withScreens)).toBeNull();
    expect(checkDesignerScreens("delete", withScreens, withoutScreens)).toBeNull();
  });

  it("fonctionnalité sans écran lié (valeur lue) : refus préalable sur le champ « Écrans »", () => {
    expect(checkDesignerScreens("delete", withoutScreens, withoutScreens)).toStrictEqual({
      field: "screens",
      message: "Liez au moins un écran pour enregistrer cette fonctionnalité.",
    });
    expect(checkDesignerScreens("delete", withoutScreens, withScreens)).not.toBeNull();
  });

  it("sans valeur lue : refus (jamais d'envoi sans référence)", () => {
    expect(checkDesignerScreens("delete", null, EMPTY_VALUES)).not.toBeNull();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("describeSaveError en mode « delete » : la table unique de §4.7", () => {
  const owner = { role: "owner", mode: "delete" } as const;

  it("write_conflict (déjà supprimée ou modifiée) : « Cette fonctionnalité a changé ou n'existe plus dans la spec », recharger, nouvelle clé", () => {
    const view = describeSaveError(
      apiFailure("SPEC_BATCH_CONFLICT", { reason: "write_conflict" }),
      owner,
    );
    expect(view).toMatchObject({
      kind: "write-conflict",
      title: "Cette fonctionnalité a changé ou n'existe plus dans la spec",
      text: "Rechargez-la pour voir où elle en est.",
      actions: ["reload"],
      freshKey: true,
    });
  });

  it("lot terminal conflict/write_conflict : même rendu", () => {
    const view = describeSaveError(
      { source: "batch", batch: { status: "conflict", errorCode: "write_conflict" } },
      owner,
    );
    expect(view).toMatchObject({ kind: "write-conflict", actions: ["reload"], freshKey: true });
  });

  it("stale_base : « Recharger la version actuelle », nouvelle clé", () => {
    const view = describeSaveError(
      apiFailure("SPEC_BATCH_CONFLICT", { reason: "stale_base" }),
      owner,
    );
    expect(view).toMatchObject({ kind: "stale-base", actions: ["reload"], freshKey: true });
  });

  it("FORBIDDEN : designer = règle de l'écran ; autre rôle = refus simple", () => {
    expect(
      describeSaveError(apiFailure("FORBIDDEN"), { role: "designer", mode: "delete" }),
    ).toMatchObject({
      kind: "forbidden-designer",
      actions: ["goto-links", "close"],
    });
    expect(
      describeSaveError(apiFailure("FORBIDDEN"), { role: "dev", mode: "delete" }),
    ).toMatchObject({
      kind: "forbidden",
      actions: ["close"],
    });
  });

  it("NOT_FOUND (projet ou dépôt de spec disparu) : « Voir les projets », « Fermer »", () => {
    expect(describeSaveError(apiFailure("NOT_FOUND"), owner)).toMatchObject({
      kind: "not-found",
      title: "Ce projet n'a plus de dépôt de spec",
      actions: ["projects", "close"],
    });
  });

  it("SPEC_INVALID : diagnostics du rapport conservés, nouvelle clé", () => {
    const report = {
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
          message: "Le scénario TS-001 renvoie à F-001, qui n'existe plus.",
        },
      ],
    };
    const view = describeSaveError(apiFailure("SPEC_INVALID", { report }), owner);
    expect(view).toMatchObject({ kind: "spec-invalid", freshKey: true });
    expect(view.report?.issues[0]?.entityId).toBe("TS-001");
    // Texte propre à la suppression : ce n'est pas une saisie à corriger, une référence la bloque.
    expect(view.text).toContain("La fonctionnalité reste dans la spec");
    expect(view.text).not.toMatch(/Corrigez/);
  });

  it("SPEC_INVALID d'un lot terminal relu : même texte propre à la suppression ; l'enregistrement garde « Corrigez »", () => {
    const batch = { status: "failed", errorCode: "SPEC_INVALID" };
    const deleted = describeSaveError({ source: "batch", batch }, owner);
    expect(deleted.text).toContain("La fonctionnalité reste dans la spec");
    const updated = describeSaveError(
      { source: "batch", batch },
      { role: "owner", mode: "update" },
    );
    expect(updated.text).toContain("Corrigez les points ci-dessous");
  });

  it("INTERNAL de submit : pas de réessai aveugle (vérifier la liste d'abord), même clé pour un réessai identique", () => {
    const view = describeSaveError(apiFailure("INTERNAL", { requestId: "req-9" }), owner);
    expect(view).toMatchObject({
      kind: "internal",
      actions: ["check-list", "retry"],
      freshKey: false,
      requestId: "req-9",
    });
  });

  it("INTERNAL d'un lot terminal relu : échec connu, nouvelle clé", () => {
    const view = describeSaveError(
      { source: "batch", batch: { status: "failed", errorCode: "INTERNAL" } },
      owner,
    );
    expect(view).toMatchObject({ kind: "internal", freshKey: true });
  });

  it("réseau coupé : seul cas de même clé", () => {
    const view = describeSaveError(
      { source: "submit", error: new TypeError("fetch failed") },
      owner,
    );
    expect(view).toMatchObject({ kind: "network", freshKey: false });
  });

  it.each([
    ["PROVIDER_UNAVAILABLE", "unavailable"],
    ["PROVIDER_RATE_LIMITED", "rate-limited"],
    ["PROVIDER_AUTH_EXPIRED", "auth-expired"],
  ])("%s : même vue qu'en création et en modification", (code, kind) => {
    const del = describeSaveError(apiFailure(code), owner);
    const update = describeSaveError(apiFailure(code), { role: "owner", mode: "update" });
    expect(del.kind).toBe(kind);
    expect(del).toStrictEqual(update);
  });

  it("aucun terme de git dans les titres et textes (vocabulaire du client et de l'équipe)", () => {
    const codes = ["INTERNAL", "FORBIDDEN", "NOT_FOUND", "PROVIDER_UNAVAILABLE", "UNKNOWN_CODE"];
    for (const code of codes) {
      const view = describeSaveError(apiFailure(code), owner);
      expect(`${view.title} ${view.text}`).not.toMatch(
        /\blot\b|commit|branche|\bSHA\b|idempoten|payload/i,
      );
    }
  });
});

describe("marqueur de suivi d'une suppression (§5.7)", () => {
  const marker = (over: Record<string, unknown> = {}) => ({
    batchId: "01900000-0000-7000-8000-0000000000d1",
    kind: "delete" as const,
    specId: "F-001",
    title: "Connexion par e-mail",
    savedAt: new Date().toISOString(),
    ...over,
  });

  it("kind « delete » avec l'identifiant et le titre : écrit puis relu pour son propriétaire", () => {
    expect(savePending(SCOPE, PROJECT_ID, marker())).toBe(true);
    expect(readPending(SCOPE, PROJECT_ID)).toMatchObject({
      kind: "delete",
      specId: "F-001",
      title: "Connexion par e-mail",
    });
  });

  it("un autre compte ou une autre organisation ne le lit pas (cloisonnement) et il est supprimé", () => {
    savePending(SCOPE, PROJECT_ID, marker());
    expect(readPending({ ...SCOPE, userId: "autre" }, PROJECT_ID)).toBeNull();
    expect(readPending(SCOPE, PROJECT_ID)).toBeNull();
    savePending(SCOPE, PROJECT_ID, marker());
    expect(readPending({ ...SCOPE, organizationId: "autre-org" }, PROJECT_ID)).toBeNull();
  });

  it("un kind inconnu reste refusé", () => {
    savePending(SCOPE, PROJECT_ID, marker({ kind: "purge" }) as never);
    expect(readPending(SCOPE, PROJECT_ID)).toBeNull();
  });
});
