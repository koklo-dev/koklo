import { INSTALLATION_WEBHOOK_ACTIONS } from "@koklo/domain";
import { isRecord } from "../job-support.ts";
import type { InstallationJob, PushJob } from "./types.ts";

const text = (source: Record<string, unknown>, key: string): string | undefined => {
  const value = Object.hasOwn(source, key) ? source[key] : undefined;
  return typeof value === "string" && value !== "" ? value : undefined;
};

function pushOf(body: Record<string, unknown>): PushJob | undefined {
  const installationId = text(body, "installationId");
  const repositoryId = text(body, "repositoryId");
  const ref = text(body, "ref");
  const after = text(body, "after");
  const deleted = Object.hasOwn(body, "deleted") ? body.deleted : undefined;
  if (
    installationId === undefined ||
    repositoryId === undefined ||
    ref === undefined ||
    after === undefined ||
    typeof deleted !== "boolean"
  ) {
    return undefined;
  }
  return { kind: "push", installationId, repositoryId, ref, after, deleted };
}

function installationOf(body: Record<string, unknown>): InstallationJob | undefined {
  const installationId = text(body, "installationId");
  const action = text(body, "action");
  if (
    installationId === undefined ||
    action === undefined ||
    !(INSTALLATION_WEBHOOK_ACTIONS as readonly string[]).includes(action)
  ) {
    return undefined;
  }
  return { kind: "installation", action, installationId };
}

/**
 * Relit la charge stockée d'une livraison `push` ou `installation`. Elle a été normalisée à
 * l'ingestion, mais la base reste une entrée non fiable : toute forme inattendue rend `undefined`
 * (livraison `failed` / `invalid_payload`), jamais une exception.
 */
export function parseDeliveryPayload(
  event: string,
  payload: unknown,
): PushJob | InstallationJob | undefined {
  if (!isRecord(payload) || text(payload, "event") !== event) return undefined;
  if (event === "push") return pushOf(payload);
  return event === "installation" ? installationOf(payload) : undefined;
}
