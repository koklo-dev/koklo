/** Sortie d'agent : toujours `Untrusted("model-output")`, jamais interprétée par le port. */
import { Untrusted } from "@koklo/domain";

export type AgentOutput = Untrusted;

export const agentOutput = (text: string): AgentOutput => new Untrusted("model-output", text);

export const isAgentOutput = (value: unknown): value is AgentOutput =>
  value instanceof Untrusted && value.origin === "model-output";
