"use client";

import type { SecuritySummaryRead } from "@koklo/contract";
import { Button, ContextBanner, Icon, ProposedPageCard } from "@koklo/ui";
import { shortDate } from "../lib/overview-labels.ts";
import type { ProposalOutput } from "../lib/proposal-types.ts";
import {
  CARD_TITLES,
  NO_SUMMARY_TEXT,
  NO_SUMMARY_TITLE,
  SUMMARY_PREPARING,
  summaryFoot,
  TEAM_INTRO,
  UPDATE_SUMMARY,
} from "../lib/security-labels.ts";
import type { SecurityPageModel } from "../lib/use-security-page.ts";
import { useSummaryAgent } from "../lib/use-security-summary.ts";
import { useAcceptSummary } from "../lib/use-security-writes.ts";
import { ErrorNotice } from "./error-notice.tsx";
import { SecurityEmpty, SecurityRead } from "./security-empty.tsx";
import { ContactExpectation, SummaryCards } from "./security-summary-cards.tsx";

type Agent = ReturnType<typeof useSummaryAgent>;

/** Cartes que la proposition change : leur titre et leur nouveau texte, en nœuds texte. */
function Changes({ proposal, read }: { proposal: ProposalOutput; read: SecuritySummaryRead }) {
  const current = new Map(read.cards.map((card) => [card.key, card.text]));
  return (
    <>
      {(Object.keys(CARD_TITLES) as Array<keyof typeof CARD_TITLES>).map((key) => {
        const text = proposal.content[key];
        if (typeof text !== "string" || text === current.get(key)) return null;
        return (
          <p key={key} className="m-0 break-words text-[15px] leading-[1.6]">
            <strong className="block text-subsection-title">{CARD_TITLES[key]}</strong>
            {text}
          </p>
        );
      })}
    </>
  );
}

function Proposal({
  page,
  agent,
  read,
}: {
  page: SecurityPageModel;
  agent: Agent;
  read: SecuritySummaryRead;
}) {
  const accept = useAcceptSummary(page);
  const { proposal } = agent;
  if (!proposal) return null;
  return (
    <ProposedPageCard
      label="summary"
      title={`Proposition de l'agent · ${proposal.rationale}`}
      rationale=""
      busy={page.write.busy || page.write.behind || agent.rejecting}
      onAccept={() => accept(proposal.id)}
      onIgnore={() => agent.reject(proposal.id)}
    >
      <Changes proposal={proposal} read={read} />
    </ProposedPageCard>
  );
}

function Intro({ page, agent }: { page: SecurityPageModel; agent: Agent }) {
  const canAsk = page.propose.enabled && page.form.canWrite && page.available !== false;
  return (
    <ContextBanner
      icon="visibility"
      actions={
        canAsk ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="max-md:h-11"
            disabled={agent.asking}
            onClick={agent.ask}
          >
            <Icon name="wand_stars" size={16} />
            {UPDATE_SUMMARY}
          </Button>
        ) : null
      }
    >
      {TEAM_INTRO}
    </ContextBanner>
  );
}

function Summary({ page, read }: { page: SecurityPageModel; read: SecuritySummaryRead }) {
  const agent = useSummaryAgent(page);
  const reviewed = page.deliverable === "validated" ? page.validation?.at : undefined;
  return (
    <>
      <Intro page={page} agent={agent} />
      {agent.error ? <ErrorNotice>{agent.error}</ErrorNotice> : null}
      {page.propose.status.active ? (
        <p role="status" className="m-0 text-meta text-muted-foreground">
          {SUMMARY_PREPARING}
        </p>
      ) : null}
      <Proposal page={page} agent={agent} read={read} />
      {read.available ? (
        <>
          <SummaryCards cards={read.cards} />
          <ContactExpectation contact={read.contact} />
          <p className="m-0 text-caption font-normal text-muted-foreground">
            {summaryFoot(reviewed ? shortDate(reviewed) : undefined)}
          </p>
        </>
      ) : (
        <SecurityEmpty icon="summarize" title={NO_SUMMARY_TITLE} text={NO_SUMMARY_TEXT} />
      )}
    </>
  );
}

/** Onglet Résumé client (maquette 15 l.204-215) : ce que lit le client, et la proposition de l'agent relue sur place. */
export function SecuritySummaryTab({ page }: { page: SecurityPageModel }) {
  return (
    <div className="flex min-w-0 flex-col gap-4 px-4 pt-5 pb-8 md:px-7">
      <SecurityRead query={page.totals.summary}>
        {(read) => <Summary page={page} read={read as SecuritySummaryRead} />}
      </SecurityRead>
    </div>
  );
}
