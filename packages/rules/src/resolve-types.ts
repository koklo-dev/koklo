import type { AgentRole, Catalog } from "./catalog-types.ts";
import type {
  AppliedWaiver,
  Conflict,
  DisabledRule,
  EffectiveRule,
  PackageProfiles,
  RuleLayer,
} from "./layer-types.ts";

export interface ResolveInput {
  readonly catalog: Catalog;
  /** Couches triées par force de niveau (org, groupe, projet) ; au plus une par niveau. */
  readonly layers: readonly RuleLayer[];
  readonly role: AgentRole;
  /** Chemin relatif à la racine ; `.` = racine. Rejeté : `..`, absolu, `\`, octet nul. */
  readonly path: string;
  /** Date ISO `YYYY-MM-DD` (ou date-heure ISO) injectée : aucune horloge dans le paquet. */
  readonly now: string;
  /** Profils sélectionnés à la racine (hors `core`, toujours présent). */
  readonly profiles?: readonly string[];
  /** Profils par paquet ; le plus long préfixe de `path` remplace la sélection racine. */
  readonly packages?: readonly PackageProfiles[];
}

export interface Resolution {
  readonly catalogVersion: string;
  readonly role: AgentRole;
  /** Chemin normalisé. */
  readonly path: string;
  /** Profils effectifs, uniques, triés. */
  readonly profiles: readonly string[];
  /** Règles effectives triées par id. */
  readonly rules: readonly EffectiveRule[];
  /** Triés par niveau (org, groupe, projet), puis ruleId, puis attempted. */
  readonly conflicts: readonly Conflict[];
  /** Règles désactivées par surcharge tracée (non verrouillées), triées par ruleId. */
  readonly disabled: readonly DisabledRule[];
  /** Dérogations valides qui visent `path`, triées par ruleId. */
  readonly waivers: readonly AppliedWaiver[];
}
