import { describe, expect, it } from "vitest";
import {
  featureDetail,
  featureSummary,
  input,
  isValid,
  output,
  proc,
  SHA,
  specHead,
  UUID,
} from "./support.ts";

const FEATURE_STATUSES = ["brouillon", "specifiee", "implementee", "adoptee"];
const FEATURE_PRIORITIES = ["must", "should", "could", "wont"];

describe("S0 présence des procédures de lecture de spec", () => {
  it.each(["spec.head", "spec.listFeatures", "spec.getFeature"])("%s existe", (name) => {
    expect(proc(name), name).toBeDefined();
  });
});

describe("S1 spec.head", () => {
  const i = () => input("spec.head");
  it("entrée : projectId obligatoire ; branch ou commitSha, jamais les deux", async () => {
    expect(await isValid(i(), { projectId: UUID })).toBe(true);
    expect(await isValid(i(), { projectId: UUID, branch: "cadrage" })).toBe(true);
    expect(await isValid(i(), { projectId: UUID, commitSha: SHA })).toBe(true);
    expect(await isValid(i(), { projectId: UUID, branch: "cadrage", commitSha: SHA })).toBe(false);
    expect(await isValid(i(), {})).toBe(false);
    expect(await isValid(i(), { projectId: "x" })).toBe(false);
    expect(await isValid(i(), { projectId: UUID, branch: "" })).toBe(false);
    expect(await isValid(i(), { projectId: UUID, commitSha: "pas-un-sha" })).toBe(false);
  });
  it("sortie : tête indexée, ou null si la branche n'est pas encore indexée", async () => {
    const o = output("spec.head");
    expect(await isValid(o, specHead)).toBe(true);
    expect(await isValid(o, null)).toBe(true);
    expect(
      await isValid(o, { ...specHead, status: "failed", errorCode: "STRUCT_YAML_SYNTAX" }),
    ).toBe(true);
    for (const status of ["building", "ready", "failed"]) {
      expect(await isValid(o, { ...specHead, status }), status).toBe(true);
    }
    expect(await isValid(o, { ...specHead, status: "stale" })).toBe(false);
    expect(await isValid(o, { ...specHead, errorCode: undefined })).toBe(false);
    expect(await isValid(o, { ...specHead, commitSha: undefined })).toBe(false);
    expect(await isValid(o, { ...specHead, indexedAt: "hier" })).toBe(false);
    expect(await isValid(o, { ...specHead, counts: { features: 1, tables: 2 } })).toBe(false);
    expect(
      await isValid(o, { ...specHead, counts: { features: -1, tables: 0, endpoints: 0 } }),
    ).toBe(false);
    expect(await isValid(o, undefined)).toBe(false);
  });
});

describe("S2 spec.listFeatures", () => {
  const i = () => input("spec.listFeatures");
  it("entrée : filtres status/priority, branch ou commitSha, pagination", async () => {
    expect(await isValid(i(), { projectId: UUID })).toBe(true);
    expect(
      await isValid(i(), {
        projectId: UUID,
        status: "specifiee",
        priority: "could",
        branch: "main",
        limit: 100,
        cursor: "c",
      }),
    ).toBe(true);
    expect(await isValid(i(), { projectId: UUID, commitSha: SHA })).toBe(true);
    for (const status of FEATURE_STATUSES) {
      expect(await isValid(i(), { projectId: UUID, status }), status).toBe(true);
    }
    for (const priority of FEATURE_PRIORITIES) {
      expect(await isValid(i(), { projectId: UUID, priority }), priority).toBe(true);
    }
  });
  it("refuse statut/priorité inconnus, branch+commitSha, limit hors bornes, projectId absent", async () => {
    expect(await isValid(i(), { projectId: UUID, status: "done" })).toBe(false);
    expect(await isValid(i(), { projectId: UUID, priority: "high" })).toBe(false);
    expect(await isValid(i(), { projectId: UUID, branch: "main", commitSha: SHA })).toBe(false);
    expect(await isValid(i(), { projectId: UUID, limit: 0 })).toBe(false);
    expect(await isValid(i(), { projectId: UUID, limit: 101 })).toBe(false);
    expect(await isValid(i(), {})).toBe(false);
    expect(await isValid(i(), { projectId: "x" })).toBe(false);
  });
  it("sortie : page de résumés { items, nextCursor }", async () => {
    const o = output("spec.listFeatures");
    expect(await isValid(o, { items: [featureSummary], nextCursor: null })).toBe(true);
    expect(await isValid(o, { items: [], nextCursor: "c" })).toBe(true);
    expect(await isValid(o, [featureSummary])).toBe(false);
    expect(
      await isValid(o, { items: [{ ...featureSummary, specId: "F-1" }], nextCursor: null }),
    ).toBe(false);
    expect(
      await isValid(o, { items: [{ ...featureSummary, status: "done" }], nextCursor: null }),
    ).toBe(false);
    expect(
      await isValid(o, { items: [{ ...featureSummary, priority: "high" }], nextCursor: null }),
    ).toBe(false);
    for (const field of Object.keys(featureSummary)) {
      expect(
        await isValid(o, { items: [{ ...featureSummary, [field]: undefined }], nextCursor: null }),
        field,
      ).toBe(false);
    }
  });
});

describe("S3 spec.getFeature", () => {
  const i = () => input("spec.getFeature");
  it("entrée : projectId uuid et specId F-nnn", async () => {
    expect(await isValid(i(), { projectId: UUID, specId: "F-001" })).toBe(true);
    expect(await isValid(i(), { projectId: UUID, specId: "F-1234" })).toBe(true);
    for (const specId of ["F-1", "f-001", "F-0a1", "AC-1", "T-user", "", "F-001 "]) {
      expect(await isValid(i(), { projectId: UUID, specId }), specId).toBe(false);
    }
    expect(await isValid(i(), { specId: "F-001" })).toBe(false);
    expect(await isValid(i(), { projectId: "x", specId: "F-001" })).toBe(false);
  });
  it("sortie : détail complet avec critères et étapes typées", async () => {
    const o = output("spec.getFeature");
    expect(await isValid(o, featureDetail)).toBe(true);
    expect(await isValid(o, { ...featureDetail, criteria: [], tables: [], endpoints: [] })).toBe(
      true,
    );
    for (const field of Object.keys(featureDetail)) {
      expect(await isValid(o, { ...featureDetail, [field]: undefined }), field).toBe(false);
    }
  });
  it("sortie : identifiants et énumérations contrôlés", async () => {
    const o = output("spec.getFeature");
    const withCriterion = (patch: object) => ({
      ...featureDetail,
      criteria: [{ ...featureDetail.criteria[0], ...patch }],
    });
    expect(await isValid(o, { ...featureDetail, specId: "F-1" })).toBe(false);
    expect(await isValid(o, { ...featureDetail, status: "done" })).toBe(false);
    expect(await isValid(o, { ...featureDetail, priority: "high" })).toBe(false);
    expect(await isValid(o, { ...featureDetail, commitSha: "xyz" })).toBe(false);
    expect(await isValid(o, withCriterion({ specId: "AC-x" }))).toBe(false);
    expect(await isValid(o, withCriterion({ specId: "F-001" }))).toBe(false);
    expect(await isValid(o, withCriterion({ position: 1.5 }))).toBe(false);
    expect(await isValid(o, withCriterion({ steps: [{ type: "puis", text: "x" }] }))).toBe(false);
    expect(await isValid(o, withCriterion({ steps: [{ type: "quand" }] }))).toBe(false);
    expect(await isValid(o, { ...featureDetail, tables: ["user"] })).toBe(false);
    expect(await isValid(o, { ...featureDetail, endpoints: ["T-user"] })).toBe(false);
    expect(await isValid(o, { ...featureDetail, screens: ["login"] })).toBe(false);
    expect(await isValid(o, { ...featureDetail, roles: ["owner"] })).toBe(false);
    expect(await isValid(o, { ...featureDetail, rules: ["R-1"] })).toBe(false);
    expect(await isValid(o, { ...featureDetail, nfr: ["perf"] })).toBe(false);
  });
});
