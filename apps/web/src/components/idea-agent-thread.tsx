import { AgentGapsCard, Button, ChatBubble, Icon } from "@koklo/ui";
import { AGENT_FIRST_MESSAGE, MODE_HINT } from "../lib/idea-agent-labels.ts";
import { composerOf, focusWhenReady, visible } from "../lib/idea-focus.ts";
import type { IdeaAgent } from "../lib/use-idea-agent.ts";

/** Le bouton « Voir ce qui manque » laisse la place à la carte : focus sur son premier bouton, sinon sur la saisie. */
function focusAfterGaps() {
  focusWhenReady((left) => {
    const card = document.querySelector("[data-slot='agent-gaps-card']");
    const first = card ? visible(card.querySelectorAll<HTMLElement>("button")) : undefined;
    if (first) return first;
    if (left > 20) return null;
    return document.querySelector<HTMLElement>("[data-gaps-trigger]") ?? composerOf();
  });
}

/** « Messages plus anciens » disparaît quand il n'y en a plus : focus sur la saisie. */
function focusAfterOlder() {
  focusWhenReady((left) => {
    const trigger = document.querySelector<HTMLElement>("[data-older-trigger]");
    if (trigger) return left > 20 ? null : trigger;
    return composerOf();
  });
}

/** Fil de messages, message en cours de flux, indication de mode et « Ce qui manque encore ». */
export function IdeaAgentThread({
  agent,
  onExplore,
  onProposePage,
}: {
  agent: IdeaAgent;
  onExplore: (file: string | undefined) => void;
  onProposePage: (text: string) => void;
}) {
  const empty = agent.messages.length === 0 && !agent.streaming;
  return (
    <>
      <p className="flex items-center gap-2 text-caption font-normal text-muted-foreground">
        <Icon name="explore" size={16} />
        {MODE_HINT[agent.mode]}
      </p>
      {agent.olderAvailable ? (
        <Button
          variant="text"
          size="xs"
          data-older-trigger=""
          onClick={() => void agent.loadOlder().then(focusAfterOlder)}
        >
          Messages plus anciens
        </Button>
      ) : null}
      {empty ? (
        <ChatBubble author="agent" name="Agent">
          {AGENT_FIRST_MESSAGE}
        </ChatBubble>
      ) : null}
      {agent.messages.map((message) => (
        <ChatBubble key={message.id} author={message.author} name={message.name}>
          {message.text}
        </ChatBubble>
      ))}
      {agent.streaming ? (
        <ChatBubble author="agent" name="Agent" aria-busy="true">
          {agent.streamText || "…"}
        </ChatBubble>
      ) : null}
      {agent.gaps ? (
        <AgentGapsCard
          items={agent.gaps}
          onAction={(gap) => (gap.kind === "page" ? onExplore(gap.file) : onProposePage(gap.text))}
        />
      ) : (
        <Button
          variant="outline"
          size="xs"
          className="self-start"
          loading={agent.gapsLoading}
          data-gaps-trigger=""
          onClick={() => void agent.loadGaps().then(focusAfterGaps)}
        >
          Voir ce qui manque
        </Button>
      )}
    </>
  );
}
