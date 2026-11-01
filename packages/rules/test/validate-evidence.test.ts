import { describe, expect, it } from "vitest";
import {
  EVIDENCE_ERROR_CODES,
  type EvidenceReport,
  type Resolution,
  VERDICT_REASONS,
  VERDICTS,
  validateEvidence,
} from "../src/index.ts";
import { layer, newRule, override, resolveOk } from "./compose-fixtures.ts";

/** Résolution de référence (developer, profil node) : global.secrets (gate blocking verrouillée),
 *  global.scope (preuve blocking), node.tests (preuve blocking, qa-reviewer aussi), node.esm (consigne advisory). */
const resolution = (): Resolution =>
  resolveOk({
    layers: [
      layer("project", {
        add: [
          newRule("web.snapshot", {
            severity: "advisory",
            enforcement: { kind: "evidence", evidence: "Capture" },
          }),
          newRule("api.gate-lint", {
            severity: "advisory",
            enforcement: { kind: "gate", adapter: "biome" },
          }),
        ],
      }),
    ],
  });
const ok = (artifact: unknown, res: Resolution = resolution()): EvidenceReport => {
  const result = validateEvidence(res, artifact);
  if (!result.ok) throw new Error(`refusé : ${result.error.code}`);
  return result.value;
};
const verdictOf = (report: EvidenceReport, id: string) =>
  report.verdicts.find((v) => v.ruleId === id);
const proof = (ruleId: string, ...references: string[]) => ({ ruleId, references });
const pass = (ruleId: string) => ({ ruleId, status: "pass" });

describe("constantes", () => {
  it("trois verdicts, raisons et code d'erreur figés", () => {
    expect(VERDICTS).toEqual(["PASS", "FAIL", "UNVERIFIED"]);
    expect(VERDICT_REASONS).toEqual([
      "gate-passed",
      "gate-failed",
      "gate-not-run",
      "evidence-provided",
      "evidence-missing",
      "evidence-incomplete",
    ]);
    expect(EVIDENCE_ERROR_CODES).toEqual(["evidence.invalid-shape"]);
  });
});

describe("règle blocking sans preuve = UNVERIFIED, jamais PASS", () => {
  it("artefact vide : toutes les règles bloquantes sont UNVERIFIED", () => {
    const report = ok({});
    for (const id of ["global.secrets", "global.scope", "node.tests"]) {
      expect(verdictOf(report, id), id).toMatchObject({
        verdict: "UNVERIFIED",
        severity: "blocking",
      });
    }
    expect(report.overall).toBe("UNVERIFIED");
    expect(report.canPass).toBe(false);
  });

  it("raisons : gate-not-run pour un gate, evidence-missing pour une preuve", () => {
    const report = ok({});
    expect(verdictOf(report, "global.secrets")).toMatchObject({
      kind: "gate",
      reason: "gate-not-run",
    });
    expect(verdictOf(report, "global.scope")).toMatchObject({
      kind: "evidence",
      reason: "evidence-missing",
    });
  });

  it("une règle verrouillée sans preuve ne passe pas non plus", () => {
    expect(verdictOf(ok({}), "global.secrets")?.verdict).toBe("UNVERIFIED");
  });

  it("l'id seul d'un gate dans les preuves ne vaut pas exécution du gate", () => {
    const report = ok({ evidence: [proof("global.secrets", "log")] });
    expect(verdictOf(report, "global.secrets")).toMatchObject({
      verdict: "UNVERIFIED",
      reason: "gate-not-run",
    });
  });

  it("un résultat de gate ne vaut pas preuve pour une règle `evidence`", () => {
    const report = ok({ gates: [pass("global.scope")] });
    expect(verdictOf(report, "global.scope")?.verdict).toBe("UNVERIFIED");
  });
});

describe("PASS et FAIL", () => {
  const full = {
    evidence: [proof("global.scope", "diff.txt"), proof("node.tests", "report.html", "ci/42")],
    gates: [pass("global.secrets")],
  };

  it("toutes les règles bloquantes prouvées : PASS global", () => {
    const report = ok(full);
    expect(report.overall).toBe("PASS");
    expect(report.canPass).toBe(true);
    expect(verdictOf(report, "global.scope")).toMatchObject({
      verdict: "PASS",
      reason: "evidence-provided",
    });
    expect(verdictOf(report, "global.secrets")).toMatchObject({
      verdict: "PASS",
      reason: "gate-passed",
    });
  });

  it("un gate en échec : FAIL global, même si le reste est prouvé", () => {
    const report = ok({ ...full, gates: [{ ruleId: "global.secrets", status: "fail" }] });
    expect(verdictOf(report, "global.secrets")).toMatchObject({
      verdict: "FAIL",
      reason: "gate-failed",
    });
    expect(report.overall).toBe("FAIL");
    expect(report.canPass).toBe(false);
  });

  it("FAIL l'emporte sur UNVERIFIED", () => {
    const report = ok({ gates: [{ ruleId: "global.secrets", status: "fail" }] });
    expect(report.overall).toBe("FAIL");
  });

  it("gate à la fois pass et fail : le pire gagne", () => {
    const report = ok({
      ...full,
      gates: [pass("global.secrets"), { ruleId: "global.secrets", status: "fail" }],
    });
    expect(verdictOf(report, "global.secrets")?.verdict).toBe("FAIL");
  });

  it("preuve en double : toujours PASS", () => {
    const report = ok({
      ...full,
      evidence: [...full.evidence, proof("global.scope", "autre.txt")],
    });
    expect(verdictOf(report, "global.scope")?.verdict).toBe("PASS");
  });

  it("une résolution sans aucune règle gate ni preuve : PASS vide", () => {
    const empty: Resolution = { ...resolution(), rules: [] };
    const report = ok({}, empty);
    expect(report).toEqual({ verdicts: [], unknownRuleIds: [], overall: "PASS", canPass: true });
  });
});

describe("preuve incomplète", () => {
  it.each([
    ["références vides", proof("global.scope")],
    ["références blanches", proof("global.scope", "   ", "")],
  ])("%s : UNVERIFIED evidence-incomplete", (_n, item) => {
    const report = ok({ evidence: [item], gates: [pass("global.secrets")] });
    expect(verdictOf(report, "global.scope")).toMatchObject({
      verdict: "UNVERIFIED",
      reason: "evidence-incomplete",
    });
    expect(report.canPass).toBe(false);
  });

  it("une preuve complète parmi des preuves incomplètes suffit", () => {
    const report = ok({ evidence: [proof("global.scope"), proof("global.scope", "diff.txt")] });
    expect(verdictOf(report, "global.scope")?.verdict).toBe("PASS");
  });
});

describe("règles advisory", () => {
  it("advisory evidence/gate sans preuve : UNVERIFIED, overall PASS, canPass vrai", () => {
    const res = resolution();
    const advisory = res.rules.filter(
      (r) => r.severity === "advisory" && r.enforcement.kind !== "instruction",
    );
    expect(advisory.length).toBeGreaterThan(0);
    const report = ok(
      {
        evidence: [proof("global.scope", "a"), proof("node.tests", "b")],
        gates: [pass("global.secrets")],
      },
      res,
    );
    for (const rule of advisory) {
      expect(verdictOf(report, rule.id), rule.id).toMatchObject({
        severity: "advisory",
        verdict: "UNVERIFIED",
      });
    }
    expect(report.overall).toBe("PASS");
    expect(report.canPass).toBe(true);
  });

  it("advisory en échec : FAIL listé mais overall reste PASS", () => {
    const report = ok({
      evidence: [proof("global.scope", "a"), proof("node.tests", "b")],
      gates: [pass("global.secrets"), { ruleId: "api.gate-lint", status: "fail" }],
    });
    expect(verdictOf(report, "api.gate-lint")).toMatchObject({
      verdict: "FAIL",
      severity: "advisory",
    });
    expect(report.canPass).toBe(true);
  });

  it("les règles `instruction` n'ont pas de verdict", () => {
    expect(verdictOf(ok({}), "node.esm")).toBeUndefined();
  });
});

describe("preuve pour une règle inconnue", () => {
  it("listée dans unknownRuleIds (triée, unique) sans changer les verdicts", () => {
    const base = ok({});
    const report = ok({
      evidence: [proof("zzz.unknown", "a"), proof("aaa.ghost", "b"), proof("zzz.unknown", "c")],
      gates: [pass("mmm.phantom")],
    });
    expect(report.unknownRuleIds).toEqual(["aaa.ghost", "mmm.phantom", "zzz.unknown"]);
    expect(report.verdicts).toEqual(base.verdicts);
    expect(report.overall).toBe(base.overall);
  });

  it("une preuve pour une règle instruction ou hors rôle est aussi signalée", () => {
    expect(ok({ evidence: [proof("node.esm", "a")] }).unknownRuleIds).toEqual(["node.esm"]);
  });

  it("une règle désactivée par surcharge devient inconnue", () => {
    const res = resolveOk({
      layers: [layer("project", { override: [override("global.scope", { disabled: true })] })],
    });
    const report = ok({ evidence: [proof("global.scope", "a")] }, res);
    expect(verdictOf(report, "global.scope")).toBeUndefined();
    expect(report.unknownRuleIds).toEqual(["global.scope"]);
  });
});
