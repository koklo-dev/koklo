import { useCallback, useEffect, useState } from "react";
import type { GateDecision, SessionDto } from "@koklo/trpc-client";
import { Button, EmptyState, Icon, Modal, SessionCard, Spinner, useToast } from "@koklo/ui";
import { PendingGateCenter } from "../components/PendingGateCenter";
import { RunModal } from "../components/RunModal";
import {
  saveLastProjectPath,
  submitRun,
  toCardProps,
  type RunForm,
  type SessionsClient,
} from "../lib/sessionsModel";
import {
  decisionCopy,
  gateDescription,
  gateKey,
  gateKindLabel,
  loadPendingGates,
  pendingGateCount,
  removePendingGate,
  type PendingGateItem,
} from "../lib/gatesModel";
import "./Sessions.css";

type LoadState = "loading" | "ready" | "error";

export interface SessionsScreenProps {
  client: SessionsClient;
  /** Open a session's transcript (roadmap P2 §4 navigation). */
  onOpenSession?: (session: SessionDto) => void;
  onPendingGateCountChange?: (count: number) => void;
  onSessionsChange?: (sessions: SessionDto[]) => void;
  openRunModalSignal?: number;
}

/**
 * Sessions screen — lists real sessions from `sessions.list` and starts new ones
 * through `sessions.run` (US-017-A backend). All visuals come from `@koklo/ui`;
 * this component only orchestrates data and state.
 */
export function SessionsScreen({
  client,
  onOpenSession,
  onPendingGateCountChange,
  onSessionsChange,
  openRunModalSignal = 0,
}: SessionsScreenProps) {
  const { toast } = useToast();
  const [load, setLoad] = useState<LoadState>("loading");
  const [sessions, setSessions] = useState<SessionDto[]>([]);
  const [pendingGates, setPendingGates] = useState<PendingGateItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [decision, setDecision] = useState<{
    action: Extract<GateDecision, "approve" | "reject">;
    item: PendingGateItem;
  } | null>(null);
  const [decidingKey, setDecidingKey] = useState<string | null>(null);

  const refresh = useCallback(async (showLoading = true) => {
    if (showLoading) setLoad("loading");
    try {
      const nextSessions = await client.sessions.list();
      const nextPendingGates = await loadPendingGates(client, nextSessions);
      setSessions(nextSessions);
      setPendingGates(nextPendingGates);
      setLoad("ready");
    } catch {
      setPendingGates([]);
      setLoad("error");
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh(false);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    onPendingGateCountChange?.(pendingGateCount(pendingGates));
  }, [onPendingGateCountChange, pendingGates]);

  useEffect(() => {
    onSessionsChange?.(sessions);
  }, [onSessionsChange, sessions]);

  useEffect(() => {
    if (openRunModalSignal > 0) {
      setModalOpen(true);
    }
  }, [openRunModalSignal]);

  const handleSubmit = useCallback(
    async (form: RunForm) => {
      setSubmitting(true);
      try {
        const session = await submitRun(client, form);
        saveLastProjectPath(window.localStorage, form.projectPath.trim());
        setModalOpen(false);
        toast({
          tone: "success",
          title: "Run started",
          description: `“${session.title}” is now running in a new worktree.`,
        });
        await refresh(false);
      } catch (err) {
        toast({
          tone: "danger",
          title: "Run failed to start",
          description: err instanceof Error ? err.message : "The run could not be started.",
        });
      } finally {
        setSubmitting(false);
      }
    },
    [client, refresh, toast],
  );

  const requestDecision = useCallback(
    (action: Extract<GateDecision, "approve" | "reject">, item: PendingGateItem) => {
      setDecision({ action, item });
    },
    [],
  );

  const confirmDecision = useCallback(async () => {
    if (!decision) return;
    const key = gateKey(decision.item);
    const copy = decisionCopy(decision.action);
    setDecidingKey(key);
    try {
      await client.gates.decide({
        sessionId: decision.item.session.id,
        requestId: decision.item.gate.requestId,
        action: decision.action,
      });
      setPendingGates((prev) => removePendingGate(prev, decision.item));
      setDecision(null);
      toast({
        tone: copy.toastTone,
        title: copy.toastTitle,
        description: `${decision.item.session.title} resumed from the ${decision.item.gate.phase} gate.`,
      });
      void refresh(false);
    } catch (err) {
      toast({
        tone: "danger",
        title: "Gate decision failed",
        description:
          err instanceof Error ? err.message : "The gate could not be updated on the backend.",
      });
    } finally {
      setDecidingKey(null);
    }
  }, [client, decision, refresh, toast]);

  return (
    <div className="ses-page">
      <header className="ses-head">
        <div>
          <h1>Sessions</h1>
          <p>Each run gets an isolated worktree. Track its status, then open the one you need.</p>
        </div>
        <Button
          variant="primary"
          icon={<Icon name="Plus" size={14} aria-hidden />}
          onClick={() => setModalOpen(true)}
        >
          New Run
        </Button>
      </header>

      {load === "ready" && (
        <PendingGateCenter
          items={pendingGates}
          busyKey={decidingKey}
          onApprove={(item) => requestDecision("approve", item)}
          onReject={(item) => requestDecision("reject", item)}
          onOpenSession={(item) => onOpenSession?.(item.session)}
        />
      )}

      {load === "loading" && (
        <div className="ses-loading" role="status">
          <Spinner size={20} />
          <span>Loading sessions…</span>
        </div>
      )}

      {load === "error" && (
        <EmptyState
          icon={<Icon name="AlertTriangle" size={28} aria-hidden />}
          title="Couldn’t load sessions"
          description="We couldn’t reach the session service. Your worktrees are safe — this is only a display error."
          action={
            <Button variant="secondary" onClick={() => void refresh()}>
              Retry
            </Button>
          }
        />
      )}

      {load === "ready" && sessions.length === 0 && (
        <EmptyState
          icon={<Icon name="Inbox" size={28} aria-hidden />}
          title="No sessions yet"
          description="Start a run to spin up an isolated worktree. It will appear here with its live status."
          action={
            <Button
              variant="primary"
              icon={<Icon name="Plus" size={14} aria-hidden />}
              onClick={() => setModalOpen(true)}
            >
              New Run
            </Button>
          }
        />
      )}

      {load === "ready" && sessions.length > 0 && (
        <div className="ses-list">
          {sessions.map((dto) => {
            const card = toCardProps(dto);
            return (
              <SessionCard
                key={card.id}
                {...card}
                selected={selectedId === card.id}
                onSelect={() => {
                  setSelectedId(card.id);
                  onOpenSession?.(dto);
                }}
              />
            );
          })}
        </div>
      )}

      <RunModal
        open={modalOpen}
        submitting={submitting}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />

      <Modal
        open={decision !== null}
        onClose={() => (decidingKey ? undefined : setDecision(null))}
        title={decision ? decisionCopy(decision.action).title : "Review gate"}
        description={
          decision
            ? `${gateKindLabel(decision.item.gate.kind)} · ${decision.item.session.title}`
            : undefined
        }
        actions={
          <>
            <Button variant="ghost" onClick={() => setDecision(null)} disabled={Boolean(decidingKey)}>
              Cancel
            </Button>
            <Button
              variant={decision?.action === "reject" ? "danger" : "primary"}
              onClick={() => void confirmDecision()}
              loading={Boolean(decidingKey)}
              disabled={Boolean(decidingKey)}
            >
              {decision ? decisionCopy(decision.action).confirm : "Confirm"}
            </Button>
          </>
        }
      >
        {decision && (
          <div className="ses-form">
            <div className="ses-field">
              <span className="ses-label">Gate</span>
              <p>{gateDescription(decision.item)}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
