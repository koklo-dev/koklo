/** Sortie d'agent : toujours `Untrusted("model-output")`, jamais interprétée par le port. */
import type { Untrusted } from "@koklo/domain";

export type AgentOutput = Untrusted;

export const agentOutput = (_text: string): AgentOutput => {
  throw new Error("not implemented");
};
export const isAgentOutput = (_value: unknown): _value is AgentOutput => {
  throw new Error("not implemented");
};
