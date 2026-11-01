import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type AgentRole,
  type Catalog,
  parseCatalog,
  renderExplanation,
  resolveEffectiveRules,
} from "../src/index.ts";
import { layer, newRule, override, resolveOk } from "./compose-fixtures.ts";
import { readFixture } from "./helpers.ts";

const dir = resolve(import.meta.dirname, "fixtures/bash-explain");
const cases = JSON.parse(readFileSync(resolve(dir, "cases.json"), "utf8")) as {
  profiles: string[];
  packages: { path: string; profiles: string[] }[];
  cases: { role: AgentRole; path: string; expected: string }[];
};
const parsed = parseCatalog(readFixture("shipyard-catalog.json"));
const shipyard: Catalog = parsed.ok ? parsed.value : (undefined as never);

describe("équivalence avec engineering-rules.sh explain (sorties de référence figées)", () => {
  it("le catalogue de référence est valide", () => {
    expect(parsed.ok).toBe(true);
  });
  it.each(cases.cases)("rôle $role, chemin $path", ({ role, path, expected }) => {
    const r = resolveEffectiveRules({
      catalog: shipyard,
      layers: [],
      role,
      path,
      now: "2026-11-01",
      profiles: cases.profiles,
      packages: cases.packages,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const reference = readFileSync(resolve(dir, expected), "utf8");
    expect(renderExplanation(r.value)).toBe(reference.trimEnd());
    expect(r.value.conflicts).toEqual([]);
    const refIds = [...reference.matchAll(/^\[(?:BLOCKING|ADVISORY)\] (\S+) /gm)].map((m) => m[1]);
    expect(r.value.rules.map((x) => x.id)).toEqual(refIds);
  });
});

describe("renderExplanation", () => {
  const text = renderExplanation(resolveOk());
  it("en-tête Agent / Scope / Profiles puis une entrée par règle", () => {
    expect(
      text.startsWith("Agent: developer\nScope: packages/api/src/a.ts\nProfiles: core, node\n\n"),
    ).toBe(true);
    expect(text).toContain(
      "[BLOCKING] global.secrets — Titre global.secrets (framework)\n  Description global.secrets\n  enforcement: gate/secret-scan",
    );
    expect(text).toContain(
      "[ADVISORY] node.esm — Titre node.esm (framework)\n  Description node.esm\n  enforcement: instruction",
    );
    expect(text).toContain("enforcement: evidence\n");
    expect(text.endsWith("\n")).toBe(false);
  });
  it("la source d'une règle ajoutée est son niveau", () => {
    const r = resolveOk({ layers: [layer("group", { add: [newRule("x.added")] })] });
    expect(renderExplanation(r)).toContain("[BLOCKING] x.added — Titre x.added (group)");
  });
  it("les conflits sont listés après les règles", () => {
    const r = resolveOk({
      layers: [layer("project", { override: [override("global.secrets", { disabled: true })] })],
    });
    const out = renderExplanation(r);
    expect(out).toContain("\n\nConflicts:\n  project global.secrets: disable refused (locked)");
    expect(out.indexOf("Conflicts:")).toBeGreaterThan(out.indexOf("[BLOCKING] node.tests"));
  });
  it("sans conflit, pas de section Conflicts", () => {
    expect(text).not.toContain("Conflicts:");
  });
  it("est déterministe", () => {
    expect(renderExplanation(resolveOk())).toBe(text);
  });
});
