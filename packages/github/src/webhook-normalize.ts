import {
  INSTALLATION_WEBHOOK_ACTIONS,
  type InstallationWebhook,
  type InstallationWebhookAction,
  type NormalizedWebhook,
  type OtherWebhook,
  type PushWebhook,
  WEBHOOK_EVENTS,
  type WebhookAccount,
  type WebhookEventName,
} from "@koklo/domain";

const EVENT_NAME_MAX = 64;
/** Longueur maximale de `ref` : elle entre dans la clé de file `push:<dépôt>:<ref>` du worker. */
const REF_MAX = 255;
const BRANCH_PREFIX = "refs/heads/";
const SHA_PATTERN = /^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/;

export type InvalidWebhookPayloadReason = "unsupported_event" | "malformed_payload";

/** Événement ignoré ou charge invalide ; le message ne reprend aucune valeur de la charge. */
export class InvalidWebhookPayloadError extends Error {
  readonly code = "invalid_payload" as const;
  readonly reason: InvalidWebhookPayloadReason;
  readonly event: string;

  constructor(reason: InvalidWebhookPayloadReason, event: string) {
    super(
      reason === "unsupported_event"
        ? "Unsupported webhook event"
        : "Malformed webhook payload for the declared event",
    );
    this.name = "InvalidWebhookPayloadError";
    this.reason = reason;
    this.event = event.slice(0, EVENT_NAME_MAX);
  }
}

type Rec = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Rec =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function field(source: Rec, key: string): unknown {
  return Object.hasOwn(source, key) ? source[key] : undefined;
}

function child(source: Rec, key: string): Rec | undefined {
  const value = field(source, key);
  return isRecord(value) ? value : undefined;
}

/** Entier sûr strictement positif rendu en chaîne, sinon `undefined`. */
function idOf(value: unknown): string | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? String(value)
    : undefined;
}

function boolOf(source: Rec, key: string): boolean | undefined {
  const value = field(source, key);
  return typeof value === "boolean" ? value : undefined;
}

/** Vrai si la chaîne est non vide et sans caractère de contrôle (dont NUL, refusé par jsonb). */
function isPrintable(value: unknown): value is string {
  if (typeof value !== "string" || value === "") return false;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

function shaOf(source: Rec, key: string): string | undefined {
  const value = field(source, key);
  return typeof value === "string" && SHA_PATTERN.test(value) ? value : undefined;
}

function normalizePush(deliveryId: string, body: Rec): PushWebhook | undefined {
  const ref = field(body, "ref");
  const before = shaOf(body, "before");
  const after = shaOf(body, "after");
  const created = boolOf(body, "created");
  const deleted = boolOf(body, "deleted");
  const forced = boolOf(body, "forced");
  const repositoryId = idOf(field(child(body, "repository") ?? {}, "id"));
  const installationId = idOf(field(child(body, "installation") ?? {}, "id"));
  if (
    !isPrintable(ref) ||
    ref.length > REF_MAX ||
    before === undefined ||
    after === undefined ||
    created === undefined ||
    deleted === undefined ||
    forced === undefined ||
    repositoryId === undefined ||
    installationId === undefined
  ) {
    return undefined;
  }
  return {
    event: "push",
    deliveryId,
    installationId,
    repositoryId,
    ref,
    branch: ref.startsWith(BRANCH_PREFIX) ? ref.slice(BRANCH_PREFIX.length) : null,
    before,
    after,
    created,
    deleted,
    forced,
  };
}

function normalizeAccount(account: Rec | undefined): WebhookAccount | undefined {
  if (account === undefined) return undefined;
  const externalId = idOf(field(account, "id"));
  const login = field(account, "login");
  const type = field(account, "type");
  const kind = type === "Organization" ? "organization" : type === "User" ? "user" : undefined;
  if (externalId === undefined || !isPrintable(login) || kind === undefined) {
    return undefined;
  }
  return { externalId, login, kind };
}

function normalizeInstallation(deliveryId: string, body: Rec): InstallationWebhook | undefined {
  const action = field(body, "action");
  const installation = child(body, "installation");
  if (
    typeof action !== "string" ||
    !(INSTALLATION_WEBHOOK_ACTIONS as readonly string[]).includes(action) ||
    installation === undefined
  ) {
    return undefined;
  }
  const installationId = idOf(field(installation, "id"));
  const account = normalizeAccount(child(installation, "account"));
  if (installationId === undefined || account === undefined) return undefined;
  return {
    event: "installation",
    deliveryId,
    action: action as InstallationWebhookAction,
    installationId,
    account,
  };
}

function normalizeOther(event: OtherWebhook["event"], deliveryId: string, body: Rec): OtherWebhook {
  const action = field(body, "action");
  return {
    event,
    deliveryId,
    action: typeof action === "string" ? action : null,
    installationId: idOf(field(child(body, "installation") ?? {}, "id")) ?? null,
    repositoryId: idOf(field(child(body, "repository") ?? {}, "id")) ?? null,
  };
}

/**
 * Réduit la charge d'un webhook GitHub aux champs du contrat (`NormalizedWebhook`), sans aucune
 * donnée personnelle. Lève `InvalidWebhookPayloadError` pour un événement non géré ou une forme
 * invalide. La charge reçue n'est jamais modifiée.
 */
export function normalizeWebhook(
  event: string,
  deliveryId: string,
  payload: unknown,
): NormalizedWebhook {
  if (!(WEBHOOK_EVENTS as readonly string[]).includes(event)) {
    throw new InvalidWebhookPayloadError("unsupported_event", event);
  }
  const name = event as WebhookEventName;
  const fail = (): never => {
    throw new InvalidWebhookPayloadError("malformed_payload", event);
  };
  if (deliveryId === "" || !isRecord(payload)) return fail();
  if (name === "push") return normalizePush(deliveryId, payload) ?? fail();
  if (name === "installation") return normalizeInstallation(deliveryId, payload) ?? fail();
  return normalizeOther(name, deliveryId, payload);
}
