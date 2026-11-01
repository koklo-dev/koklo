import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as rules from "../src/index.ts";
import { layer, override, resolveOk } from "./compose-fixtures.ts";

describe("API publique du lot B", () => {
  it("exporte les points d'entrée", () => {
    for (const name of [
      "resolveEffectiveRules",
      "renderExplanation",
      "parseLayer",
      "parseWaivers",
      "isWeaker",
      "matchesPath",
      "matchesAny",
      "isValidPattern",
      "normalizePath",
      "LEVELS",
      "CONFLICT_REASONS",
      "RULES_ERROR_CODES",
    ]) {
      expect(rules, name).toHaveProperty(name);
    }
  });
  it("niveaux et codes figés", () => {
    expect(rules.LEVELS).toEqual(["catalog", "organization", "group", "project"]);
    expect(rules.CONFLICT_REASONS).toEqual([
      "locked",
      "unknown-rule",
      "unknown-profile",
      "expired",
    ]);
    expect(rules.RULES_ERROR_CODES).toHaveLength(11);
  });
});

describe("aucune horloge : `now` est un paramètre", () => {
  const layers = [
    layer("project", {
      override: [override("node.esm", { disabled: true, expires: "2026-12-01" })],
    }),
  ];
  it("le résultat ne dépend pas de l'heure système", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2000-01-01T00:00:00Z"));
      const a = resolveOk({ layers });
      vi.setSystemTime(new Date("2099-01-01T00:00:00Z"));
      expect(resolveOk({ layers })).toEqual(a);
    } finally {
      vi.useRealTimers();
    }
  });
  it("seul `now` décide de l'expiration", () => {
    expect(resolveOk({ layers, now: "2026-12-01" }).disabled).toHaveLength(1);
    expect(resolveOk({ layers, now: "2026-12-02" }).conflicts).toMatchObject([
      { reason: "expired" },
    ]);
  });
  it("les sources du lot B n'utilisent aucune horloge (en plus du contrôle de pureté global)", () => {
    const srcDir = resolve(import.meta.dirname, "../src");
    for (const f of readdirSync(srcDir).filter((x) => x.endsWith(".ts"))) {
      expect(readFileSync(resolve(srcDir, f), "utf8"), f).not.toMatch(/new Date|Date\.now|Intl\./);
    }
  });
});
