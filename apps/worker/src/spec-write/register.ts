import type { GitProvider } from "@koklo/domain";
import { createOctokitGitProvider } from "@koklo/github";
import type { Logger } from "@koklo/observability";
import type { PgBoss } from "pg-boss";
import type { WorkerConfig } from "../config.ts";
import {
  createSpecWriteHandler,
  SPEC_WRITE_DEFAULTS,
  SPEC_WRITE_QUEUE,
  type SpecWriteSettings,
} from "../jobs/spec-write.ts";
import { instrumentJob } from "../observability.ts";
import type { SpecWriteStore } from "./store.ts";

/** Latence de prise d'un lot : `submit` l'attend de façon synchrone. */
const POLLING_INTERVAL_SECONDS = 0.5;
/** Un lot dure une lecture de la spec et un commit ; au-delà, pg-boss considère le job perdu. */
const EXPIRE_IN_SECONDS = 300;

/** Fournisseur injecté (tests) ou adaptateur GitHub de l'App configurée ; `null` sans l'un ni l'autre. */
export function providerOf(config: WorkerConfig, injected?: GitProvider): GitProvider | null {
  if (injected) return injected;
  const app = config.githubApp;
  return app ? createOctokitGitProvider({ ...app, now: () => new Date() }) : null;
}

/**
 * File `spec-write` en `key_strict_fifo` (ordre par clé `repoId:branche`, jamais deux lots
 * simultanés sur une branche), créée puis réglée par le worker ; plusieurs consommateurs locaux
 * pour que des branches différentes avancent ensemble.
 */
export async function registerSpecWrite(
  boss: PgBoss,
  logger: Logger,
  deps: { store: SpecWriteStore; provider: GitProvider | null },
  overrides: Partial<SpecWriteSettings> = {},
): Promise<void> {
  const settings = { ...SPEC_WRITE_DEFAULTS, ...overrides };
  const options = {
    retryLimit: settings.retryLimit,
    retryDelay: settings.retryDelaySeconds,
    retryBackoff: true,
    expireInSeconds: EXPIRE_IN_SECONDS,
  };
  await boss.createQueue(SPEC_WRITE_QUEUE, { ...options, policy: "key_strict_fifo" });
  // `createQueue` ne réécrit pas une file existante ; la politique, elle, ne change jamais.
  await boss.updateQueue(SPEC_WRITE_QUEUE, options);
  const handler = createSpecWriteHandler({ ...deps, logger, retryLimit: settings.retryLimit });
  await boss.work(
    SPEC_WRITE_QUEUE,
    { localConcurrency: settings.concurrency, pollingIntervalSeconds: POLLING_INTERVAL_SECONDS },
    instrumentJob(logger, SPEC_WRITE_QUEUE, handler),
  );
}
