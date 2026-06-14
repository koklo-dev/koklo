import { useCallback, useEffect, useState } from "react";
import type { SessionDto } from "@koklo/trpc-client";
import { Button, EmptyState, Icon, SessionCard, Spinner, useToast } from "@koklo/ui";
import { RunModal } from "../components/RunModal";
import { submitRun, toCardProps, type RunForm, type SessionsClient } from "../lib/sessionsModel";
import "./Sessions.css";

type LoadState = "loading" | "ready" | "error";

export interface SessionsScreenProps {
  client: SessionsClient;
  /** Project root the New Run should target. */
  projectPath: string;
}

/**
 * Sessions screen — lists real sessions from `sessions.list` and starts new ones
 * through `sessions.run` (US-017-A backend). All visuals come from `@koklo/ui`;
 * this component only orchestrates data and state.
 */
export function SessionsScreen({ client, projectPath }: SessionsScreenProps) {
  const { toast } = useToast();
  const [load, setLoad] = useState<LoadState>("loading");
  const [sessions, setSessions] = useState<SessionDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    setLoad("loading");
    try {
      setSessions(await client.sessions.list());
      setLoad("ready");
    } catch {
      setLoad("error");
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSubmit = useCallback(
    async (form: RunForm) => {
      setSubmitting(true);
      try {
        const session = await submitRun(client, form, projectPath);
        setModalOpen(false);
        toast({
          tone: "success",
          title: "Run started",
          description: `“${session.title}” is now running in a new worktree.`,
        });
        await refresh();
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
    [client, projectPath, refresh, toast],
  );

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
                onSelect={() => setSelectedId(card.id)}
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
    </div>
  );
}
