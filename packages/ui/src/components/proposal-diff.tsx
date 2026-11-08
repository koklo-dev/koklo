"use client";

import { type KeyboardEvent, type ReactNode, useId } from "react";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { Button } from "./button.tsx";
import { IconButton } from "./icon-button.tsx";

export type ProposalOp = "insert_after" | "replace" | "append";

const OP_LABEL: Record<ProposalOp, string> = {
  insert_after: "ajout d'une section",
  replace: "remplacement",
  append: "ajout",
};

export type ProposalPosition = {
  index: number;
  total: number;
  onNavigate: (index: number) => void;
};

export type ProposalDiffProps = {
  op: ProposalOp;
  rationale: string;
  /** Texte proposé, ou le champ de modification quand l'humain a cliqué « Modifier ». */
  children: ReactNode;
  /** Remplacement : l'ancien texte, barré. */
  previous?: ReactNode;
  onAccept: () => void;
  onEdit?: () => void;
  onReject: () => void;
  position?: ProposalPosition;
  /** La page a changé depuis la proposition : barrée, plus d'Accepter. */
  stale?: boolean;
  onAskAgain?: () => void;
  busy?: boolean;
  className?: string;
};

/** Champ de saisie, ou zone éditable la plus proche (un cadre `contenteditable=false` posé dans l'éditeur n'en est pas une). */
const isTyping = (target: EventTarget): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest("input, textarea, select")) return true;
  const zone = target.closest("[contenteditable]");
  return zone !== null && zone.getAttribute("contenteditable") !== "false";
};

/** A et R : actifs seulement avec le focus dans le cadre et hors champ de saisie (WCAG 2.1.4, B226). */
function shortcuts(accept: () => void, reject: () => void, enabled: boolean) {
  return (event: KeyboardEvent) => {
    if (!enabled || event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target))
      return;
    const key = event.key.toLowerCase();
    if (key === "a") accept();
    else if (key === "r") reject();
  };
}

function Navigation({ index, total, onNavigate }: ProposalPosition) {
  return (
    <span className="flex items-center gap-1 text-caption text-muted-foreground">
      <IconButton
        variant="ghost"
        icon="chevron_left"
        aria-label="Proposition précédente"
        disabled={index <= 0}
        onClick={() => onNavigate(index - 1)}
      />
      <span>{`Proposition ${index + 1} sur ${total}`}</span>
      <IconButton
        variant="ghost"
        icon="chevron_right"
        aria-label="Proposition suivante"
        disabled={index >= total - 1}
        onClick={() => onNavigate(index + 1)}
      />
    </span>
  );
}

/** Proposition de l'agent sur place (maquette 06, DESIGN.md §5.9) : jamais appliquée sans décision humaine. */
export function ProposalDiff({
  op,
  rationale,
  children,
  previous,
  onAccept,
  onEdit,
  onReject,
  position,
  stale = false,
  onAskAgain,
  busy = false,
  className,
}: ProposalDiffProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      data-slot="proposal-diff"
      tabIndex={-1}
      onKeyDown={shortcuts(onAccept, onReject, !stale && !busy)}
      className={cn(
        "flex flex-col rounded-xl border border-primary border-dashed bg-diff-bg text-foreground",
        className,
      )}
    >
      <span id={titleId} className="sr-only">
        Proposition de l'agent
      </span>
      <div className="flex flex-wrap items-center gap-2 border-b border-dashed px-3.5 py-2.5">
        <Icon name="wand_stars" size={18} className="text-primary" />
        <span className="min-w-fit flex-1 text-meta font-semibold">
          {`Proposition de l'agent · ${OP_LABEL[op]}`}
        </span>
        <span className="text-caption font-normal text-muted-foreground">{rationale}</span>
        {position ? <Navigation {...position} /> : null}
      </div>
      {previous ? (
        <div
          data-slot="proposal-previous"
          className="border-b border-dashed px-[18px] py-3.5 text-muted-foreground line-through"
        >
          <span className="sr-only">Texte remplacé</span>
          {previous}
        </div>
      ) : null}
      <div
        data-slot="proposal-body"
        className={cn("px-[18px] py-3.5", stale && "text-muted-foreground line-through")}
      >
        {children}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-dashed px-3.5 py-2.5">
        {stale ? (
          <>
            <span className="flex-1 text-meta text-muted-foreground">
              Le texte a changé depuis cette proposition.
            </span>
            {onAskAgain ? (
              <Button variant="outline" size="sm" onClick={onAskAgain}>
                Redemander à l'agent
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={onReject}>
              Rejeter
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" icon="check" shortcut="A" loading={busy} onClick={onAccept}>
              Accepter
            </Button>
            {onEdit ? (
              <Button variant="outline" size="sm" disabled={busy} onClick={onEdit}>
                Modifier
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" shortcut="R" disabled={busy} onClick={onReject}>
              Rejeter
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
