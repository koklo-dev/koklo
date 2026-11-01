import {
  type AgentRole,
  type Catalog,
  type LayerLevel,
  type LayerRule,
  type Override,
  type Resolution,
  type ResolveInput,
  type RuleLayer,
  resolveEffectiveRules,
  type Waiver,
} from "../src/index.ts";

export const NOW = "2026-11-01";
export const FUTURE = "2027-03-01";
export const PAST = "2026-01-15";
export const AUTHOR = "jane.doe";
export const WHY = "Migration en cours, ticket TK-999";
export const SRC_FILE = "packages/api/src/a.ts";

/** Petit catalogue de composition : 1 protégée, 1 gate, 2 preuves, 3 instructions. */
export const smallCatalog = (): Catalog => ({
  schemaVersion: 1,
  catalogVersion: "2026.11.0",
  protectedRuleIds: ["global.secrets"],
  profiles: {
    core: { kind: "global", description: "Socle" },
    node: { kind: "language", description: "Node.js" },
    security: { kind: "domain", description: "Sécurité" },
    "privacy-rgpd": { kind: "business", description: "RGPD" },
  },
  rules: [
    mk("global.secrets", "core", ["developer", "qa-reviewer"], "blocking", true, {
      kind: "gate",
      adapter: "secret-scan",
    }),
    mk("global.scope", "core", ["developer"], "blocking", false, {
      kind: "evidence",
      evidence: "Liste des fichiers modifiés",
    }),
    mk("node.esm", "node", ["developer"], "advisory", false, { kind: "instruction" }),
    mk("node.tests", "node", ["developer", "qa-reviewer"], "blocking", false, {
      kind: "evidence",
      evidence: "Rapport de tests",
    }),
    mk("sec.review", "security", ["qa-reviewer"], "advisory", false, { kind: "instruction" }),
    mk("docs.only", "core", ["doc-writer"], "advisory", false, { kind: "instruction" }),
  ],
});

function mk(
  id: string,
  profile: string,
  agents: AgentRole[],
  severity: "blocking" | "advisory",
  isProtected: boolean,
  enforcement: LayerRule["enforcement"],
): LayerRule {
  return {
    id,
    title: `Titre ${id}`,
    description: `Description ${id}`,
    profiles: [profile],
    agents,
    severity,
    protected: isProtected,
    enforcement,
  };
}

export const newRule = (id: string, extra: Partial<LayerRule> = {}): LayerRule => ({
  ...mk(id, "core", ["developer", "qa-reviewer"], "blocking", false, { kind: "instruction" }),
  ...extra,
});

export const layer = (level: LayerLevel, extra: Partial<RuleLayer> = {}): RuleLayer => ({
  level,
  author: AUTHOR,
  ...extra,
});

export const override = (ruleId: string, extra: Partial<Override> = {}): Override => ({
  ruleId,
  author: AUTHOR,
  justification: WHY,
  ...extra,
});

export const waiver = (ruleId: string, extra: Partial<Waiver> = {}): Waiver => ({
  ruleId,
  file: SRC_FILE,
  author: AUTHOR,
  justification: WHY,
  expires: FUTURE,
  ...extra,
});

export const input = (extra: Partial<ResolveInput> = {}): ResolveInput => ({
  catalog: smallCatalog(),
  layers: [],
  role: "developer",
  path: SRC_FILE,
  now: NOW,
  profiles: ["node"],
  ...extra,
});

/** Résout et exige un succès. */
export const resolveOk = (extra: Partial<ResolveInput> = {}): Resolution => {
  const result = resolveEffectiveRules(input(extra));
  if (!result.ok) throw new Error(`résolution refusée : ${result.error.code}`);
  return result.value;
};

export const ruleIds = (r: Resolution): string[] => r.rules.map((rule) => rule.id);
export const ruleOf = (r: Resolution, id: string) => r.rules.find((rule) => rule.id === id);
