"use client";

import type { IdeaMessage, IdeaPageSummary } from "@koklo/contract";
import type { AgentGap } from "@koklo/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { type AiErrorView, describeAiError } from "./ai-errors.ts";
import { AGENT_ACTIONS, type AgentAction, type AgentMode } from "./idea-agent-labels.ts";
import { orpc } from "./orpc.ts";

export interface ThreadMessage {
  id: string;
  author: "agent" | "human";
  name: string;
  text: string;
}

const toThread = (message: IdeaMessage): ThreadMessage => ({
  id: message.id,
  author: message.author ? "human" : "agent",
  name: message.author
    ? `${message.author.name} · ${message.author.isClient ? "client" : "équipe"}`
    : "Agent",
  text: message.text,
});

const byDate = (a: IdeaMessage, b: IdeaMessage) => a.createdAt.localeCompare(b.createdAt);

interface Options {
  projectId: string;
  pages: IdeaPageSummary[];
  current: IdeaPageSummary | undefined;
  enabled: boolean;
}

interface SendInput {
  text: string;
  action?: AgentAction;
  selection?: string;
}

const isAbort = (error: unknown): boolean =>
  typeof error === "object" && error !== null && Reflect.get(error, "name") === "AbortError";

/** Fil de l'agent : messages enregistrés, anciens à la demande, message en cours de flux. */
function useThread(projectId: string, enabled: boolean) {
  const query = useQuery({
    ...orpc.idea.message.list.queryOptions({ input: { projectId } }),
    enabled,
  });
  const [older, setOlder] = useState<{ items: IdeaMessage[]; cursor: string | null } | null>(null);
  const cursor = older ? older.cursor : (query.data?.nextCursor ?? null);
  const loadOlder = useCallback(async () => {
    if (!cursor) return;
    const page = await orpc.idea.message.list.call({ projectId, cursor });
    setOlder((previous) => ({
      items: [...(previous?.items ?? []), ...page.items],
      cursor: page.nextCursor,
    }));
  }, [cursor, projectId]);
  const stored = useMemo(
    () => [...(older?.items ?? []), ...(query.data?.items ?? [])].sort(byDate).map(toThread),
    [older, query.data],
  );
  return { stored, olderAvailable: cursor !== null, loadOlder, refetch: query.refetch };
}

/** Manques détectés, calculés à la demande (un appel du modèle au plus toutes les 30 s par projet). */
function useGaps(projectId: string, pages: IdeaPageSummary[]) {
  const [gaps, setGaps] = useState<AgentGap[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AiErrorView | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await orpc.ai.ideaGaps.call({ projectId });
      setGaps(
        result.items.map((item, index) => {
          const page = pages.find((p) => p.id === item.pageId);
          return {
            id: `${index}-${item.pageId ?? item.suggestedPageTitle ?? ""}`,
            ...(page ? { file: page.slug } : {}),
            text: item.text,
            kind: item.pageId ? ("page" as const) : ("new-page" as const),
          };
        }),
      );
    } catch (cause) {
      setError(describeAiError(cause));
    } finally {
      setLoading(false);
    }
  }, [projectId, pages]);
  return { gaps, loading, error, load };
}

/** Relit le fil, la liste et la page ouverte : les propositions d'un échange y arrivent. */
function useRefresh(
  projectId: string,
  current: IdeaPageSummary | undefined,
  refetchThread: () => unknown,
) {
  const client = useQueryClient();
  return useCallback(async () => {
    const keys = [
      orpc.idea.list.queryOptions({ input: { projectId } }).queryKey,
      ...(current
        ? [orpc.idea.get.queryOptions({ input: { projectId, pageId: current.id } }).queryKey]
        : []),
    ];
    await Promise.all([
      refetchThread(),
      ...keys.map((queryKey) => client.invalidateQueries({ queryKey })),
    ]);
  }, [client, current, projectId, refetchThread]);
}

interface ChatOptions {
  projectId: string;
  current: IdeaPageSummary | undefined;
  mode: AgentMode;
  refresh: () => Promise<void>;
  /** La saisie à remettre dans le champ quand l'envoi échoue. */
  onFailed: (text: string) => void;
}

/** Lit le flux d'un échange (`for await`) et rend le texte accumulé ; l'annulation vient du signal. */
async function readStream(
  call: Promise<AsyncIterable<{ type: string; text?: string }>>,
  onText: (text: string) => void,
): Promise<string> {
  let text = "";
  for await (const event of await call) {
    if (event.type !== "text") continue;
    text += event.text ?? "";
    onText(text);
  }
  return text;
}

/** Envoi d'un message à l'agent : un seul à la fois, flux, « Arrêter », erreur lisible, saisie rendue. */
function useChat({ projectId, current, mode, refresh, onFailed }: ChatOptions) {
  const [streamText, setStreamText] = useState<string | null>(null);
  const [pendingHuman, setPendingHuman] = useState<ThreadMessage | null>(null);
  const [error, setError] = useState<AiErrorView | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const send = useCallback(
    async (input: SendInput) => {
      if (busy.current || input.text.trim() === "") return;
      busy.current = true;
      const abort = new AbortController();
      controller.current = abort;
      setError(null);
      setPendingHuman({ id: "pending", author: "human", name: "Vous", text: input.text });
      setStreamText("");
      try {
        const body = { projectId, ...(current ? { pageId: current.id } : {}), mode, ...input };
        const text = await readStream(
          orpc.ai.ideaChat.call(body, { signal: abort.signal }),
          setStreamText,
        );
        setAnnouncement(`Réponse de l'agent : ${text}`);
      } catch (cause) {
        if (!isAbort(cause) && !abort.signal.aborted) {
          setError(describeAiError(cause));
          onFailed(input.text);
        }
      } finally {
        await refresh().catch(() => undefined);
        setStreamText(null);
        setPendingHuman(null);
        controller.current = null;
        busy.current = false;
      }
    },
    [current, mode, onFailed, projectId, refresh],
  );
  return {
    send,
    stop: () => controller.current?.abort(),
    streamText,
    pendingHuman,
    error,
    dismissError: () => setError(null),
    announcement,
  };
}

/** Pendant la relecture qui suit un échange, le fil enregistré contient déjà l'échange : pas de doublon. */
function useMergedThread(
  stored: ThreadMessage[],
  pendingHuman: ThreadMessage | null,
  streamText: string | null,
) {
  const lastStored = stored.slice(-2);
  const humanStored = lastStored.some((m) => m.author === "human" && m.text === pendingHuman?.text);
  const agentStored = !!streamText && lastStored.at(-1)?.text === streamText;
  const messages = useMemo(
    () => [...stored, ...(pendingHuman && !humanStored ? [pendingHuman] : [])],
    [stored, pendingHuman, humanStored],
  );
  return { messages, agentStored };
}

/**
 * Agent de l'espace Idée côté écran : état du fournisseur, fil, envoi en flux, annulation, manques.
 * L'agent n'écrit jamais une page : ses propositions arrivent par `idea.get` / `idea.list` et attendent une décision.
 */
export function useIdeaAgent({ projectId, pages, current, enabled }: Options) {
  const status = useQuery({
    ...orpc.idea.agent.status.queryOptions({ input: { projectId } }),
    enabled,
  });
  const configured = status.data?.configured === true;
  const thread = useThread(projectId, enabled && configured);
  const gaps = useGaps(projectId, pages);
  const [mode, setMode] = useState<AgentMode>("interview");
  const [draft, setDraft] = useState("");
  const refresh = useRefresh(projectId, current, thread.refetch);
  const restore = useCallback((text: string) => setDraft((old) => (old === "" ? text : old)), []);
  const chat = useChat({ projectId, current, mode, refresh, onFailed: restore });
  const { send, streamText, pendingHuman } = chat;

  const sendDraft = useCallback(() => {
    const text = draft;
    setDraft("");
    void send({ text });
  }, [draft, send]);
  const act = useCallback(
    (action: AgentAction, selection: string) => {
      const message = AGENT_ACTIONS.find((item) => item.action === action)?.message ?? "";
      void send({ text: message, action, selection: selection.slice(0, 4000) });
    },
    [send],
  );
  const { messages, agentStored } = useMergedThread(thread.stored, pendingHuman, streamText);

  return {
    status: status.data ?? null,
    statusFailed: status.isError,
    mode,
    setMode,
    draft,
    setDraft,
    messages,
    streamText,
    streaming: streamText !== null && !agentStored,
    error: chat.error,
    dismissError: chat.dismissError,
    send,
    sendDraft,
    act,
    stop: chat.stop,
    olderAvailable: thread.olderAvailable,
    loadOlder: thread.loadOlder,
    gaps: gaps.gaps,
    gapsLoading: gaps.loading,
    gapsError: gaps.error,
    loadGaps: gaps.load,
    announcement: chat.announcement,
    available: configured && enabled,
  };
}

export type IdeaAgent = ReturnType<typeof useIdeaAgent>;
