/** Contrat des types du catalogue (TK-71 lot A). Les schémas zod les produisent au Green. */
export const AGENT_ROLES = [
  "product-owner",
  "analyst",
  "designer",
  "developer",
  "test-writer",
  "qa-reviewer",
  "tech-lead",
  "doc-writer",
] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export const PROFILE_KINDS = [
  "global",
  "language",
  "domain",
  "infrastructure",
  "business",
  "standard",
] as const;
export type ProfileKind = (typeof PROFILE_KINDS)[number];

export type Severity = "blocking" | "advisory";

export type Enforcement =
  | { readonly kind: "gate"; readonly adapter: string; readonly command?: string }
  | { readonly kind: "evidence"; readonly evidence: string }
  | { readonly kind: "instruction" };

export interface Profile {
  readonly kind: ProfileKind;
  readonly description: string;
}

export interface Rule {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly profiles: readonly string[];
  readonly agents: readonly AgentRole[];
  readonly severity: Severity;
  readonly protected: boolean;
  readonly enforcement: Enforcement;
}

export interface Catalog {
  readonly schemaVersion: 1;
  readonly catalogVersion: string;
  readonly protectedRuleIds: readonly string[];
  readonly profiles: Readonly<Record<string, Profile>>;
  readonly rules: readonly Rule[];
}
