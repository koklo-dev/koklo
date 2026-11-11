"use client";

import { type FormEvent, type ReactNode, useState } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { Button } from "./button.tsx";
import { IdTag } from "./id-tag.tsx";
import { Pill } from "./pill.tsx";
import {
  PROPOSAL_STATE,
  type ProposalDecision,
  type ProposalReviewItem,
} from "./proposal-review-types.ts";

export interface ProposalDetailProps {
  item: ProposalReviewItem;
  /** Justification de l'agent (« pourquoi cette proposition »), sous le titre. */
  why?: string;
  /** Ligne de contexte facultative (« Type : contrainte »). */
  meta?: string;
  onDecide: (id: string, decision: ProposalDecision) => void;
  /** Ouvre l'éditeur ; sans lui, pas de bouton « Modifier ». */
  onEdit?: () => void;
  /** « Demander une modification à l'agent » ; sans lui, pas de champ. */
  onRevise?: (text: string) => void;
  /** Une demande est en cours : l'envoi est inactif. */
  reviseBusy?: boolean;
  children?: ReactNode;
}

function ReviseField({ onRevise, busy }: { onRevise: (text: string) => void; busy: boolean }) {
  const [text, setText] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (busy || trimmed === "") return;
    onRevise(trimmed);
    setText("");
  };
  return (
    <form
      onSubmit={submit}
      className="flex h-11 min-w-0 flex-[1_1_240px] items-center gap-2 rounded-lg border bg-background pl-3 pr-1.5 focus-within:ring-2 focus-within:ring-ring md:h-9"
    >
      <input
        aria-label="Demander une modification à l'agent"
        placeholder="Demander une modification à l'agent"
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="min-w-0 flex-1 bg-transparent text-meta outline-none placeholder:text-muted-foreground"
      />
      <button
        type="submit"
        aria-label="Envoyer la demande"
        aria-disabled={busy || text.trim() === "" ? "true" : undefined}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring md:size-8"
      >
        <Icon name="arrow_upward" size={18} />
      </button>
    </form>
  );
}

function PendingActions(props: ProposalDetailProps) {
  const { item, onDecide, onEdit, onRevise } = props;
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
      <Button
        icon="check"
        shortcut="A"
        className="h-11 md:h-9"
        onClick={() => onDecide(item.id, "accepted")}
      >
        Accepter
      </Button>
      {onEdit ? (
        <Button variant="outline" className="h-11 md:h-9" onClick={onEdit}>
          Modifier
        </Button>
      ) : null}
      <Button
        variant="ghost"
        shortcut="R"
        className="h-11 md:h-9"
        onClick={() => onDecide(item.id, "rejected")}
      >
        Rejeter
      </Button>
      {onRevise ? <ReviseField onRevise={onRevise} busy={props.reviseBusy ?? false} /> : null}
    </div>
  );
}

function DecidedActions({ item, onDecide }: ProposalDetailProps) {
  return (
    <div className="border-t border-border pt-3">
      <Button
        variant="outline"
        className="h-11 md:h-9"
        onClick={() => onDecide(item.id, "pending")}
      >
        Remettre à relire
      </Button>
    </div>
  );
}

function BlockedNote() {
  return (
    <p className="flex items-center gap-2 border-t border-border pt-3 text-meta text-muted-foreground">
      <Icon name="error" size={18} fill tone="danger" />
      Enregistrement échoué · à reprendre par l'équipe technique
    </p>
  );
}

/** Détail de la proposition choisie (maquette 10 l.135-168) : en-tête, justification, contenu, actions. */
export function ProposalDetail(props: ProposalDetailProps) {
  const { item, why, meta, children } = props;
  const state = PROPOSAL_STATE[item.status];
  return (
    <article
      data-slot="proposal-detail"
      className="flex min-w-0 flex-[999_1_420px] flex-col gap-3.5 px-4 py-5 md:px-7"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <IdTag size="default">{item.ref}</IdTag>
        <h2 className="text-xl font-semibold">{item.title}</h2>
        <Pill tone={item.status === "accepted" ? "soft" : "outline"}>{state.label}</Pill>
      </div>
      {why ? (
        <p className="flex gap-2 text-meta text-muted-foreground">
          <Icon name="wand_stars" size={16} tone="primary" className="mt-0.5" />
          {why}
        </p>
      ) : null}
      {meta ? <p className="text-meta text-muted-foreground">{meta}</p> : null}
      {children}
      {item.status === "pending" ? <PendingActions {...props} /> : null}
      {item.status === "accepted" || item.status === "rejected" ? (
        <DecidedActions {...props} />
      ) : null}
      {item.status === "blocked" ? <BlockedNote /> : null}
      <p className="text-caption font-normal text-muted-foreground">
        J / K : suivante / précédente · A : accepter · R : rejeter
      </p>
    </article>
  );
}

/** Titre h3 d'une section du détail (« Critères d'acceptation »). */
export function ProposalDetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-subsection-title">{title}</h3>
      {children}
    </section>
  );
}

export interface ProposalCriterionProps {
  id: string;
  title: string;
  /** Lignes « Étant donné / Quand / Alors » : le libellé en gras, puis le texte. */
  steps: readonly { label: string; text: string }[];
}

/** Critère d'acceptation (maquette 10 l.145) : cadre rayon 10, identifiant mono, titre, étapes. */
export function ProposalCriterion({ id, title, steps }: ProposalCriterionProps) {
  return (
    <li className="flex flex-col gap-1 rounded-card border p-3 text-body">
      <span className="flex items-center gap-2">
        <span className="font-mono text-count font-normal text-muted-foreground">{id}</span>
        <span className="font-semibold">{title}</span>
      </span>
      {steps.map((step) => (
        <span key={step.label}>
          <strong className="font-semibold">{step.label}</strong> {step.text}
        </span>
      ))}
    </li>
  );
}

/** Liste de lignes à icône (« Permissions », « Étapes ») : cadre rayon 8, icône muted 18. */
export function ProposalDetailLines({
  lines,
  className,
}: {
  lines: readonly { icon: IconName; text: string }[];
  className?: string;
}) {
  return (
    <ul className={cn("m-0 flex list-none flex-col gap-1.5 p-0", className)}>
      {lines.map((line) => (
        <li
          key={`${line.icon}-${line.text}`}
          className="flex gap-2.5 rounded-lg border px-3 py-2 text-body"
        >
          <Icon name={line.icon} size={18} tone="muted" />
          <span>{line.text}</span>
        </li>
      ))}
    </ul>
  );
}
