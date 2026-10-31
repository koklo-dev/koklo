import { httpStatusOf, oauthErrorCodeOf } from "@koklo/domain";
import { requestLogger } from "../request-logger.ts";

/** Étapes du callback, énumération fermée : la seule indication de lieu que le journal contient. */
export const CALLBACK_STEPS = [
  "request",
  "consume_state",
  "manager_check",
  "target",
  "exchange_code",
  "list_installations",
  "owner_role",
  "link",
  "audit",
] as const;
export type CallbackStep = (typeof CALLBACK_STEPS)[number];

/** Échec survenu à une étape connue ; la cause n'est jamais journalisée, seulement diagnostiquée. */
export class CallbackStepError extends Error {
  readonly step: CallbackStep;
  readonly source: unknown;
  constructor(step: CallbackStep, source: unknown) {
    super(`installation callback: échec à l'étape ${step}`);
    this.name = "CallbackStepError";
    this.step = step;
    this.source = source;
  }
}

/** Exécute `run` ; tout échec est rattaché à son étape. */
export async function atStep<T>(step: CallbackStep, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw new CallbackStepError(step, error);
  }
}

const propertyOf = (error: unknown, key: string): unknown =>
  typeof error === "object" && error !== null ? (error as Record<string, unknown>)[key] : undefined;

/**
 * Journalise l'échec : étape, nom de classe, statut HTTP et code OAuth public (liste blanche), et
 * RIEN d'autre. Ni message (il peut citer un code, un état ou un jeton), ni corps, ni cause, ni URL.
 */
export function logCallbackFailure(step: CallbackStep, error: unknown): void {
  const source = error instanceof CallbackStepError ? error.source : error;
  const status = httpStatusOf(propertyOf(source, "status"));
  const oauthError = oauthErrorCodeOf(propertyOf(source, "oauthError"));
  requestLogger().warn(
    {
      step: error instanceof CallbackStepError ? error.step : step,
      errorName: source instanceof Error ? source.name : "erreur",
      ...(status === undefined ? {} : { status }),
      ...(oauthError === undefined ? {} : { oauthError }),
    },
    "installation callback failed",
  );
}
