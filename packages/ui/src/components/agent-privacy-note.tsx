"use client";

import { type ComponentProps, type ReactNode, useId, useState } from "react";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";

export type AgentPrivacyNoteProps = Omit<ComponentProps<"div">, "role" | "children"> & {
  /** Ligne visible (12, atténuée) : à qui part le message. */
  children: ReactNode;
  /** Liste dépliée par « Détails » ; sans elle, pas de bouton. */
  details?: ReactNode;
};

/** Mention de confidentialité sous la saisie de l'agent (maquette 06, l.208) : ligne nue `role="note"`, `lock` 16, « Détails » 22 de haut. */
export function AgentPrivacyNote({
  children,
  details,
  className,
  ...props
}: AgentPrivacyNoteProps) {
  const [open, setOpen] = useState(false);
  const regionId = useId();
  return (
    <div
      role="note"
      data-slot="agent-privacy-note"
      className={cn(
        "flex flex-col gap-1.5 text-caption font-normal text-muted-foreground",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-1.5">
        <Icon name="lock" size={16} />
        <span className="flex-1">{children}</span>
        {details !== undefined ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={regionId}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex h-[22px] items-center rounded-sm px-1 font-semibold text-foreground underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Détails
          </button>
        ) : null}
      </div>
      {details !== undefined ? (
        <div id={regionId} hidden={!open}>
          {details}
        </div>
      ) : null}
    </div>
  );
}
