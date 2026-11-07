import type { LlmProviderId } from "@koklo/domain";

/** Corps de réponse par format de fournisseur (sans réseau, sans donnée réelle). */
export type WireFormat = "anthropic" | "openai" | "google";

export const FORMAT_OF: Readonly<Record<LlmProviderId, WireFormat>> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  mistral: "openai",
  openrouter: "openai",
  openai_compatible: "openai",
};

/** Hôte attendu par fournisseur (sauf `openai_compatible`, fourni par l'appelant). */
export const HOST_OF: Readonly<Record<LlmProviderId, string>> = {
  anthropic: "api.anthropic.com",
  openai: "api.openai.com",
  google: "generativelanguage.googleapis.com",
  mistral: "api.mistral.ai",
  openrouter: "openrouter.ai",
  openai_compatible: "llm.exemple.test",
};

export const COMPAT_BASE_URL = "https://llm.exemple.test/v1";
export const SERVED = "modele-servi-1";

export interface Usage {
  readonly input: number;
  readonly output: number;
}
export const USAGE: Usage = { input: 3, output: 4 };

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

export const completeBody = (format: WireFormat, text: string): unknown => {
  if (format === "anthropic") {
    return {
      id: "m",
      type: "message",
      role: "assistant",
      model: SERVED,
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      usage: { input_tokens: USAGE.input, output_tokens: USAGE.output },
    };
  }
  if (format === "google") {
    return {
      candidates: [
        { content: { role: "model", parts: [{ text }] }, finishReason: "STOP", index: 0 },
      ],
      usageMetadata: {
        promptTokenCount: USAGE.input,
        candidatesTokenCount: USAGE.output,
        totalTokenCount: USAGE.input + USAGE.output,
      },
      modelVersion: SERVED,
    };
  }
  return {
    id: "c",
    object: "chat.completion",
    created: 1,
    model: SERVED,
    choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
    usage: {
      prompt_tokens: USAGE.input,
      completion_tokens: USAGE.output,
      total_tokens: USAGE.input + USAGE.output,
    },
  };
};

export const okResponse = (format: WireFormat, text: string): Response =>
  json(200, completeBody(format, text));

const sse = (events: readonly (readonly [string | undefined, unknown])[]): Response => {
  const body = events
    .map(
      ([name, data]) =>
        `${name ? `event: ${name}\n` : ""}data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`,
    )
    .join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
};

/** Flux de texte : deux morceaux puis la fin avec les jetons. */
export const streamResponse = (
  format: WireFormat,
  chunks: readonly [string, string],
  options: { readonly usageInFinishChunk?: boolean } = {},
): Response => {
  if (format === "anthropic") {
    return sse([
      [
        "message_start",
        {
          type: "message_start",
          message: {
            id: "m",
            type: "message",
            role: "assistant",
            model: SERVED,
            content: [],
            stop_reason: null,
            usage: { input_tokens: USAGE.input, output_tokens: 1 },
          },
        },
      ],
      [
        "content_block_start",
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      ],
      ...chunks.map(
        (text) =>
          [
            "content_block_delta",
            { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
          ] as const,
      ),
      ["content_block_stop", { type: "content_block_stop", index: 0 }],
      [
        "message_delta",
        {
          type: "message_delta",
          delta: { stop_reason: "end_turn", stop_sequence: null },
          usage: { output_tokens: USAGE.output },
        },
      ],
      ["message_stop", { type: "message_stop" }],
    ]);
  }
  if (format === "google") {
    return sse([
      ...chunks.map(
        (text) =>
          [
            undefined,
            {
              candidates: [{ content: { role: "model", parts: [{ text }] }, index: 0 }],
              modelVersion: SERVED,
            },
          ] as const,
      ),
      [
        undefined,
        {
          candidates: [
            { content: { role: "model", parts: [{ text: "" }] }, finishReason: "STOP", index: 0 },
          ],
          usageMetadata: {
            promptTokenCount: USAGE.input,
            candidatesTokenCount: USAGE.output,
            totalTokenCount: 7,
          },
          modelVersion: SERVED,
        },
      ],
    ]);
  }
  const chunk = (delta: unknown, finish: string | null) => ({
    id: "c",
    object: "chat.completion.chunk",
    created: 1,
    model: SERVED,
    choices: [{ index: 0, delta, finish_reason: finish }],
  });
  const usage = { prompt_tokens: USAGE.input, completion_tokens: USAGE.output, total_tokens: 7 };
  if (options.usageInFinishChunk) {
    // Mistral : l'usage accompagne le dernier morceau, il n'envoie pas de morceau sans choix.
    return sse([
      [undefined, chunk({ role: "assistant", content: chunks[0] }, null)],
      [undefined, chunk({ content: chunks[1] }, null)],
      [undefined, { ...chunk({}, "stop"), usage }],
      [undefined, "[DONE]"],
    ]);
  }
  return sse([
    [undefined, chunk({ role: "assistant", content: chunks[0] }, null)],
    [undefined, chunk({ content: chunks[1] }, null)],
    [undefined, chunk({}, "stop")],
    [
      undefined,
      {
        id: "c",
        object: "chat.completion.chunk",
        created: 1,
        model: SERVED,
        choices: [],
        usage: { prompt_tokens: USAGE.input, completion_tokens: USAGE.output, total_tokens: 7 },
      },
    ],
    [undefined, "[DONE]"],
  ]);
};

export const errorResponse = (status: number, message: string, headers = {}): Response =>
  json(status, { error: { type: "error", message, code: "x" } }, headers);

/** Corps sans fin (octets tirés comptés) : l'adaptateur doit s'arrêter seul. */
export const endlessResponse = (status: number, counter: { pulled: number }): Response =>
  new Response(
    new ReadableStream<Uint8Array>({
      pull: (controller) => {
        counter.pulled += 65_536;
        controller.enqueue(new Uint8Array(65_536).fill(0x61));
      },
    }),
    { status },
  );
