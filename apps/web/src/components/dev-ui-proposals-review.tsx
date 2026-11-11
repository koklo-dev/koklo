"use client";

import {
  ProposalCriterion,
  type ProposalDecision,
  ProposalDetail,
  ProposalDetailSection,
  type ProposalFilter,
  ProposalReview,
  type ProposalReviewProps,
} from "@koklo/ui";
import { useMemo, useState } from "react";
import {
  countsOf,
  type Decisions,
  type DemoProposal,
  demoProposals,
  groupsOf,
  subtitleOf,
} from "./dev-ui-proposals-data.ts";

const noop = () => undefined;

function useDemoReview(proposals: readonly DemoProposal[]) {
  const [decisions, setDecisions] = useState<Decisions>({});
  const [filter, setFilter] = useState<ProposalFilter>("pending");
  const [shown, setShown] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | undefined>(proposals[5]?.id);
  const [announcement, setAnnouncement] = useState("");
  const counts = useMemo(() => countsOf(proposals, decisions), [proposals, decisions]);
  const groups = useMemo(
    () => groupsOf(proposals, decisions, filter, shown),
    [proposals, decisions, filter, shown],
  );
  const decide = (id: string, decision: ProposalDecision) => {
    setDecisions((prev) => ({ ...prev, [id]: decision }));
    const ref = proposals.find((p) => p.id === id)?.ref ?? id;
    setAnnouncement(
      `${ref} ${decision === "accepted" ? "acceptée" : decision === "rejected" ? "rejetée" : "remise à relire"}`,
    );
  };
  const acceptGroup = (key: string) => {
    const own = proposals.filter(
      (p) => `${p.type}:${p.zone}` === key && (decisions[p.id] ?? "pending") === "pending",
    );
    setDecisions((prev) => ({
      ...prev,
      ...Object.fromEntries(own.map((p) => [p.id, "accepted" as const])),
    }));
    setAnnouncement(`${own.length} propositions acceptées dans ${key.split(":")[1]}`);
  };
  const loadMore = (key: string) => setShown((prev) => ({ ...prev, [key]: (prev[key] ?? 8) + 20 }));
  const props: Omit<ProposalReviewProps, "children"> = {
    counts,
    groups,
    filter,
    onFilterChange: setFilter,
    selectedId,
    onSelect: setSelectedId,
    onDecide: decide,
    onAcceptGroup: acceptGroup,
    onLoadMore: loadMore,
    onSave: noop,
    onLeave: noop,
    announcement,
  };
  return { props, decisions };
}

function DemoDetail({
  proposal,
  status,
  onDecide,
}: {
  proposal: DemoProposal;
  status: "pending" | "accepted" | "rejected";
  onDecide: ProposalReviewProps["onDecide"];
}) {
  return (
    <ProposalDetail
      item={{
        id: proposal.id,
        ref: proposal.ref,
        title: proposal.title,
        subtitle: subtitleOf(proposal),
        status,
      }}
      why={proposal.why}
      onDecide={onDecide}
      onEdit={noop}
      onRevise={noop}
    >
      <p className="text-body">{proposal.description}</p>
      <ProposalDetailSection title="Critères d'acceptation">
        <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
          {proposal.criteria.map((c) => (
            <ProposalCriterion
              key={c.id}
              id={c.id}
              title={c.title}
              steps={[
                { label: "Étant donné", text: c.given },
                { label: "Quand", text: c.when },
                { label: "Alors", text: c.outcome },
              ]}
            />
          ))}
        </ol>
      </ProposalDetailSection>
    </ProposalDetail>
  );
}

/** Relecture interactive de la galerie : 12 propositions (à plat) ou 400 (groupes, `VirtualList`). */
export function DemoReview({ count }: { count: number }) {
  const proposals = useMemo(() => demoProposals(count), [count]);
  const { props, decisions } = useDemoReview(proposals);
  const selected =
    proposals.find((p) => p.id === props.selectedId) ?? (proposals[0] as DemoProposal);
  const raw = decisions[selected.id] ?? "pending";
  return (
    <ProposalReview {...props} className="overflow-hidden rounded-xl border">
      <DemoDetail
        proposal={selected}
        status={raw === "pending" ? "pending" : raw}
        onDecide={props.onDecide}
      />
    </ProposalReview>
  );
}
