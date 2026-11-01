import { type BlockInfo, createBlock } from "./block-cause.ts";
import { InvalidRunEventError } from "./errors.ts";
import { isOneOf } from "./one-of.ts";
import { RUN_EVENT_TYPES, type RunEvent } from "./run-event.ts";
import { isCount, isText } from "./value-check.ts";

const isFlag = (value: unknown): boolean => typeof value === "boolean";

const reject = (reason: string): never => {
  throw new InvalidRunEventError(reason);
};

/** Charge obligatoire de chaque événement porteur de données (le `block` est contrôlé par `createBlock`). */
const checkPayload = (event: Record<string, unknown>): void => {
  if (event.type === "worktree_ready" && !isText(event.branch)) reject("branche obligatoire");
  if (event.type === "pr_opened" && !isText(event.pullRequest)) reject("pull request obligatoire");
  if (event.type === "dev_done" && !(isFlag(event.diffEmpty) && isFlag(event.remoteBranchExists))) {
    reject("dev_done exige diffEmpty et remoteBranchExists booléens");
  }
};

/** Événement bien formé (type connu, charge utile valide) ; sinon `InvalidRunEventError`, sans écho. */
export const checkEvent = (event: unknown): RunEvent => {
  const record = (event ?? {}) as Record<string, unknown>;
  if (!isOneOf(RUN_EVENT_TYPES, record.type)) reject("type d'événement inconnu");
  if (record.expectedVersion !== undefined && !isCount(record.expectedVersion)) {
    reject("expectedVersion invalide");
  }
  checkPayload(record);
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
