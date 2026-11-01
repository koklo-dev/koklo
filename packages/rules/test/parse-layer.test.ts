import { describe, expect, it } from "vitest";
import { parseLayer, parseWaivers, type RulesErrorCode } from "../src/index.ts";
import { FUTURE, layer, newRule, override, waiver } from "./compose-fixtures.ts";

const code = (r: { ok: boolean; error?: { code: RulesErrorCode } }) => r.error?.code;

const base = layer("project");
const bad: ReadonlyArray<[string, unknown, RulesErrorCode, string?]> = [
  ["niveau catalog", { level: "catalog" }, "layer.invalid-level", "level"],
  ["niveau inconnu", { level: "team" }, "layer.invalid-level", "level"],
  ["niveau absent", {}, "layer.invalid-shape", "level"],
  ["clé inconnue (strict)", { ...base, extra: 1 }, "layer.invalid-shape"],
  [
    "surcharge sans auteur",
    { ...base, override: [{ ruleId: "a.b", justification: "x", disabled: true }] },
    "layer.invalid-shape",
    "override.0.author",
  ],
  [
    "surcharge sans justification",
    { ...base, override: [{ ruleId: "a.b", author: "x", disabled: true }] },
    "layer.invalid-shape",
    "override.0.justification",
  ],
  [
    "surcharge sans effet",
    { ...base, override: [override("a.b")] },
    "layer.invalid-shape",
    "override.0",
  ],
  [
    "surcharge avec agents vide",
    { ...base, override: [override("a.b", { agents: [] })] },
    "layer.invalid-shape",
    "override.0.agents",
  ],
  [
    "expires de surcharge mal formée",
    { ...base, override: [override("a.b", { disabled: true, expires: "bientôt" })] },
    "waiver.invalid-expires",
    "override.0.expires",
  ],
  [
    "motif ..",
    { ...base, override: [override("a.b", { excludePaths: ["../x"] })] },
    "layer.invalid-pattern",
    "override.0.excludePaths.0",
  ],
  [
    "motif absolu",
    { ...base, add: [newRule("x.y", { paths: ["/etc/**"] })] },
    "layer.invalid-pattern",
    "add.0.paths.0",
  ],
  [
    "règle ajoutée invalide (agents vide)",
    { ...base, add: [newRule("x.y", { agents: [] })] },
    "layer.invalid-shape",
    "add.0.agents",
  ],
  [
    "règle ajoutée à id invalide",
    { ...base, add: [newRule("BAD ID")] },
    "layer.invalid-shape",
    "add.0.id",
  ],
  [
    "dérogation sans expires",
    { ...base, waivers: [{ ...waiver("a.b"), expires: undefined }] },
    "waiver.missing-expires",
    "waivers.0.expires",
  ],
  [
    "dérogation à expires mal formée",
    { ...base, waivers: [waiver("a.b", { expires: "2026-02-30" })] },
    "waiver.invalid-expires",
    "waivers.0.expires",
  ],
  [
    "dérogation sans justification",
    { ...base, waivers: [waiver("a.b", { justification: "" })] },
    "layer.invalid-shape",
    "waivers.0.justification",
  ],
  [
    "dérogation à fichier absolu",
    { ...base, waivers: [waiver("a.b", { file: "/etc/passwd" })] },
    "layer.invalid-pattern",
    "waivers.0.file",
  ],
];

describe("parseLayer", () => {
  it("accepte une couche complète et la renvoie telle quelle", () => {
    const full = layer("project", {
      profiles: ["security"],
      add: [newRule("x.new", { paths: ["packages/**"], excludePaths: ["**/*.test.ts"] })],
      override: [override("node.esm", { disabled: true, expires: FUTURE })],
      waivers: [waiver("node.tests")],
      lock: ["node.esm"],
    });
    expect(parseLayer(full)).toEqual({ ok: true, value: full });
  });
  it("accepte une couche minimale", () => {
    expect(parseLayer({ level: "group" })).toEqual({ ok: true, value: { level: "group" } });
  });
});

describe("parseLayer : refus", () => {
  it.each(bad)("refuse : %s", (_n, value, expected, path) => {
    const r = parseLayer(value);
    expect(r.ok).toBe(false);
    expect(code(r as never)).toBe(expected);
    if (path) expect((r as { error: { path?: string } }).error.path).toBe(path);
  });
  it.each([[null], [42], ["x"], [[]], [undefined]])("ne lève jamais (%j)", (v) => {
    expect(parseLayer(v)).toMatchObject({ ok: false });
  });
});

describe("parseWaivers", () => {
  it("accepte une liste valide (y compris vide)", () => {
    expect(parseWaivers([waiver("a.b")])).toEqual({ ok: true, value: [waiver("a.b")] });
    expect(parseWaivers([])).toEqual({ ok: true, value: [] });
  });
  it("refuse sans expires, avec le chemin de l'entrée fautive", () => {
    const r = parseWaivers([waiver("a.b"), { ...waiver("c.d"), expires: undefined }]);
    expect(r).toMatchObject({
      ok: false,
      error: { code: "waiver.missing-expires", path: "1.expires" },
    });
  });
  it.each([[null], [{}], ["x"]])("refuse un non-tableau (%j)", (v) => {
    expect(parseWaivers(v)).toMatchObject({ ok: false, error: { code: "layer.invalid-shape" } });
  });
});
