import type { PrismaClient } from "@koklo/db";
import type { AiProvider, GitProvider } from "@koklo/domain";
import type { CredentialCipher } from "@koklo/llm";
import type { Logger } from "@koklo/observability";
import type { PgBoss } from "pg-boss";
import type { AgentProposeSettings } from "../jobs/agent-propose.ts";
import { headDocSections } from "./doc-sections.ts";
import { createAiEngine } from "./engine.ts";
import { registerAgentPropose } from "./register.ts";
import { AgentProposeStore } from "./store.ts";

/** Options de la file `agent-propose` ; `ai` remplace le moteur (tests : faux `AiProvider`, jamais en production). */
export type AgentProposeOptions = Partial<AgentProposeSettings> & { ai?: AiProvider };

/**
 * Assemble le magasin et le moteur d'IA du worker (porte-clés de la configuration) et enregistre la file. `provider` lit les
 * sections du document de la tête (TK-114e) ; nul : aucune section lue.
 */
export async function wireAgentPropose(
  boss: PgBoss,
  logger: Logger,
  database: PrismaClient,
  keys: { cipher: CredentialCipher | null; provider: GitProvider | null },
  options: AgentProposeOptions = {},
): Promise<void> {
  const { ai, ...settings } = options;
  const { cipher, provider } = keys;
  const store = new AgentProposeStore(database, undefined, (head) =>
    headDocSections(provider, head, logger),
  );
  const engine = ai ?? createAiEngine({ client: store.client, cipher, logger });
  await registerAgentPropose(boss, logger, { store, ai: engine }, settings);
}
