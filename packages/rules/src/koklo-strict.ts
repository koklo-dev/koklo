import type { Profile, Rule } from "./catalog-types.ts";

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

/** SQUELETTE (TK-71 lot C, Red) : le Green remplit les règles et les verrous. */
export const kokloStrictProfile: KokloStrictProfile = {
  id: KOKLO_STRICT_PROFILE_ID,
  profile: { kind: "standard", description: "" },
  rules: [],
  lockedRuleIds: [],
};
