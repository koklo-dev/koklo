/** Lecture ligne à ligne du flux d'événements du CLI ; les lignes invalides sont ignorées. */
export interface ClaudeResult {
  readonly isError: boolean;
  readonly text: string;
  readonly costMicroUsd: number;
}

export interface StreamState {
  /** Textes `assistant` reçus (sortie partielle). */
  readonly assistantTexts: string[];
  result?: ClaudeResult;
}

export interface StreamReader {
  readonly state: StreamState;
  push(chunk: string): void;
  end(): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseLine = (line: string): Record<string, unknown> | undefined => {
  try {
    const value: unknown = JSON.parse(line);
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

const assistantTexts = (event: Record<string, unknown>): string[] => {
  const message = event.message;
  const content = isRecord(message) ? message.content : undefined;
  if (!Array.isArray(content)) {
    return [];
  }
  return content.flatMap((part: unknown) =>
    isRecord(part) && part.type === "text" && typeof part.text === "string" ? [part.text] : [],
  );
};

const toMicroUsd = (cost: unknown): number =>
  typeof cost === "number" && Number.isFinite(cost) && cost >= 0 ? Math.round(cost * 1e6) : 0;

const toResult = (event: Record<string, unknown>): ClaudeResult => ({
  isError: event.is_error === true,
  text: typeof event.result === "string" ? event.result : "",
  costMicroUsd: toMicroUsd(event.total_cost_usd),
});

const apply = (state: StreamState, line: string): void => {
  const event = parseLine(line);
  if (event === undefined) {
    return;
  }
  if (event.type === "assistant") {
    state.assistantTexts.push(...assistantTexts(event));
  } else if (event.type === "result") {
    state.result = toResult(event);
  }
};

export const createStreamReader = (): StreamReader => {
  const state: StreamState = { assistantTexts: [] };
  let pending = "";
  return {
    state,
    push(chunk) {
      const lines = (pending + chunk).split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        apply(state, line);
      }
    },
    end() {
      apply(state, pending);
      pending = "";
    },
  };
};
