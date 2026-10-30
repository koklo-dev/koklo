import { describe, expect, it } from "vitest";
import { canonicalize, checkSpec } from "../src/index.ts";
import { deepFreeze, patch, seeded, withFiles } from "./helpers.ts";

const SCREEN = "design/screens/S-register.json";
const messy = () =>
  withFiles({
    [SCREEN]: patch(SCREEN, "T-user.email", "T-ghost.email").replace(
      '"E-auth-register"',
      '"E-ghost"',
    ),
    "data/tables/T-audit.yaml": "id: T-audit\nchamps: []\n",
    "api/endpoints/E-ghost2.yaml": "id: E-ghost2\nmethode: GET\nchemin: /g\n",
    "data/tables/T-bad.yaml": "id: [",
    "tests/scenarios/F-001-inscription.yaml": null,
  });

describe("CA7 rapport", () => {
  const report = checkSpec(messy());

  it("a la forme {ok, counts, issues[]} et chaque issue porte tous ses champs", () => {
    expect(Object.keys(report).sort()).toEqual(["counts", "issues", "ok"]);
    expect(report.issues.length).toBeGreaterThanOrEqual(6);
    for (const issue of report.issues) {
      expect(
        ["rule", "code", "severity", "path", "pointer", "message"].every((k) => k in issue),
      ).toBe(true);
      expect([4, 5, 7, "structure"]).toContain(issue.rule);
      expect(["error", "warning"]).toContain(issue.severity);
      expect(typeof issue.pointer).toBe("string");
      if (issue.pointer !== "") expect(issue.pointer.startsWith("/")).toBe(true);
    }
  });

  it("counts est exact, ok est faux ssi une erreur existe", () => {
    const errors = report.issues.filter((i) => i.severity === "error").length;
    const warnings = report.issues.filter((i) => i.severity === "warning").length;
    expect(report.counts).toEqual({ error: errors, warning: warnings });
    expect(report.ok).toBe(errors === 0);
    expect(report.ok).toBe(false);
  });

  it("la sévérité suit la règle : 4, 5 et structure = error, 7 = warning", () => {
    for (const issue of report.issues) {
      expect(issue.severity).toBe(issue.rule === 7 ? "warning" : "error");
    }
  });

  it("tri total : path, puis pointer, puis code, puis message (unités UTF-16)", () => {
    const key = (i: { path: string; pointer: string; code: string; message: string }) => [
      i.path,
      i.pointer,
      i.code,
      i.message,
    ];
    const sorted = [...report.issues].sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      for (let n = 0; n < 4; n++) {
        if ((ka[n] as string) < (kb[n] as string)) return -1;
        if ((ka[n] as string) > (kb[n] as string)) return 1;
      }
      return 0;
    });
    expect(report.issues).toEqual(sorted);
  });

  it("même sortie quel que soit l'ordre des fichiers en entrée (permutations à graine fixe)", () => {
    const expected = canonicalize(report);
    const rand = seeded(40);
    for (let run = 0; run < 25; run++) {
      const files = messy();
      for (let i = files.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [files[i], files[j]] = [files[j] as never, files[i] as never];
      }
      expect(canonicalize(checkSpec(files))).toBe(expected);
    }
  });

  it("canonicalize(report) identique sur deux exécutions, entrée gelée comprise", () => {
    const frozen = deepFreeze(messy());
    expect(canonicalize(checkSpec(frozen))).toBe(canonicalize(checkSpec(frozen)));
  });

  it("le rapport sérialisé est lui-même stable à la double écriture", () => {
    const once = canonicalize(report);
    expect(canonicalize(JSON.parse(once))).toBe(once);
  });
});
