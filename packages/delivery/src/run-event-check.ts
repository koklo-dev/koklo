import { type BlockInfo, createBlock } from "./block-cause.ts";
import { InvalidRunEventError } from "./errors.ts";
import { isOneOf } from "./one-of.ts";
import { RUN_EVENT_TYPES, type RunEvent } from "./run-event.ts";

/** Événement bien formé (type connu) ; sinon `InvalidRunEventError`, sans écho du contenu. */
export const checkEvent = (event: unknown): RunEvent => {
  const type = (event as { type?: unknown } | null | undefined)?.type;
  if (!isOneOf(RUN_EVENT_TYPES, type)) throw new InvalidRunEventError("type d'événement inconnu");
  return event as RunEvent;
};

/** Blocage porté par l'événement : `block`, ou `dev_done` à diff vide (no_output) ; sinon `null`. */
export const blockOf = (event: RunEvent): BlockInfo | null => {
  if (event.type === "block") {
    return createBlock(event.cause, event.output, { remoteBranchExists: event.remoteBranchExists });
  }
  if (event.type === "dev_done" && event.diffEmpty === true) {
    return createBlock("no_output", event.output, { remoteBranchExists: event.remoteBranchExists });
  }
  return null;
};
