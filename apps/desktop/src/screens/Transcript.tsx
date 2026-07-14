import { useCallback, useEffect, useRef, useState } from "react";
import type { GateDecision, TranscriptLineDto } from "@koklo/trpc-client";
import {
  AiActionCard,
  Badge,
  Button,
  CodeBlock,
  EmptyState,
  Icon,
  MessageBubble,
  Modal,
  Spinner,
  useToast,
} from "@koklo/ui";
import {
  canDecideGate,
  gateActionState,
  gateRequestKey,
  gateResolutionByRequestId,
  isNearBottom,
  isStreaming,
  latestPhase,
  latestUsage,
  lineText,
  loadAndSubscribe,
  maxSeq,
  mergeLine,
  messageRole,
  renderTypeOf,
  toCodeLines,
  type TranscriptClient,
} from "../lib/transcriptModel";
import "./Transcript.css";

type LoadState = "loading" | "ready" | "error";

export interface TranscriptScreenProps {
  client: TranscriptClient;
  sessionId: string;
  sessionTitle?: string;
  /** Back to the Sessions list. */
  onBack?: () => void;
}

/** Render one transcript line with the DS component for its type (AC#1, AC#5). */
function TranscriptLine({
  line,
  resolvedGates,
  optimisticResolvedIds,
  onApprove,
  onReject,
}: {
  line: TranscriptLineDto;
  resolvedGates: ReadonlyMap<string, "approve" | "reject" | "edit">;
  optimisticResolvedIds: ReadonlySet<string>;
  onApprove: (line: TranscriptLineDto) => void;
  onReject: (line: TranscriptLineDto) => void;
}) {
  switch (renderTypeOf(line)) {
    case "llm":
      return (
        <MessageBubble
          role={messageRole(line)}
          content={lineText(line)}
          timestamp={line.agentName ?? undefined}
          isTyping={isStreaming(line)}
        />
      );
    case "shell":
      return <CodeBlock filename={lineText(line).split("\n")[0]} lines={toCodeLines(line)} theme="dark" />;
    case "output":
      return <CodeBlock lines={toCodeLines(line)} theme="dark" />;
    case "gate":
      const pendingApproval = canDecideGate(line, resolvedGates, optimisticResolvedIds);
      const state = gateActionState(line, resolvedGates, optimisticResolvedIds);
      return (
        <AiActionCard
          title={line.summary || "Approval required"}
          description={lineText(line)}
          filename={line.itemKey ?? line.phase ?? "gate"}
          state={state}
          readOnly={!pendingApproval}
          onValidate={pendingApproval ? () => onApprove(line) : undefined}
          onReject={pendingApproval ? () => onReject(line) : undefined}
        />
      );
    case "meta":
    default:
      return null;
  }
}

/**
 * Transcript view (US-018, roadmap P2 §4). Loads history from SQLite, then streams
 * live lines; renders one DS component per line type with pausable auto-scroll. All
 * logic lives in `transcriptModel`; this component only wires data → DS.
 */
export function TranscriptScreen({ client, sessionId, sessionTitle, onBack }: TranscriptScreenProps) {
  const { toast } = useToast();
  const [load, setLoad] = useState<LoadState>("loading");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [lines, setLines] = useState<TranscriptLineDto[]>([]);
  const [following, setFollowing] = useState(true);
  const [decision, setDecision] = useState<{
    action: Extract<GateDecision, "approve" | "reject">;
    line: TranscriptLineDto;
  } | null>(null);
  const [decidingGateId, setDecidingGateId] = useState<string | null>(null);
  const [optimisticResolvedIds, setOptimisticResolvedIds] = useState<Set<string>>(new Set());

  const scrollRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(following);
  followingRef.current = following;
  // Replay cursor: live lines with seq ≤ this were already in history (AC#2 dedupe).
  const replayCursorRef = useRef(0);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    setLoad("loading");
    setErrorDetail(null);
    setLines([]);
    setOptimisticResolvedIds(new Set());
    replayCursorRef.current = 0;

    loadAndSubscribe(client, sessionId, (line) => {
      // A persisted line (real seq) at or below the replay cursor was already painted
      // from history on reload — drop it. Live lines carry the seq-0 sentinel and always
      // pass through; mergeLine dedupes them by id (AC#2).
      if (line.seq > 0 && line.seq <= replayCursorRef.current) return;
      setLines((prev) => mergeLine(prev, line));
    })
      .then(({ history, unlisten: off }) => {
        if (cancelled) {
          off();
          return;
        }
        replayCursorRef.current = maxSeq(history);
        setLines(history);
        setLoad("ready");
        unlisten = off;
      })
      .catch((err: unknown) => {
        // Surface the real IPC rejection (e.g. an unregistered command on a stale
        // backend build) both in the console and inline in the error card, instead
        // of swallowing it into a generic message.
        console.error("transcript load failed:", err);
        if (!cancelled) {
          setErrorDetail(err instanceof Error ? err.message : String(err));
          setLoad("error");
        }
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [client, sessionId]);

  // Fallback replay poll: if a live event is missed or the desktop runtime restarts,
  // recover persisted lines from SQLite using the seq cursor. The live subscription
  // remains the primary path; this just closes gaps.
  useEffect(() => {
    if (load !== "ready") return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      const sinceSeq = replayCursorRef.current;
      void client.transcript
        .since({ sessionId, sinceSeq })
        .then((rows) => {
          if (cancelled || rows.length === 0) return;
          replayCursorRef.current = Math.max(replayCursorRef.current, maxSeq(rows));
          setLines((prev) => rows.reduce((next, row) => mergeLine(next, row), prev));
        })
        .catch(() => {
          // Keep the live subscription path authoritative; polling is best-effort only.
        });
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [client, load, sessionId]);

  // Auto-scroll to the newest line while following (AC#3 — paused = no scroll).
  useEffect(() => {
    if (!following) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, following]);

  // Scrolling up disengages follow; returning to the bottom re-engages it.
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = isNearBottom(el);
    if (near !== followingRef.current) setFollowing(near);
  }, []);

  const phase = latestPhase(lines);
  const usage = latestUsage(lines);
  const visibleLines = lines.filter((l) => renderTypeOf(l) !== "meta");
  const resolvedGates = gateResolutionByRequestId(lines);

  const requestDecision = useCallback(
    (action: Extract<GateDecision, "approve" | "reject">, line: TranscriptLineDto) => {
      setDecision({ action, line });
    },
    [],
  );

  const confirmDecision = useCallback(async () => {
    const gateKey = decision ? gateRequestKey(decision.line) : null;
    if (!decision || !gateKey) return;
    setDecidingGateId(gateKey);
    try {
      await client.gates.decide({
        sessionId,
        // Phase gates have no provider request id; the backend then matches
        // the pending gate by session only.
        requestId: decision.line.itemKey,
        action: decision.action,
      });
      setOptimisticResolvedIds((prev) => new Set(prev).add(gateKey));
      setDecision(null);
      toast({
        tone: decision.action === "approve" ? "success" : "warning",
        title: decision.action === "approve" ? "Gate approved" : "Gate rejected",
        description: `${sessionTitle ?? "Session"} resumed from the ${decision.line.phase ?? "current"} gate.`,
      });
    } catch (err) {
      toast({
        tone: "danger",
        title: "Gate decision failed",
        description:
          err instanceof Error ? err.message : "The gate could not be updated on the backend.",
      });
    } finally {
      setDecidingGateId(null);
    }
  }, [client, decision, sessionId, sessionTitle, toast]);

  return (
    <div className="tr-page">
      <header className="tr-head">
        <div className="tr-head-main">
          {onBack && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Icon name="ChevronLeft" size={14} aria-hidden />}
              onClick={onBack}
            >
              Sessions
            </Button>
          )}
          <h1>{sessionTitle ?? "Transcript"}</h1>
          {phase && (
            <Badge variant="info" icon={<Icon name="Workflow" size={10} aria-hidden />}>
              {phase}
            </Badge>
          )}
        </div>
        <div className="tr-head-meta">
          {usage && (
            <span className="tr-usage" title="Tokens (prompt + completion) and estimated cost">
              <Icon name="Hash" size={12} aria-hidden />
              {usage.promptTokens + usage.completionTokens} tok
              {usage.costUsd !== null && <span className="tr-cost">${usage.costUsd.toFixed(4)}</span>}
            </span>
          )}
          <Button
            variant={following ? "secondary" : "primary"}
            size="sm"
            aria-pressed={!following}
            icon={<Icon name={following ? "Pin" : "ArrowDownAZ"} size={13} aria-hidden />}
            onClick={() => setFollowing((v) => !v)}
          >
            {following ? "Following" : "Paused"}
          </Button>
        </div>
      </header>

      {load === "loading" && (
        <div className="tr-loading" role="status">
          <Spinner size={20} />
          <span>Loading transcript…</span>
        </div>
      )}

      {load === "error" && (
        <EmptyState
          icon={<Icon name="AlertTriangle" size={28} aria-hidden />}
          title="Couldn’t load the transcript"
          description={
            errorDetail
              ? `The transcript service returned an error: ${errorDetail}`
              : "We couldn’t reach the transcript service. The session keeps running — this is only a display error."
          }
        />
      )}

      {load === "ready" && (
        <div className="tr-stream" ref={scrollRef} onScroll={handleScroll}>
          {visibleLines.length === 0 ? (
            <EmptyState
              icon={<Icon name="Conversation" size={28} aria-hidden />}
              title="No transcript yet"
              description="Lines will stream in here as the pipeline runs."
            />
          ) : (
            visibleLines.map((line) => (
              <div key={line.id} className={`tr-line tr-line-${renderTypeOf(line)}`}>
                <TranscriptLine
                  line={line}
                  resolvedGates={resolvedGates}
                  optimisticResolvedIds={optimisticResolvedIds}
                  onApprove={(entry) => requestDecision("approve", entry)}
                  onReject={(entry) => requestDecision("reject", entry)}
                />
              </div>
            ))
          )}
        </div>
      )}

      {load === "ready" && !following && (
        <div className="tr-jump">
          <Button
            variant="primary"
            size="sm"
            icon={<Icon name="ArrowDownAZ" size={13} aria-hidden />}
            onClick={() => setFollowing(true)}
          >
            Jump to latest
          </Button>
        </div>
      )}

      <Modal
        open={decision !== null}
        onClose={() => (decidingGateId ? undefined : setDecision(null))}
        title={decision?.action === "reject" ? "Reject this gate?" : "Approve this gate?"}
        description={decision ? `${decision.line.phase ?? "gate"} · ${decision.line.summary}` : "Review gate"}
        actions={
          <>
            <Button variant="ghost" onClick={() => setDecision(null)} disabled={decidingGateId !== null}>
              Cancel
            </Button>
            <Button
              variant={decision?.action === "reject" ? "danger" : "primary"}
              onClick={() => void confirmDecision()}
              loading={decidingGateId !== null}
              disabled={decidingGateId !== null}
            >
              {decision?.action === "reject" ? "Reject" : "Approve"}
            </Button>
          </>
        }
      >
        {decision ? lineText(decision.line) : null}
      </Modal>
    </div>
  );
}
