import type { Profile, Rule } from "./catalog-types.ts";
import { frozenCopy } from "./freeze.ts";
import { STRICT_RULES } from "./koklo-strict-rules.ts";

export const KOKLO_STRICT_PROFILE_ID = "koklo-strict";

export interface KokloStrictProfile {
  readonly id: typeof KOKLO_STRICT_PROFILE_ID;
  /** Kind `standard` : activé explicitement par une couche, jamais déduit (D2). */
  readonly profile: Profile;
  /** Règles `strict.*` (vision §17.1 à 17.3), triées par id. */
  readonly rules: readonly Rule[];
  /** Ids verrouillés (D3), tous des règles du profil, triés. */
  readonly lockedRuleIds: readonly string[];
}

export const kokloStrictProfile: KokloStrictProfile = frozenCopy({
  id: KOKLO_STRICT_PROFILE_ID,
  profile: {
    kind: "standard",
    description:
      "Standard d'ingénierie koklo (vision §17.1 à 17.3) : limites chiffrées verrouillées, domaine pur, commits conventionnels.",
  },
  rules: STRICT_RULES,
  lockedRuleIds: STRICT_RULES.filter((rule) => rule.protected).map((rule) => rule.id),
});
