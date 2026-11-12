import { describe, expect, it } from "vitest";
import { PROPOSAL_SEGMENTS, proposalStatements } from "../src/seed-volume-proposals.ts";
import { SEED_VOLUMES, type VolumeProfile } from "../src/seed-volumes.ts";

/** TK-105 (B365) : les groupes de propositions couvrent exactement le volume déclaré de chaque profil. */
const TARGET = { organizationId: "o", projectId: "p" };
const profiles: VolumeProfile[] = ["large", "planche"];

describe("seed-volume-proposals", () => {
  it.each(profiles)("%s : les groupes totalisent le volume déclaré", (profile) => {
    const sum = PROPOSAL_SEGMENTS[profile].reduce((total, s) => total + s.count, 0);
    expect(sum).toBe(SEED_VOLUMES[profile].proposals);
  });

  it("planche : 248 fonctionnalités en 6 zones, 86 règles en 3 zones, 3 rôles, 18 parcours", () => {
    const of = (kind: string) => PROPOSAL_SEGMENTS.planche.filter((s) => s.kind === kind);
    expect(of("feature")).toHaveLength(6);
    expect(of("feature").reduce((n, s) => n + s.count, 0)).toBe(248);
    expect(of("rule").map((s) => s.ruleType)).toEqual(["contrainte", "calcul", "workflow"]);
    expect(of("rule").reduce((n, s) => n + s.count, 0)).toBe(86);
    expect(of("role").reduce((n, s) => n + s.count, 0)).toBe(3);
    expect(of("flow").reduce((n, s) => n + s.count, 0)).toBe(18);
  });

  it.each(profiles)("%s : un lancement et une insertion de propositions", (profile) => {
    const statements = proposalStatements(profile, TARGET);
    expect(statements).toHaveLength(2);
    expect(statements[1]?.sql).toContain("INSERT INTO agent_proposals");
  });
});
