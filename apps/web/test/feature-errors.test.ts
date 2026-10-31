import type { ValidationReport } from "@koklo/contract";
import { describe, expect, it } from "vitest";
import {
  describeSaveError,
  type SaveErrorView,
  type SaveFailure,
} from "../src/lib/feature-errors.ts";
import { apiError } from "./support/web-mocks.ts";

/**
 * TK-48 / 48e : table unique des échecs d'enregistrement (S-feature-form §4.7). Le même rendu sert l'erreur
 * typée de `submit` et le lot terminal relu par `get`. Aucune valeur brute du serveur dans une phrase.
 */
const submit = (error: unknown): SaveFailure => ({ source: "submit", error });
const batch = (
  status: string,
  errorCode: string | null,
  report?: ValidationReport,
): SaveFailure => ({
  source: "batch",
  batch: { status, errorCode, report: report ?? null },
});
const view = (failure: SaveFailure, role = "dev", mode: "create" | "update" = "update") =>
  describeSaveError(failure, { role: role as never, mode });
const text = (v: SaveErrorView) => `${v.title} ${v.text}`;

const REPORT: ValidationReport = {
  ok: false,
  counts: { error: 2, warning: 0 },
  truncated: true,
  issues: [
    {
      rule: 4,
      code: "unknown_screen",
      severity: "error",
      path: "features/F-001.md",
      pointer: "/screens/0",
      entityId: "S-inconnu",
      message: "Écran inconnu",
    },
  ],
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: une ligne par cas du tableau §4.7
describe("describeSaveError, erreur de submit", () => {
  it("réseau coupé / délai dépassé (aucun code) : « Impossible de confirmer », même clé au réessai", () => {
    for (const error of [new TypeError("fetch failed"), new DOMException("t", "AbortError")]) {
      const v = view(submit(error));
      expect(v).toMatchObject({ kind: "network", actions: ["retry"], freshKey: false });
      expect(v.title).toBe("Impossible de confirmer l'enregistrement");
      expect(v.text).toContain(
        "Votre connexion a été interrompue. Réessayer ne créera pas de doublon.",
      );
    }
  });

  it("INTERNAL : « Nous ne savons pas si l'enregistrement a abouti », vérifier la liste, nouvelle clé", () => {
    const v = view(submit(apiError("INTERNAL", { requestId: "req-42" })));
    expect(v).toMatchObject({
      kind: "internal",
      actions: ["check-list", "retry"],
      freshKey: true,
      requestId: "req-42",
    });
    expect(v.title).toBe("Nous ne savons pas si l'enregistrement a abouti");
    expect(v.text).toContain(
      "Vérifiez la liste avant de réessayer, pour ne pas créer deux fois la même fonctionnalité.",
    );
  });

  it("503 : GitHub momentanément indisponible, rien d'écrit ; lien /github pour owner/admin seulement", () => {
    for (const role of ["owner", "admin"]) {
      const v = view(submit(apiError("PROVIDER_UNAVAILABLE")), role);
      expect(v).toMatchObject({
        kind: "unavailable",
        actions: ["retry"],
        freshKey: true,
        githubLink: true,
      });
      expect(text(v)).toContain("Vérifier l'état de l'application GitHub");
    }
    for (const role of ["dev", "designer", "client"]) {
      const v = view(submit(apiError("PROVIDER_UNAVAILABLE")), role);
      expect(v.githubLink).toBe(false);
      expect(text(v)).not.toContain("Vérifier l'état");
    }
    const v = view(submit(apiError("PROVIDER_UNAVAILABLE")), "owner");
    expect(v.title).toBe("GitHub est momentanément indisponible");
    expect(v.text).toContain("Rien n'a été écrit. Réessayez dans un instant.");
  });

  it("429 : « Trop de demandes », pas de compte à rebours (retryAfterMs ignoré)", () => {
    const v = view(submit(apiError("PROVIDER_RATE_LIMITED", { retryAfterMs: 7000 })));
    expect(v).toMatchObject({ kind: "rate-limited", actions: ["retry"], freshKey: true });
    expect(v.title).toBe("Trop de demandes pour le moment");
    expect(text(v)).toContain("Rien n'a été écrit. Réessayez dans un instant.");
    expect(text(v)).not.toMatch(/7|seconde/);
  });

  it("PROVIDER_AUTH_EXPIRED : lien GitHub pour owner/admin, consigne sinon", () => {
    const manager = view(
      submit(apiError("PROVIDER_AUTH_EXPIRED", { kind: "installation" })),
      "admin",
    );
    expect(manager).toMatchObject({
      kind: "auth-expired",
      githubLink: true,
      actions: ["github", "close"],
    });
    expect(manager.title).toBe("Koklo n'a plus accès au dépôt de spec");
    expect(manager.text).toContain(
      "Autorisez de nouveau Koklo sur GitHub, puis revenez enregistrer : votre saisie est gardée.",
    );
    const other = view(submit(apiError("PROVIDER_AUTH_EXPIRED")), "dev");
    expect(other).toMatchObject({ githubLink: false, actions: ["close"] });
    expect(other.text).toContain(
      "Demandez à un propriétaire ou à un administrateur d'autoriser de nouveau Koklo.",
    );
  });

  it("FORBIDDEN du designer : lier un écran, aller à « Éléments liés »", () => {
    const v = view(submit(apiError("FORBIDDEN")), "designer");
    expect(v).toMatchObject({ kind: "forbidden-designer", actions: ["goto-links", "close"] });
    expect(v.title).toBe("Vous ne pouvez enregistrer que les fonctionnalités liées à un écran");
    expect(v.text).toContain(
      "Ajoutez un écran dans « Éléments liés », ou demandez à un développeur.",
    );
  });

  it("FORBIDDEN d'un autre rôle : pas le droit d'enregistrer", () => {
    const v = view(submit(apiError("FORBIDDEN")), "client");
    expect(v).toMatchObject({ kind: "forbidden", actions: ["close"] });
    expect(text(v)).toContain("Vous n'avez pas le droit d'enregistrer dans la spec.");
  });

  it("NOT_FOUND : le projet n'a plus de dépôt de spec, saisie gardée", () => {
    const v = view(submit(apiError("NOT_FOUND")));
    expect(v).toMatchObject({ kind: "not-found", actions: ["projects", "close"] });
    expect(v.title).toBe("Ce projet n'a plus de dépôt de spec");
    expect(v.text).toContain("Ou il n'existe plus. Votre saisie est gardée.");
  });

  it("SPEC_INVALID : « La spec obtenue ne serait pas valide » avec le rapport (100 au plus, truncated)", () => {
    const v = view(submit(apiError("SPEC_INVALID", { report: REPORT })));
    expect(v).toMatchObject({ kind: "spec-invalid", freshKey: true, report: REPORT });
    expect(v.title).toBe("La spec obtenue ne serait pas valide");
    expect(v.text).toContain("Rien n'a été écrit. Corrigez les points ci-dessous.");
  });

  it("SPEC_BATCH_CONFLICT stale_base : « La spec a changé », action Recharger, nouvelle clé", () => {
    const v = view(submit(apiError("SPEC_BATCH_CONFLICT", { reason: "stale_base" })));
    expect(v).toMatchObject({ kind: "stale-base", actions: ["reload"], freshKey: true });
    expect(v.title).toBe("La spec a changé depuis que vous avez ouvert ce formulaire");
    expect(v.text).toContain(
      "Rien n'a été écrit. Rechargez la version actuelle : vos modifications sont conservées.",
    );
  });

  it("write_conflict : modification = recharger ; création = réessayer", () => {
    const error = apiError("SPEC_BATCH_CONFLICT", { reason: "write_conflict" });
    const edit = view(submit(error), "dev", "update");
    expect(edit).toMatchObject({ kind: "write-conflict", actions: ["reload"], freshKey: true });
    expect(edit.title).toBe("Cette fonctionnalité a changé ou n'existe plus dans la spec");
    expect(edit.text).toContain("Rechargez-la pour voir où elle en est.");
    const create = view(submit(error), "dev", "create");
    expect(create).toMatchObject({ kind: "write-conflict", actions: ["retry"] });
    expect(text(create)).toContain("La spec a bougé pendant l'enregistrement. Réessayez.");
  });

  it("idempotency_key_reused : réessayer prépare un nouvel envoi", () => {
    const v = view(submit(apiError("SPEC_BATCH_CONFLICT", { reason: "idempotency_key_reused" })));
    expect(v).toMatchObject({ kind: "key-reused", actions: ["retry"], freshKey: true });
    expect(v.title).toBe("Cet envoi ne peut pas être repris tel quel");
    expect(v.text).toContain("Réessayez : un nouvel envoi sera préparé avec votre saisie.");
  });

  it("VALIDATION : « Une valeur est refusée », champ du serveur, message brut jamais affiché", () => {
    const v = view(submit(apiError("VALIDATION", { field: "branch", message: "Secret <b>x</b>" })));
    expect(v).toMatchObject({ kind: "validation", field: "branch", freshKey: true });
    expect(v.title).toBe("Une valeur est refusée");
    expect(text(v)).not.toContain("Secret");
  });

  it.each([
    ["code inconnu", apiError("WEIRD_CODE_42")],
    ["raison de conflit inconnue", apiError("SPEC_BATCH_CONFLICT", { reason: "weird_reason" })],
    ["SPEC_INDEX_FAILED (non listé parmi les erreurs de submit)", apiError("SPEC_INDEX_FAILED")],
  ])("%s : texte générique, « Réessayer », jamais la valeur brute", (_name, error) => {
    const v = view(submit(error));
    expect(v.kind).toBe("generic");
    expect(v.title + v.text).toContain("L'enregistrement n'a pas abouti. Votre saisie est gardée.");
    expect(v.actions).toEqual(["retry"]);
    expect(text(v)).not.toMatch(/WEIRD|weird|SPEC_/);
  });

  it("le vocabulaire reste celui de l'utilisateur : ni lot, commit, branche, SHA, idempotence, payload", () => {
    const failures: SaveFailure[] = [
      submit(new TypeError("x")),
      submit(apiError("INTERNAL", { requestId: "r" })),
      submit(apiError("PROVIDER_UNAVAILABLE")),
      submit(apiError("PROVIDER_RATE_LIMITED")),
      submit(apiError("PROVIDER_AUTH_EXPIRED")),
      submit(apiError("FORBIDDEN")),
      submit(apiError("NOT_FOUND")),
      submit(apiError("SPEC_INVALID", { report: REPORT })),
      submit(apiError("SPEC_BATCH_CONFLICT", { reason: "stale_base" })),
      submit(apiError("SPEC_BATCH_CONFLICT", { reason: "write_conflict" })),
      submit(apiError("SPEC_BATCH_CONFLICT", { reason: "idempotency_key_reused" })),
      submit(apiError("VALIDATION", { field: "x", message: "y" })),
      submit(apiError("???")),
    ];
    for (const failure of failures) {
      for (const role of ["owner", "client"]) {
        expect(text(view(failure, role))).not.toMatch(
          /\blot\b|commit|branche|\bSHA\b|idempoten|payload/i,
        );
      }
    }
  });
});

describe("describeSaveError, lot terminal relu par specBatch.get", () => {
  it.each([
    ["failed", "INTERNAL", "internal"],
    ["failed", "PROVIDER_UNAVAILABLE", "unavailable"],
    ["failed", "PROVIDER_RATE_LIMITED", "rate-limited"],
    ["failed", "PROVIDER_AUTH_EXPIRED", "auth-expired"],
    ["failed", "FORBIDDEN", "forbidden"],
    ["failed", "SPEC_INVALID", "spec-invalid"],
    ["conflict", "stale_base", "stale-base"],
    ["conflict", "write_conflict", "write-conflict"],
  ] as const)("lot %s / %s : même rendu que l'erreur de submit (%s)", (status, code, kind) => {
    const fromBatch = view(batch(status, code, REPORT), "owner");
    expect(fromBatch.kind).toBe(kind);
  });

  it("lot failed/FORBIDDEN pour un designer : rendu du designer", () => {
    expect(view(batch("failed", "FORBIDDEN"), "designer").kind).toBe("forbidden-designer");
  });

  it("le texte d'un lot est identique à celui de l'erreur typée correspondante", () => {
    const typed = view(submit(apiError("PROVIDER_UNAVAILABLE")), "owner");
    const polled = view(batch("failed", "PROVIDER_UNAVAILABLE"), "owner");
    expect({ title: polled.title, text: polled.text }).toEqual({
      title: typed.title,
      text: typed.text,
    });
  });

  it("lot SPEC_INVALID : le rapport du lot est repris", () => {
    expect(view(batch("failed", "SPEC_INVALID", REPORT)).report).toEqual(REPORT);
  });

  it.each([
    ["failed", "OH_NO"],
    ["failed", null],
    ["conflict", "mystery"],
    ["exploded", "INTERNAL"],
  ])("lot %s / %s inconnu : texte générique, jamais la valeur brute", (status, code) => {
    const v = view(batch(status, code));
    expect(v.kind).toBe("generic");
    expect(text(v)).not.toMatch(/OH_NO|mystery|exploded/);
  });
});
