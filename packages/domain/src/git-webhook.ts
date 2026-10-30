import type { RepoRef } from "./git-repo.ts";

/** Événements auxquels le port s'abonne (vision §8.1). */
export const WEBHOOK_EVENTS = Object.freeze([
  "installation",
  "push",
  "pull_request",
  "pull_request_review",
  "check_suite",
  "check_run",
  "workflow_run",
  "deployment_status",
] as const);

export type WebhookEventName = (typeof WEBHOOK_EVENTS)[number];

export type WebhookSubscription = {
  readonly repo: RepoRef;
  readonly events: readonly WebhookEventName[];
};
