import { describe, expect, it } from "vitest";
import { type Resolution, validateEvidence } from "../src/index.ts";
import { resolveOk } from "./compose-fixtures.ts";
import { activated, resolveStrict } from "./koklo-strict-fixtures.ts";

const SECRET = "SECRET-PROOF-TEXT-9f3a";
const base = (): Resolution => resolveOk();
const run = (artifact: unknown, res: Resolution = base()) => validateEvidence(res, artifact);

describe("sortie triée, sérialisable, déterministe", () => {
  const artifact = {
    evidence: [
      { ruleId: "node.tests", references: ["r"] },
      { ruleId: "global.scope", references: ["d"] },
      { ruleId: "z.unknown", references: ["x"] },
      { ruleId: "a.unknown", references: ["y"] },
    ],
    gates: [{ ruleId: "global.secrets", status: "pass" }],
  };

  it("verdicts triés par ruleId, inconnus triés", () => {
    const result = run(artifact);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.value.verdicts.map((v) => v.ruleId);
    expect(ids).toEqual([...ids].sort());
    expect(result.value.unknownRuleIds).toEqual(["a.unknown", "z.unknown"]);
  });

  it("l'ordre des preuves en entrée est sans effet", () => {
    const reversed = {
      evidence: [...artifact.evidence].reverse(),
      gates: [...artifact.gates].reverse(),
    };
    expect(run(reversed)).toEqual(run(artifact));
  });

  it("le rapport est identique après un aller-retour JSON", () => {
    const result = run(artifact);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("n'altère ni la résolution ni l'artefact", () => {
    const res = base();
    const before = JSON.stringify(res);
    const input = JSON.parse(JSON.stringify(artifact));
    validateEvidence(res, input);
    expect(JSON.stringify(res)).toBe(before);
    expect(input).toEqual(artifact);
  });

  it("un jeu de règles strict (verrouillées) est évalué comme les autres", () => {
    const res = resolveStrict({ layers: [activated] });
    const result = validateEvidence(res, {
      gates: [{ ruleId: "strict.fn-lines", status: "fail" }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verdicts.find((v) => v.ruleId === "strict.fn-lines")?.verdict).toBe("FAIL");
    expect(result.value.verdicts.find((v) => v.ruleId === "strict.adr-per-decision")?.verdict).toBe(
      "UNVERIFIED",
    );
    expect(result.value.overall).toBe("FAIL");
  });
});

describe("artefact invalide : erreur typée qui ne répète aucun texte de preuve", () => {
  const invalid: readonly [string, unknown][] = [
    ["null", null],
    ["tableau", []],
    ["texte", "evidence"],
    ["evidence non tableau", { evidence: SECRET }],
    ["item sans ruleId", { evidence: [{ references: [SECRET] }] }],
    ["références non texte", { evidence: [{ ruleId: "global.scope", references: [SECRET, 42] }] }],
    ["references non tableau", { evidence: [{ ruleId: "global.scope", references: SECRET }] }],
    ["statut inconnu", { gates: [{ ruleId: "global.secrets", status: SECRET }] }],
    ["clé inconnue", { evidence: [], [SECRET]: true }],
    ["clé inconnue dans un item", { evidence: [{ ruleId: "a.b", references: [], [SECRET]: 1 }] }],
    ["ruleId vide", { evidence: [{ ruleId: "", references: [SECRET] }] }],
  ];

  it.each(invalid)("%s : ok=false, code evidence.invalid-shape", (_n, artifact) => {
    const result = run(artifact);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("evidence.invalid-shape");
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });

  it.each(invalid)(
    "%s : ni message ni chemin ne contiennent le texte de la preuve",
    (_n, artifact) => {
      const result = run(artifact);
      expect(JSON.stringify(result)).not.toContain(SECRET);
    },
  );

  it("le chemin de l'erreur localise le champ fautif", () => {
    const result = run({ evidence: [{ ruleId: "global.scope", references: [1] }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.path).toBe("evidence.0.references.0");
  });

  it("ne lève jamais, même sur des entrées hostiles", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    for (const artifact of [cyclic, Symbol("x"), () => 1, 10n, Number.NaN, undefined]) {
      expect(() => run(artifact)).not.toThrow();
      expect(run(artifact).ok).toBe(false);
    }
  });

  it("un artefact valide ne recopie aucune référence dans le rapport", () => {
    const result = run({
      evidence: [{ ruleId: "global.scope", references: [SECRET] }],
    });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it("un artefact vide ou partiel est valide", () => {
    for (const artifact of [{}, { evidence: [] }, { gates: [] }])
      expect(run(artifact).ok).toBe(true);
  });
});
