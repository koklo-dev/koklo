"use client";

import {
  Button,
  ProposalCriterion,
  type ProposalDecision,
  ProposalDetail,
  ProposalDetailSection,
  type ProposalReviewItem,
} from "@koklo/ui";
import { useState } from "react";
import type { AiErrorView } from "../lib/ai-errors.ts";
import type { FormIssue } from "../lib/feature-form.ts";
import { editedContentOf, editValuesOf, issuesOf } from "../lib/proposal-edit.ts";
import type { ProposalOutput } from "../lib/proposal-types.ts";
import type { EditValues } from "../lib/proposal-validation.ts";
import { AiErrorNotice } from "./ai-error-notice.tsx";
import { ProposalCriteriaEditor } from "./proposal-criteria-editor.tsx";
import { ProposalEditor } from "./proposal-editor.tsx";
import { ProposalIssues } from "./proposal-issues.tsx";

const STEP_LABELS: Record<string, string> = {
  etant_donne: "Étant donné",
  quand: "Quand",
  alors: "Alors",
  et: "Et",
};

type Criterion = { title?: unknown; steps?: Array<{ type?: unknown; text?: unknown }> };
const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** Contenu en lecture : tout est rendu en nœuds texte (jamais de lien, de balise ni d'image : sortie du modèle hostile). */
function Content({ proposal }: { proposal: ProposalOutput }) {
  const { content } = proposal;
  const criteria = (Array.isArray(content.criteria) ? content.criteria : []) as Criterion[];
  const description = text(content.description);
  return (
    <>
      {description ? <p className="whitespace-pre-line text-body">{description}</p> : null}
      <ProposalDetailSection title="Critères d'acceptation">
        <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
          {criteria.map((criterion, index) => (
            <ProposalCriterion
              // biome-ignore lint/suspicious/noArrayIndexKey: critères d'une proposition, ordre fixe
              key={index}
              id={`AC-${index + 1}`}
              title={text(criterion.title)}
              steps={(criterion.steps ?? []).map((step) => ({
                label: STEP_LABELS[text(step.type)] ?? "Et",
                text: text(step.text),
              }))}
            />
          ))}
        </ol>
      </ProposalDetailSection>
    </>
  );
}

/** Édition sur place : mêmes éditeurs que le cadrage, « Terminer » valide puis accepte avec le contenu corrigé. */
function Editing({
  proposal,
  onFinish,
  onCancel,
  announce,
}: {
  proposal: ProposalOutput;
  onFinish: (edited: Record<string, unknown>) => void;
  onCancel: () => void;
  announce: (text: string) => void;
}) {
  const [values, setValues] = useState<EditValues>(() => editValuesOf(proposal));
  const [issues, setIssues] = useState<FormIssue[]>([]);
  const finish = () => {
    const found = issuesOf(values);
    setIssues(found);
    if (found.length === 0) onFinish(editedContentOf(proposal, values));
  };
  if (proposal.kind === "criteria") {
    return (
      <div className="flex flex-col gap-4">
        <ProposalIssues proposalId={proposal.id} issues={issues} />
        <ProposalCriteriaEditor
          proposalId={proposal.id}
          criteria={values.criteria}
          onChange={(criteria) => setValues({ ...values, criteria })}
          error={(field) => issues.find((issue) => issue.field === field)?.message}
          announce={announce}
        />
        <div className="flex gap-2">
          <Button type="button" className="h-11 md:h-9" onClick={finish}>
            Terminer la modification
          </Button>
          <Button type="button" variant="outline" className="h-11 md:h-9" onClick={onCancel}>
            Annuler les modifications
          </Button>
        </div>
      </div>
    );
  }
  return (
    <ProposalEditor
      proposalId={proposal.id}
      values={values}
      onChange={setValues}
      issues={issues}
      onFinish={finish}
      onCancel={onCancel}
      announce={announce}
    />
  );
}

export interface ReviewDetailProps {
  proposal: ProposalOutput;
  item: ProposalReviewItem;
  onDecide: (id: string, decision: ProposalDecision, edited?: Record<string, unknown>) => void;
  onRevise: (id: string, instruction: string) => void;
  reviseBusy: boolean;
  reviseError: AiErrorView | null;
  announce: (text: string) => void;
}

/** Détail de la proposition choisie : lecture, ou édition sur place ; la révision par l'agent garde sa propre alerte. */
export function ReviewDetail(props: ReviewDetailProps) {
  const { proposal, item, onDecide, announce } = props;
  const [editing, setEditing] = useState<string | null>(null);
  const isEditing = editing === proposal.id && item.status === "pending";
  return (
    <ProposalDetail
      item={item}
      why={proposal.rationale}
      onDecide={onDecide}
      {...(item.status === "pending" ? { onEdit: () => setEditing(proposal.id) } : {})}
      {...(item.status === "pending"
        ? { onRevise: (instruction: string) => props.onRevise(proposal.id, instruction) }
        : {})}
      reviseBusy={props.reviseBusy}
    >
      {props.reviseError ? (
        <AiErrorNotice view={props.reviseError} remaining={null} onRetry={() => undefined} />
      ) : null}
      {isEditing ? (
        <Editing
          proposal={proposal}
          announce={announce}
          onCancel={() => setEditing(null)}
          onFinish={(edited) => {
            setEditing(null);
            onDecide(proposal.id, "accepted", edited);
          }}
        />
      ) : (
        <Content proposal={proposal} />
      )}
    </ProposalDetail>
  );
}
