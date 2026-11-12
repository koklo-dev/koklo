import type { ReactNode } from "react";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";

export type ValidationBannerTone = "warning" | "neutral";

const TONE: Record<ValidationBannerTone, string> = {
  warning: "border-alert-warning-border bg-alert-warning text-alert-warning-foreground",
  neutral: "border-alert-neutral-border bg-alert-neutral text-alert-neutral-foreground",
};

export interface ValidationBannerProps {
  /** `warning` : la validation est attendue ; `neutral` : lecture seule (business, équipe avec client). */
  tone?: ValidationBannerTone;
  /** Première phrase, en 600 (« Votre validation est attendue. »). */
  title: string;
  /** Suite du texte. */
  children?: ReactNode;
  /** Progression à droite (« Fonctionnalités 12/248 · parcours 3/18 · règles et rôles 1/2 »), 13 px 600. */
  progress?: ReactNode;
  className?: string;
}

/**
 * Bandeau de la vue client (DESIGN.md §5.17, maquette 10 l.171-177) : `role=note` sous l'en-tête, icône
 * `fact_check` 20, texte 13, progression à droite. Les couleurs viennent des jetons d'alerte.
 */
export function ValidationBanner({
  tone = "warning",
  title,
  children,
  progress,
  className,
}: ValidationBannerProps) {
  return (
    <div
      role="note"
      data-slot="validation-banner"
      data-tone={tone}
      className={cn(
        "flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-[10px] border px-3.5 py-3 text-[13px]",
        TONE[tone],
        className,
      )}
    >
      <Icon name="fact_check" size={20} className="shrink-0" />
      <span className="min-w-0 flex-[1_1_300px]">
        <strong className="font-semibold">{title}</strong>
        {children ? <> {children}</> : null}
      </span>
      {progress ? <span className="font-semibold">{progress}</span> : null}
    </div>
  );
}
