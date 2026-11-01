/** Clé d'agent opaque et optionnelle : `[redacted]` partout, révélée seulement par l'adaptateur. */
export const AGENT_CREDENTIAL_MAX_LENGTH = 0;

export class AgentCredential {
  private constructor() {}
  static is(_value: unknown): boolean {
    throw new Error("not implemented");
  }
}

export const agentCredential = (_secret: string): AgentCredential => {
  throw new Error("not implemented");
};
export const isAgentCredential = (_value: unknown): _value is AgentCredential => {
  throw new Error("not implemented");
};
export const revealAgentCredential = (_credential: AgentCredential): string => {
  throw new Error("not implemented");
};
