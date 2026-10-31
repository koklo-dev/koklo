import { describe, expect, it } from "vitest";
import { describeFeatureError, describeIndexFailure } from "../src/lib/spec-errors.ts";
import { apiError } from "./support/web-mocks.ts";

/** TK-48 / 48d : textes d'erreur par `errorCode` (S-features §4.8) et par code d'erreur de la fiche (§4.11). */
const TOO_LARGE = "La spec de ce projet est trop volumineuse pour être lue par Koklo.";
const GENERIC = "La spec de ce projet contient un problème qui empêche sa lecture.";
const text = (view: { title: string; text: string }) => `${view.title} ${view.text}`;

describe("describeIndexFailure", () => {
  it("spec_too_large : texte dédié", () => {
    expect(describeIndexFailure("spec_too_large")).toBe(TOO_LARGE);
  });

  it.each([
    ["absent", undefined],
    ["null", null],
    ["vide", ""],
    ["inconnu", "yaml_parse_boom"],
    ["avec sel", "<script>alert(1)</script>"],
  ])("code %s : texte générique, jamais la valeur brute", (_label, code) => {
    expect(describeIndexFailure(code)).toBe(GENERIC);
    if (code) expect(describeIndexFailure(code)).not.toContain(code);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("describeFeatureError — un état par code", () => {
  it("NOT_FOUND : la fonctionnalité n'existe plus, sans « Réessayer »", () => {
    const view = describeFeatureError(apiError("NOT_FOUND"), "dev");
    expect(view).toMatchObject({ kind: "not-found", retry: false, githubLink: false });
    expect(text(view)).toContain("Cette fonctionnalité n'existe plus dans la spec.");
  });

  it("PROVIDER_UNAVAILABLE : détail indisponible, liste consultable, « Réessayer »", () => {
    const view = describeFeatureError(apiError("PROVIDER_UNAVAILABLE"), "designer");
    expect(view).toMatchObject({ kind: "unavailable", retry: true, githubLink: false });
    expect(text(view)).toContain("Le détail est momentanément indisponible");
    expect(text(view)).toContain("La liste reste consultable. Réessayez dans un instant.");
  });

  it.each(["owner", "admin"] as const)("PROVIDER_UNAVAILABLE : lien /github pour %s", (role) => {
    const view = describeFeatureError(apiError("PROVIDER_UNAVAILABLE"), role);
    expect(view.githubLink).toBe(true);
    expect(text(view)).toContain("Vérifiez l'état de l'application GitHub");
  });

  it.each(["dev", "designer"] as const)(
    "PROVIDER_UNAVAILABLE : %s lit la consigne, sans lien",
    (role) => {
      expect(describeFeatureError(apiError("PROVIDER_UNAVAILABLE"), role).githubLink).toBe(false);
    },
  );

  it.each(["client", "business"] as const)(
    "PROVIDER_UNAVAILABLE : %s ne reçoit ni consigne GitHub ni lien",
    (role) => {
      const view = describeFeatureError(apiError("PROVIDER_UNAVAILABLE"), role);
      expect(view.githubLink).toBe(false);
      expect(text(view)).not.toMatch(/GitHub/);
    },
  );

  it("PROVIDER_RATE_LIMITED : message neutre sans compte à rebours", () => {
    const view = describeFeatureError(
      apiError("PROVIDER_RATE_LIMITED", { retryAfterMs: 42_000 }),
      "owner",
    );
    expect(view).toMatchObject({ kind: "rate-limited", retry: true, githubLink: false });
    expect(text(view)).toContain("Trop de demandes pour le moment. Réessayez dans un instant.");
    expect(text(view)).not.toMatch(/42|seconde/);
  });

  it("PROVIDER_AUTH_EXPIRED : propriétaire/administrateur autorisent de nouveau, avec lien /github", () => {
    for (const role of ["owner", "admin"] as const) {
      const view = describeFeatureError(
        apiError("PROVIDER_AUTH_EXPIRED", { kind: "installation", refreshable: false }),
        role,
      );
      expect(view).toMatchObject({ kind: "auth-expired", githubLink: true });
      expect(text(view)).toContain("Koklo n'a plus accès au dépôt de spec");
      expect(text(view)).toContain(
        "Autorisez de nouveau Koklo sur GitHub, puis revenez à cette fiche.",
      );
    }
  });

  it.each(["dev", "designer", "client", "business"] as const)(
    "PROVIDER_AUTH_EXPIRED : %s est renvoyé vers un propriétaire ou un administrateur, sans lien",
    (role) => {
      const view = describeFeatureError(
        apiError("PROVIDER_AUTH_EXPIRED", { kind: "user", refreshable: true }),
        role,
      );
      expect(view.githubLink).toBe(false);
      expect(text(view)).toContain(
        "Demandez à un propriétaire ou à un administrateur d'autoriser de nouveau Koklo.",
      );
    },
  );

  it("SPEC_INDEX_FAILED : état d'index en échec, texte par errorCode", () => {
    const view = describeFeatureError(
      apiError("SPEC_INDEX_FAILED", { errorCode: "spec_too_large", commitSha: "a".repeat(40) }),
      "owner",
    );
    expect(view.kind).toBe("index-failed");
    expect(text(view)).toContain(TOO_LARGE);
  });

  it("SPEC_INDEX_FAILED avec un code inconnu : générique, valeur brute absente", () => {
    const view = describeFeatureError(
      apiError("SPEC_INDEX_FAILED", { errorCode: "boom_interne", commitSha: "a".repeat(40) }),
      "owner",
    );
    expect(text(view)).toContain(GENERIC);
    expect(text(view)).not.toContain("boom_interne");
  });

  it.each([
    ["INTERNAL", apiError("INTERNAL")],
    ["réseau", new TypeError("fetch failed")],
    ["inconnu", apiError("TRUC_NOUVEAU")],
    ["non-objet", "boom"],
  ])("autre erreur (%s) : « Impossible de charger la fiche » + « Réessayer »", (_label, error) => {
    const view = describeFeatureError(error, "owner");
    expect(view).toMatchObject({ kind: "generic", retry: true, githubLink: false });
    expect(text(view)).toContain("Impossible de charger la fiche");
  });

  it("aucun texte ne contient un code technique", () => {
    const errors = [
      apiError("NOT_FOUND"),
      apiError("PROVIDER_UNAVAILABLE"),
      apiError("PROVIDER_RATE_LIMITED", {}),
      apiError("PROVIDER_AUTH_EXPIRED", { kind: "user", refreshable: true }),
      apiError("SPEC_INDEX_FAILED", { errorCode: "spec_too_large", commitSha: "a".repeat(40) }),
      apiError("INTERNAL"),
    ];
    for (const error of errors) {
      expect(text(describeFeatureError(error, "client"))).not.toMatch(
        /PROVIDER_|SPEC_INDEX|NOT_FOUND|INTERNAL|spec_too_large|commit|SHA/i,
      );
    }
  });
});
