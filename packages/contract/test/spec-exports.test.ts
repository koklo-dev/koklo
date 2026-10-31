import { describe, expect, expectTypeOf, it } from "vitest";
import * as api from "../src/index.ts";
import { generateOpenApi } from "../src/index.ts";
import { batch, featureDetail, isValid, repo, report, specHead } from "./support.ts";

describe("N1 l'index exporte les schémas de 0.5.0", () => {
  it("schémas et énumérations", () => {
    for (const name of [
      "repoRoleSchema",
      "repoModeSchema",
      "installationStatusSchema",
      "userAuthorizationSchema",
      "installationSchema",
      "repoSchema",
      "specIndexStatusSchema",
      "specHeadSchema",
      "featureStatusSchema",
      "featurePrioritySchema",
      "featureSummarySchema",
      "featureDetailSchema",
      "specOperationSchema",
      "specBatchStatusSchema",
      "specBatchSubmitInputSchema",
      "specBatchSchema",
      "specIssueSchema",
      "validationReportSchema",
      "installationCallbackQuerySchema",
      "installationCallbackOutcomeSchema",
    ]) {
      expect((api as Record<string, unknown>)[name], name).toBeDefined();
    }
  });
  it("les schémas exportés valident les fixtures", async () => {
    expect(await isValid(api.repoSchema, repo)).toBe(true);
    expect(await isValid(api.specHeadSchema, specHead)).toBe(true);
    expect(await isValid(api.featureDetailSchema, featureDetail)).toBe(true);
    expect(await isValid(api.specBatchSchema, batch)).toBe(true);
    expect(await isValid(api.validationReportSchema, report)).toBe(true);
    expect(await isValid(api.specIssueSchema, report.issues[0])).toBe(true);
    expect(await isValid(api.specIssueSchema, { ...report.issues[0], severity: "info" })).toBe(
      false,
    );
  });
});

describe("N1b énumérations fermées des schémas de 0.5.0", () => {
  it("énumérations fermées", () => {
    expect([...api.repoRoleSchema.options].sort()).toEqual([
      "back",
      "front",
      "mobile",
      "monorepo",
      "spec",
    ]);
    expect([...api.repoModeSchema.options].sort()).toEqual(["adopted", "new"]);
    expect([...api.installationStatusSchema.options].sort()).toEqual([
      "active",
      "deleted",
      "suspended",
    ]);
    expect([...api.userAuthorizationSchema.options].sort()).toEqual([
      "absent",
      "active",
      "expired",
    ]);
    expect([...api.specIndexStatusSchema.options].sort()).toEqual(["building", "failed", "ready"]);
    expect([...api.specBatchStatusSchema.options].sort()).toEqual([
      "committed",
      "committing",
      "conflict",
      "failed",
      "queued",
    ]);
    expect([...api.featureStatusSchema.options].sort()).toEqual([
      "adoptee",
      "brouillon",
      "implementee",
      "specifiee",
    ]);
    expect([...api.featurePrioritySchema.options].sort()).toEqual([
      "could",
      "must",
      "should",
      "wont",
    ]);
  });
});

describe("N2 callback GitHub : exports partagés, hors oRPC et hors OpenAPI", () => {
  it("installationCallbackOutcomeSchema : enum fermé de 5 résultats", () => {
    expect([...api.installationCallbackOutcomeSchema.options].sort()).toEqual([
      "already_linked",
      "denied",
      "installed",
      "invalid_state",
      "provider_error",
    ]);
  });
  it("installationCallbackQuerySchema : state obligatoire, installation_id et code optionnels (TK-48a2)", async () => {
    const q = api.installationCallbackQuerySchema;
    const ok = { installation_id: "12345", code: "abc", state: "s.ig", setup_action: "install" };
    expect(await isValid(q, ok)).toBe(true);
    expect(
      await isValid(q, { installation_id: "12345", state: "s.ig", setup_action: "update" }),
    ).toBe(true);
    // Ré-autorisation : GitHub ne renvoie pas installation_id, l'identifiant vient de l'état signé.
    expect(await isValid(q, { state: "s.ig", code: "abc" })).toBe(true);
    expect(await isValid(q, { ...ok, installation_id: undefined })).toBe(true);
    expect(await isValid(q, { ...ok, installation_id: "" })).toBe(false);
    expect(await isValid(q, { ...ok, state: undefined })).toBe(false);
    expect(await isValid(q, { ...ok, state: "" })).toBe(false);
  });
  it("aucun chemin /api/github dans l'OpenAPI ni dans le routeur", async () => {
    const doc = (await generateOpenApi()) as { paths: Record<string, unknown> };
    expect(
      Object.keys(doc.paths).filter((p) => p.includes("github") || p.includes("callback")),
    ).toEqual([]);
    expect("callback" in api.contract).toBe(false);
  });
});

describe("N3 types inférés exportés", () => {
  it("types de sortie", () => {
    expectTypeOf<api.RepoOutput>().toHaveProperty("defaultBranch");
    expectTypeOf<api.RepoOutput["specPath"]>().toEqualTypeOf<string | null>();
    expectTypeOf<api.RepoOutput["role"]>().toEqualTypeOf<
      "spec" | "front" | "back" | "monorepo" | "mobile"
    >();
    expectTypeOf<api.SpecHeadOutput>().toEqualTypeOf<{
      branch: string;
      commitSha: string;
      status: "building" | "ready" | "failed";
      errorCode: string | null;
      indexedAt: string;
      counts: { features: number; tables: number; endpoints: number };
    } | null>();
    expectTypeOf<api.FeatureDetail>().toHaveProperty("criteria");
    expectTypeOf<api.SpecBatchOutput>().toHaveProperty("results");
    expectTypeOf<api.SpecBatchOutput["commitSha"]>().toEqualTypeOf<string | null>();
  });
  it("types d'entrée et union des opérations", () => {
    expectTypeOf<api.SpecBatchSubmitInput>().toHaveProperty("idempotencyKey");
    expectTypeOf<api.SpecBatchSubmitInput["operations"]>().toEqualTypeOf<api.SpecOperation[]>();
    expectTypeOf<api.SpecOperation["kind"]>().toEqualTypeOf<
      "feature.create" | "feature.update" | "feature.delete"
    >();
    expectTypeOf<Extract<api.SpecOperation, { kind: "feature.delete" }>>().toEqualTypeOf<{
      kind: "feature.delete";
      specId: string;
    }>();
    expectTypeOf<Extract<api.SpecOperation, { kind: "feature.create" }>>().toHaveProperty("title");
  });
});
