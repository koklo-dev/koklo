import type { AiErrorView } from "./ai-errors.ts";
import type { AlertView, Failure } from "./ai-settings-outcomes.ts";

/**
 * État de session de la carte (S-ai-settings §3, §4) : ce que l'écran sait d'une tentative en cours ou récente.
 * Jamais la clé ni la saisie : ni valeur, ni longueur, ni fragment.
 */
export type Phase = "idle" | "saving" | "verifying" | "removing";

export type Notice = { kind: "status"; text: string } | { kind: "alert"; alert: AlertView };

export interface SessionState {
  phase: Phase;
  /** Parcours en cours : « Enregistrer et vérifier » ou « Vérifier à nouveau ». */
  flow: "save" | "verify" | null;
  notice: Notice | null;
  /** Limite de vérifications atteinte : source du compte à rebours. */
  rate: AiErrorView | null;
  /** Formulaire de remplacement ouvert sur une clé existante. */
  replacing: boolean;
  /** 409 `invalidated` / `undecryptable` : états de session, `list` ne les fournit pas. */
  invalidated: boolean;
  unreadable: boolean;
  forbidden: boolean;
  redirect: boolean;
  /** Modèle de la dernière vérification réussie (« Vérifiée à l'instant »). */
  verifiedModel: string | null;
  /** Incrémenté pour demander le focus dans le champ de la clé (ouverture, retrait confirmé). */
  focusSignal: number;
}

export const INITIAL_SESSION: SessionState = {
  phase: "idle",
  flow: null,
  notice: null,
  rate: null,
  replacing: false,
  invalidated: false,
  unreadable: false,
  forbidden: false,
  redirect: false,
  verifiedModel: null,
  focusSignal: 0,
};

/** Début d'une tentative : l'issue précédente (message, compte à rebours, vérification affirmée) tombe. */
export const startingPatch = (phase: Phase, flow: SessionState["flow"]): Partial<SessionState> => ({
  phase,
  flow,
  notice: null,
  rate: null,
  verifiedModel: null,
});

/** Un échec devient un retour au repos, avec son message éventuel. `closeForm` : le formulaire se referme. */
export function failurePatch(failure: Failure, closeForm: boolean): Partial<SessionState> {
  return {
    phase: "idle",
    flow: null,
    notice: failure.alert ? { kind: "alert", alert: failure.alert } : null,
    rate: failure.rate ?? null,
    redirect: failure.redirect === true,
    forbidden: failure.forbidden === true,
    ...(failure.unreadable ? { unreadable: true } : {}),
    ...(failure.invalidated ? { invalidated: true } : {}),
    ...(closeForm ? { replacing: failure.reopen === true } : {}),
  };
}
