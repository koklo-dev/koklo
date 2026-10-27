import type { HealthOutput } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import type { AppConfig } from "../config.ts";
import { APP_CONFIG } from "../database/database.module.ts";
import { DATABASE_PROBE, type DatabaseProbe } from "./database-probe.ts";

/** Un healthcheck ne doit jamais rester pendu : au-delà, la base est considérée injoignable. */
export const PROBE_TIMEOUT_MS = 2_000;

async function withTimeout(work: Promise<void>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Sonde de base sans réponse après ${ms} ms`)), ms);
  });
  try {
    await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(DATABASE_PROBE) private readonly probe: DatabaseProbe,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Résout si la base répond ; rejette sinon (l'erreur est typée par l'intercepteur). */
  async check(): Promise<HealthOutput> {
    await withTimeout(this.probe.ping(), PROBE_TIMEOUT_MS);
    return { status: "ok", version: this.config.appVersion };
  }
}
