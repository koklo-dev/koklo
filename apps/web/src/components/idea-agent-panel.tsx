"use client";

import type { IdeaPageSummary } from "@koklo/contract";
import { AgentComposer, AgentPanel, AgentPrivacyNote, InlineAlert, Skeleton } from "@koklo/ui";
import { PRIVACY_NEVER, PRIVACY_NOTE, PRIVACY_SENT } from "../lib/idea-agent-labels.ts";
import { composerOf } from "../lib/idea-focus.ts";
import type { IdeaAgent } from "../lib/use-idea-agent.ts";
import { IdeaAgentThread } from "./idea-agent-thread.tsx";
import { IdeaAgentUnconfigured } from "./idea-agent-unconfigured.tsx";

function AgentError({ agent }: { agent: IdeaAgent }) {
  const { error } = agent;
  if (!error) return null;
  const detail = [error.detail, error.action].filter(Boolean).join(" ");
  return (
    <InlineAlert
      variant={error.kind === "rate_limited" ? "warning" : "error"}
      icon={error.icon}
      action={
        error.retryable && agent.draft
          ? {
              label: "Réessayer",
              onClick: () => {
                void agent.sendDraft();
                composerOf()?.focus(); // l'alerte disparaît pendant le nouvel envoi
              },
            }
          : undefined
      }
    >
      <p>{error.message}</p>
      {detail ? <p>{detail}</p> : null}
    </InlineAlert>
  );
}

function Footer({ agent }: { agent: IdeaAgent }) {
  return (
    <>
      <AgentError agent={agent} />
      <AgentComposer
        value={agent.draft}
        onValueChange={agent.setDraft}
        onSend={agent.sendDraft}
        onStop={agent.stop}
        streaming={agent.streaming}
      />
      <AgentPrivacyNote
        details={
          <div className="flex flex-col gap-1.5">
            <p>{PRIVACY_SENT}</p>
            <p>{PRIVACY_NEVER}</p>
          </div>
        }
      >
        {PRIVACY_NOTE}
      </AgentPrivacyNote>
    </>
  );
}

const PANEL_CLASS = "w-full max-lg:border-t max-lg:border-l-0 lg:min-h-0 lg:w-[380px] lg:flex-none";

/** Panneau de l'agent de l'espace Idée (maquette 06) : Entretien / Libre, fil, flux, manques, saisie, état sans clé. */
export function IdeaAgentPanel({
  agent,
  current,
  onExplore,
}: {
  agent: IdeaAgent;
  current: IdeaPageSummary | undefined;
  onExplore: (file: string | undefined) => void;
}) {
  if (!agent.status) {
    return (
      <AgentPanel className={PANEL_CLASS} aria-busy="true">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-16 w-full" />
      </AgentPanel>
    );
  }
  if (!agent.status.configured) {
    return (
      <AgentPanel className={PANEL_CLASS}>
        <IdeaAgentUnconfigured canConfigure={agent.status.canConfigure} current={current} />
      </AgentPanel>
    );
  }
  return (
    <AgentPanel
      className={PANEL_CLASS}
      mode={agent.mode}
      onModeChange={agent.setMode}
      footer={<Footer agent={agent} />}
    >
      <IdeaAgentThread
        agent={agent}
        onExplore={onExplore}
        onProposePage={(text) =>
          void agent.send({
            text: `Propose une page : ${text}`,
            action: "make_page",
            selection: text,
          })
        }
      />
      <p aria-live="polite" className="sr-only">
        {agent.announcement}
      </p>
    </AgentPanel>
  );
}
