import type { ReactNode } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";

/**
 * Bandeau de contexte (DESIGN.md §5.28, maquette 15 l.160, 206) : icône, phrase (base 420) puis actions de 32, sur
 * `--surface` bordé. Une `note` : il décrit, sans rien annoncer.
 */
export function ContextBanner({
  icon,
  actions,
  variant = "surface",
  children,
  className,
}: {
  icon: IconName;
  actions?: ReactNode;
  /** `outline` : cadre sans fond et texte muet (vérification d'une fiche, maquette 15 l.148). */
  variant?: "surface" | "outline";
  children: ReactNode;
  className?: string;
}) {
  const outline = variant === "outline";
  return (
    <div
      role="note"
      data-slot="context-banner"
      data-variant={variant}
      className={cn(
        "flex flex-wrap gap-y-2.5 rounded-[10px] border border-border text-meta leading-normal",
        outline
          ? "items-start gap-x-2 px-3 py-2.5 text-muted-foreground"
          : "items-center gap-x-3.5 bg-surface px-3.5 py-3",
        className,
      )}
    >
      <Icon name={icon} size={18} className="shrink-0" />
      <span
        className={cn(
          "min-w-0 break-words",
          outline ? "flex-1" : "flex-[1_1_420px] max-md:flex-[1_1_220px]",
        )}
      >
        {children}
      </span>
      {actions ? <span className="flex flex-wrap items-center gap-2">{actions}</span> : null}
    </div>
  );
}

/** Texte à intitulé sur `--surface` (« Ce qui peut arriver », maquette 15 l.142). */
export function LabeledNote({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      data-slot="labeled-note"
      className="flex flex-col gap-0.5 rounded-[10px] bg-surface px-3 py-2.5"
    >
      <span className="text-caption font-normal text-muted-foreground">{label}</span>
      <span className="whitespace-pre-line break-words text-meta leading-normal">{children}</span>
    </div>
  );
}
