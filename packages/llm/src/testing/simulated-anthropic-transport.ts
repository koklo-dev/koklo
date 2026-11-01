import type { FetchLike } from "../anthropic/fetch-like.ts";

const REDACTED = "[redacted]";
const CHARS_PER_TOKEN = 4;
const CHUNK_BYTES = 65_536;

/** Requête enregistrée : la clé est masquée ; la valeur brute n'est lisible que par `onRequest`. */
export interface RecordedRequest {
  readonly url: string;
  readonly method: string | undefined;
  readonly headers: Readonly<Record<string, string>>;
  readonly rawBody: string;
  readonly body: unknown;
  readonly redirect: "error" | "follow" | "manual" | undefined;
  readonly signal: AbortSignal | undefined;
}

/** Réponse `messages` : le texte est tronqué à `max_tokens` (stop_reason `max_tokens`) comme l'API. */
export interface MessageStep {
  readonly kind: "message";
  readonly text?: string;
  readonly content?: readonly unknown[];
  readonly model?: string;
  readonly stopReason?: string | null;
  readonly usage?: unknown;
  readonly padToBytes?: number;
}
export interface HttpStep {
  readonly kind: "http";
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly json?: unknown;
  readonly text?: string;
}
/** Corps sans fin (octets lus comptés par `pulledBytes`) : l'adaptateur doit s'arrêter seul. */
export interface EndlessStep {
  readonly kind: "endless";
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
}
export type SimulatedStep =
  | MessageStep
  | HttpStep
  | EndlessStep
  | { readonly kind: "network-error"; readonly detail?: string }
  | { readonly kind: "timeout" }
  | { readonly kind: "hang" };

export interface SimulatedTransportOptions {
  /** Reçoit les en-têtes bruts (clé comprise) : seul moyen de vérifier la clé envoyée. */
  readonly onRequest?: (headers: Readonly<Record<string, string>>) => void;
  /** Clés refusées : réponse 401 `authentication_error` avant toute étape. */
  readonly rejectedKeys?: readonly string[];
  /** Modèle servi des réponses `message` sans `model` explicite (défaut : modèle demandé). */
  readonly servedModel?: string;
}

export const anthropicErrorBody = (type: string, message: string): unknown => ({
  type: "error",
  error: { type, message },
});

/** Transport simulé de `POST /v1/messages` : jamais de réseau, un script d'étapes consommées une fois. */
export class SimulatedAnthropicTransport {
  readonly #options: SimulatedTransportOptions;
  readonly #steps: SimulatedStep[] = [];
  readonly #requests: RecordedRequest[] = [];
  #aborted = 0;
  #pulled = 0;

  constructor(options: SimulatedTransportOptions = {}) {
    this.#options = options;
  }

  enqueue(...steps: SimulatedStep[]): this {
    this.#steps.push(...steps);
    return this;
  }

  get requests(): readonly RecordedRequest[] {
    return [...this.#requests];
  }

  /** Appels qui ont atteint le transport. */
  calls(): number {
    return this.#requests.length;
  }

  /** Appels interrompus par leur signal pendant l'attente. */
  abortedCalls(): number {
    return this.#aborted;
  }

  /** Octets déjà lus dans les corps sans fin. */
  pulledBytes(): number {
    return this.#pulled;
  }

  readonly fetch: FetchLike = async (url, init) => {
    const headers = { ...(init.headers as Record<string, string>) };
    const rawBody = typeof init.body === "string" ? init.body : "";
    this.#options.onRequest?.(headers);
    const recorded: RecordedRequest = {
      url,
      method: init.method,
      headers: { ...headers, ...("x-api-key" in headers ? { "x-api-key": REDACTED } : {}) },
      rawBody,
      body: rawBody === "" ? undefined : JSON.parse(rawBody),
      redirect: init.redirect,
      signal: init.signal ?? undefined,
    };
    this.#requests.push(recorded);
    if (this.#options.rejectedKeys?.includes(headers["x-api-key"] ?? "")) {
      return json(401, anthropicErrorBody("authentication_error", "invalid x-api-key"));
    }
    const step = this.#steps.shift();
    if (step === undefined) {
      throw new Error("Le script du transport simulé est épuisé");
    }
    return this.#run(step, recorded);
  };

  async #run(step: SimulatedStep, request: RecordedRequest): Promise<Response> {
    switch (step.kind) {
      case "http":
        return http(step);
      case "message":
        return this.#message(step, request);
      case "endless":
        return this.#endless(step);
      case "network-error":
        throw new TypeError("fetch failed", { cause: new Error(step.detail ?? "ECONNRESET") });
      case "timeout":
        throw new DOMException("The operation timed out.", "TimeoutError");
      case "hang":
        return this.#hang(request.signal);
    }
  }

  #hang(signal: AbortSignal | undefined): Promise<Response> {
    return new Promise((_resolve, reject) => {
      const stop = (): void => {
        this.#aborted += 1;
        reject(signal?.reason ?? new DOMException("This operation was aborted", "AbortError"));
      };
      if (signal?.aborted) {
        stop();
      } else {
        signal?.addEventListener("abort", stop, { once: true });
      }
    });
  }

  #endless(step: EndlessStep): Response {
    const body = new ReadableStream<Uint8Array>({
      pull: (controller) => {
        this.#pulled += CHUNK_BYTES;
        controller.enqueue(new Uint8Array(CHUNK_BYTES).fill(0x61));
      },
    });
    return new Response(body, { status: step.status, headers: step.headers });
  }

  #message(step: MessageStep, request: RecordedRequest): Response {
    const {
      max_tokens: maxTokens,
      model,
      system,
      messages,
    } = request.body as {
      max_tokens: number;
      model: string;
      system: string;
      messages: { content: string }[];
    };
    const limit = maxTokens * CHARS_PER_TOKEN;
    const full = step.text ?? "";
    const cut = full.length > limit;
    const text = cut ? full.slice(0, limit) : full;
    const inputChars = system.length + (messages[0]?.content.length ?? 0);
    const body = JSON.stringify({
      id: "msg_simulated",
      type: "message",
      role: "assistant",
      model: step.model ?? this.#options.servedModel ?? model,
      content: step.content ?? [{ type: "text", text }],
      stop_reason:
        step.stopReason === undefined ? (cut ? "max_tokens" : "end_turn") : step.stopReason,
      stop_sequence: null,
      usage: step.usage ?? {
        input_tokens: Math.ceil(inputChars / CHARS_PER_TOKEN),
        output_tokens: Math.min(Math.ceil(text.length / CHARS_PER_TOKEN), maxTokens),
      },
    });
    const padded = step.padToBytes === undefined ? body : body.padEnd(step.padToBytes, " ");
    return new Response(padded, { status: 200, headers: { "content-type": "application/json" } });
  }
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const http = (step: HttpStep): Response =>
  new Response(step.json === undefined ? (step.text ?? "") : JSON.stringify(step.json), {
    status: step.status,
    headers: {
      ...(step.json === undefined ? {} : { "content-type": "application/json" }),
      ...step.headers,
    },
  });
