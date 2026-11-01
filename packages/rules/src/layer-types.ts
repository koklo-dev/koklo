import type { AgentRole, Enforcement, Rule, Severity } from "./catalog-types.ts";

/** Niveaux par précédence croissante : le catalogue d'abord, le projet en dernier. */
export const LEVELS = ["catalog", "organization", "group", "project"] as const;
export type Level = (typeof LEVELS)[number];
/** Niveaux qui peuvent fournir une couche (le catalogue n'est jamais une couche), du plus faible au plus fort. */
export const LAYER_LEVELS = ["organization", "group", "project"] as const;
export type LayerLevel = (typeof LAYER_LEVELS)[number];

/** Règle ajoutée par une couche : `paths` = portée (vide = partout), `replaces` = id supplanté. */
export interface LayerRule extends Rule {
  readonly paths?: readonly string[];
  readonly excludePaths?: readonly string[];
  readonly replaces?: string;
}

/** Surcharge tracée d'une règle existante ; au moins un effet (champ autre que ruleId/auteur/justification). */
export interface Override {
  readonly ruleId: string;
  readonly author: string;
  readonly justification: string;
  /** Date ISO `YYYY-MM-DD` ; passée (< now) = surcharge ignorée + conflit `expired`. */
  readonly expires?: string;
  readonly severity?: Severity;
  readonly enforcement?: Enforcement;
  readonly disabled?: boolean;
  /** Nouvelle liste d'agents concernés (en retirer un = assouplir). */
  readonly agents?: readonly AgentRole[];
  /** Chemins exclus de la règle (élargir = assouplir). */
  readonly excludePaths?: readonly string[];
  /** `false` = tentative de déverrouiller. */
  readonly protected?: boolean;
}

/** Dérogation §17.2 pour un fichier ; `expires` obligatoire. */
export interface Waiver {
  readonly ruleId: string;
  readonly file: string;
  readonly author: string;
  readonly justification: string;
  readonly expires: string;
}

export interface RuleLayer {
  readonly level: LayerLevel;
  readonly author?: string;
  /** Profils déclarés (métier / koklo-strict) : jamais déduits. */
  readonly profiles?: readonly string[];
  readonly add?: readonly LayerRule[];
  readonly override?: readonly Override[];
  readonly waivers?: readonly Waiver[];
  /** Ids verrouillés pour les niveaux inférieurs (verrou monotone). */
  readonly lock?: readonly string[];
}

export type TraceKind = "catalog" | "added" | "hardened" | "overridden" | "locked";
export interface Trace {
  readonly kind: TraceKind;
  readonly level: Level;
  readonly author?: string;
  readonly justification?: string;
  readonly expires?: string;
}

export interface EffectiveRule extends Rule {
  readonly origin: Level;
  readonly locked: boolean;
  readonly paths: readonly string[];
  readonly excludePaths: readonly string[];
  readonly trace: readonly Trace[];
}

export const CONFLICT_REASONS = ["locked", "unknown-rule", "unknown-profile", "expired"] as const;
export type ConflictReason = (typeof CONFLICT_REASONS)[number];
export type Attempt =
  | "disable"
  | "severity"
  | "enforcement"
  | "agents"
  | "exclude-paths"
  | "unlock"
  | "waiver"
  | "re-add"
  | "replace"
  | "override"
  | "lock"
  | "profile";

export interface Conflict {
  readonly ruleId: string;
  readonly level: LayerLevel;
  readonly attempted: Attempt;
  readonly reason: ConflictReason;
}

export interface DisabledRule {
  readonly ruleId: string;
  readonly level: LayerLevel;
  readonly author: string;
  readonly justification: string;
  readonly expires?: string;
}

export interface AppliedWaiver extends Waiver {
  readonly level: LayerLevel;
}

export interface PackageProfiles {
  readonly path: string;
  readonly profiles: readonly string[];
}
