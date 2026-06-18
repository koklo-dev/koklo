/**
 * Typed Tauri invoke client for the Koklo desktop IPC contract (US-014).
 *
 * The client is a thin, fully-typed dispatcher over the contract defined in
 * `contract.ts` — it carries **no business logic** (clean-architecture §1):
 *   - request/response procedures → Tauri `invoke(command, input)`
 *   - the transcript subscription → Tauri `listen(event)` with per-session filtering
 *
 * Both transport functions are injectable, so tests mock the Tauri APIs without a
 * running Tauri runtime; production defaults to `@tauri-apps/api`.
 */
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  contract,
  type KokloContract,
  type ProcedureDef,
  type SubscriptionDef,
  type TranscriptLineDto,
} from "./contract.js";

export type { UnlistenFn };

/**
 * Minimal shape of Tauri `invoke` the client depends on. Non-generic by design —
 * call-site typing comes from the `KokloClient` mapped surface, not the transport.
 */
export type InvokeFn = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

/** Minimal shape of Tauri `listen` the client depends on. */
export type ListenFn = (
  event: string,
  handler: (event: { payload: unknown }) => void,
) => Promise<UnlistenFn>;

export interface KokloClientOptions {
  /** Override the invoke transport (tests inject a mock). */
  invokeFn?: InvokeFn;
  /** Override the listen transport (tests inject a mock). */
  listenFn?: ListenFn;
}

// --- typed client surface, derived from the contract -----------------------

type ProcedureFn<T> =
  T extends ProcedureDef<infer I, infer O>
    ? [I] extends [void]
      ? () => Promise<O>
      : (input: I) => Promise<O>
    : never;

type SubscriptionFn<T> =
  T extends SubscriptionDef<infer I, infer E>
    ? (input: I, handler: (event: E) => void) => Promise<UnlistenFn>
    : never;

type NamespaceClient<NS> = {
  [K in keyof NS]: NS[K] extends ProcedureDef<unknown, unknown>
    ? ProcedureFn<NS[K]>
    : NS[K] extends SubscriptionDef<unknown, unknown>
      ? SubscriptionFn<NS[K]>
      : never;
};

/** The fully-typed client: `client.sessions.list()`, `client.transcript.since({…})`, etc. */
export type KokloClient = {
  [NS in keyof KokloContract]: NamespaceClient<KokloContract[NS]>;
};

// --- implementation --------------------------------------------------------

function isSubscription(
  def: { command: string } | { event: string },
): def is { event: string } {
  return "event" in def;
}

/**
 * Build a typed client from the contract registry. Adding a procedure to the
 * contract is the only change needed — the client picks it up here.
 */
export function createKokloClient(options: KokloClientOptions = {}): KokloClient {
  const invokeFn: InvokeFn = options.invokeFn ?? (tauriInvoke as InvokeFn);
  const listenFn: ListenFn = options.listenFn ?? (tauriListen as unknown as ListenFn);

  const client: Record<string, Record<string, unknown>> = {};

  for (const [namespace, methods] of Object.entries(contract)) {
    const nsClient: Record<string, unknown> = {};
    for (const [method, def] of Object.entries(methods)) {
      if (isSubscription(def)) {
        nsClient[method] = subscribeTranscript(listenFn, def.event);
      } else {
        const { command } = def;
        nsClient[method] = (input?: Record<string, unknown>) =>
          invokeFn(command, input);
      }
    }
    client[namespace] = nsClient;
  }

  return client as unknown as KokloClient;
}

/**
 * Transcript event subscription layer. Registers one Tauri event listener and
 * delivers only the lines belonging to the requested session, in arrival order.
 * Returns the Tauri `UnlistenFn` so callers can tear the listener down.
 *
 * Session filtering is dispatch logic, not business logic: the backend may
 * fan a single event channel out to many open sessions.
 */
function subscribeTranscript(listenFn: ListenFn, event: string) {
  return (
    input: { sessionId: string },
    handler: (line: TranscriptLineDto) => void,
  ): Promise<UnlistenFn> =>
    listenFn(event, ({ payload }) => {
      const line = payload as TranscriptLineDto;
      if (line.sessionId === input.sessionId) {
        handler(line);
      }
    });
}
