import type { ProjectScope } from "../tracker/scope.ts";

/**
 * Squelette TK-54b (étape RED) : les types d'entrée et de sortie viendront du contrat 0.9.0 au
 * Green. Flux visé (`02-decisions-54b.md` §4) : projet dans l'organisation -> clé
 * (`LlmCredentialResolver`) -> `framePrompt` (nonce neuf) -> quota et sémaphore -> audit AVANT
 * l'appel -> `provider.complete` -> `validateLlmOutput` + Zod strict -> `markUsed`.
 */
export class AiService {
  draftBrief(_scope: ProjectScope, _input: unknown): Promise<unknown> {
    return notImplemented();
  }

  proposeFeatures(_scope: ProjectScope, _input: unknown): Promise<unknown> {
    return notImplemented();
  }

  proposeCriteria(_scope: ProjectScope, _input: unknown): Promise<unknown> {
    return notImplemented();
  }

  verify(_scope: ProjectScope, _provider: string): Promise<unknown> {
    return notImplemented();
  }
}

function notImplemented(): never {
  throw new Error("TK-54b : AiService n'est pas implémenté");
}
