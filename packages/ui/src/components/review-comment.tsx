import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export interface ReviewCommentProps {
  /** Nom de la personne qui a demandé le changement. */
  name: string;
  /** Deux lettres au plus ; absentes, elles se déduisent du nom. */
  initials?: string;
  /** Texte de la demande, rendu tel quel (jamais interprété). */
  children: ReactNode;
  /** Mention après le nom (défaut « demande de changement »). */
  label?: string;
  className?: string;
}

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

/** Demande de changement du client sur une fiche (DESIGN.md §5.17, maquette 10 l.207) : pastille d'initiales, nom, texte. */
export function ReviewComment({
  name,
  initials,
  children,
  label = "demande de changement",
  className,
}: ReviewCommentProps) {
  return (
    <div
      data-slot="review-comment"
      className={cn(
        "flex gap-2.5 rounded-[10px] border border-border bg-surface px-3 py-2.5",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-status-pending text-[10px] font-semibold text-status-pending-foreground"
      >
        {initials ?? initialsOf(name)}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5 text-[13px]">
        <span className="font-semibold">
          {name} · {label}
        </span>
        <span className="whitespace-pre-line break-words">{children}</span>
      </div>
    </div>
  );
}
