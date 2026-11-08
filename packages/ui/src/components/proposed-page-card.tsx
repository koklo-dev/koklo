"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { Button } from "./button.tsx";

export type ProposedPageCardProps = {
  title: string;
  rationale: string;
  onAccept: () => void;
  onIgnore: () => void;
  busy?: boolean;
  className?: string;
};

/** Page proposée par l'agent, dans l'arborescence (maquette 06 l.88-98) : cadre pointillé, décision humaine. */
export function ProposedPageCard({
  title,
  rationale,
  onAccept,
  onIgnore,
  busy = false,
  className,
}: ProposedPageCardProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: groupe nommé sans légende de formulaire (fieldset inadapté)
    <div
      role="group"
      aria-label="Page proposée par l'agent"
      data-slot="proposed-page-card"
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border border-primary border-dashed bg-diff-bg py-3 pr-3 pl-3.5",
        className,
      )}
    >
      <span className="flex items-center gap-2 text-meta">
        <Icon name="wand_stars" size={18} className="shrink-0 text-primary" />
        <span className="font-semibold">{title}</span>
      </span>
      <span className="text-caption font-normal text-muted-foreground">{rationale}</span>
      <span className="flex gap-1.5">
        <Button size="xs" loading={busy} onClick={onAccept}>
          Ajouter la page
        </Button>
        <Button variant="ghost" size="xs" disabled={busy} onClick={onIgnore}>
          Ignorer
        </Button>
      </span>
    </div>
  );
}

export type ProposedPageItem = { id: string; title: string; rationale: string };

/** Trois cartes visibles, le reste derrière « N autres » (fiche TK-90 §5). */
export function ProposedPageList({
  items,
  onAccept,
  onIgnore,
  visible = 3,
  busyId,
}: {
  items: ReadonlyArray<ProposedPageItem>;
  onAccept: (id: string) => void;
  onIgnore: (id: string) => void;
  visible?: number;
  busyId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  // « N autres » laisse la place aux cartes : le focus passe à la première carte révélée (WCAG 2.4.3).
  useEffect(() => {
    if (!open) return;
    const cards = list.current?.querySelectorAll("[data-slot='proposed-page-card']");
    cards?.[visible]?.querySelector("button")?.focus();
  }, [open, visible]);
  const shown = open ? items : items.slice(0, visible);
  const hidden = items.length - shown.length;
  return (
    <div ref={list} className="flex flex-col gap-2.5">
      {shown.map((item) => (
        <ProposedPageCard
          key={item.id}
          title={item.title}
          rationale={item.rationale}
          busy={busyId === item.id}
          onAccept={() => onAccept(item.id)}
          onIgnore={() => onIgnore(item.id)}
        />
      ))}
      {hidden > 0 ? (
        <Button variant="text" size="xs" aria-expanded={false} onClick={() => setOpen(true)}>
          {hidden === 1 ? "1 autre" : `${hidden} autres`}
        </Button>
      ) : null}
    </div>
  );
}
