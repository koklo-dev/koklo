import type { PrismaClient } from "@koklo/db";
import type { AiProvider } from "@koklo/domain";
import type { CredentialCipher } from "@koklo/llm";
import type { Logger } from "@koklo/observability";
import type { PgBoss } from "pg-boss";
import type { AgentProposeSettings } from "../jobs/agent-propose.ts";
import { createAiEngine } from "./engine.ts";
import { registerAgentPropose } from "./register.ts";
import { AgentProposeStore } from "./store.ts";

/** Options de la file `agent-propose` ; `ai` remplace le moteur (tests : faux `AiProvider`, jamais en production). */
export type AgentProposeOptions = Partial<AgentProposeSettings> & { ai?: AiProvider };

/** Assemble le magasin et le moteur d'IA du worker (porte-clés de la configuration) et enregistre la file. */
export async function wireAgentPropose(
  boss: PgBoss,
  logger: Logger,
  database: PrismaClient,
  cipher: CredentialCipher | null,
  options: AgentProposeOptions = {},
): Promise<void> {
  const { ai, ...settings } = options;
  const store = new AgentProposeStore(database);
  const engine = ai ?? createAiEngine({ client: store.client, cipher, logger });
  await registerAgentPropose(boss, logger, { store, ai: engine }, settings);
}
