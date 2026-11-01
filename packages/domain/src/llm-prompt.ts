import type { Trusted } from "./trusted.ts";
import type { Untrusted } from "./untrusted.ts";

/** Politique fixe placée dans `system` (squelette Red). */
export const UNTRUSTED_DATA_POLICY = "";

/** Prompt cadré ; seul `framePrompt` en produit. */
export class FramedPrompt {
  declare private readonly brand: "framed-prompt";
  readonly system: string;
  readonly user: string;
  private constructor(system: string, user: string) {
    this.system = system;
    this.user = user;
  }
}

export interface FramePromptInput {
  readonly instructions: Trusted;
  readonly data: readonly Untrusted[];
  readonly nonce: string;
}

export const framePrompt = (_input: FramePromptInput): FramedPrompt => {
  throw new Error("non implémenté");
};
