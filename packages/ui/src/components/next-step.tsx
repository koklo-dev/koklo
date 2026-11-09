import type { ComponentProps, ReactNode } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import type { ShellLink } from "./app-shell.tsx";
import { buttonVariants } from "./button.tsx";

export type NextStepTone = "warning" | "neutral";

const TONE: Record<NextStepTone, { box: string; tile: string }> = {
  warning: {
    box: "border-alert-warning-border bg-alert-warning text-alert-warning-foreground",
    tile: "bg-status-pending text-status-pending-foreground",
  },
  neutral: {
    box: "border-alert-neutral-border bg-alert-neutral text-alert-neutral-foreground",
    tile: "bg-secondary text-secondary-foreground",
  },
};

export type NextStepAction =
  | { label: string; href: string; LinkComponent?: ShellLink }
  | { label: string; onClick: () => void };

export type NextStepProps = Omit<ComponentProps<"section">, "title" | "children"> & {
  tone?: NextStepTone;
  title: string;
  /** Une phrase ; vide, la ligne est absente. */
  body?: string;
  icon?: IconName;
  /** Lien ou bouton ; absent (ton `neutral`), aucun bouton. */
  action?: NextStepAction;
  /** Nom de la région (« Prochaine étape » par défaut). */
  label?: ReactNode;
};

const BUTTON = cn(
  buttonVariants({ variant: "outline" }),
  "h-11 w-full border-current bg-transparent font-semibold text-current hover:bg-transparent hover:text-current md:h-9 md:w-auto",
);

function StepAction({ action }: { action: NextStepAction }) {
  if ("href" in action) {
    const Link = action.LinkComponent ?? ("a" as unknown as ShellLink);
    return (
      <Link href={action.href} className={BUTTON}>
        {action.label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={BUTTON}>
      {action.label}
    </button>
  );
}

/**
 * Carte « Prochaine étape » (DESIGN.md §5.11, maquette 07 l.103-111) : tuile 40, surtitre, titre, phrase, une seule
 * action à droite (pleine largeur sous 768 px). `role="note"` : un repère, pas une alerte annoncée.
 */
export function NextStep({
  tone = "warning",
  title,
  body,
  icon,
  action,
  className,
  ...props
}: NextStepProps) {
  const look = TONE[tone];
  return (
    <section
      data-slot="next-step"
      data-tone={tone}
      role="note"
      aria-label="Prochaine étape"
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border px-[18px] py-4",
        look.box,
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-[10px]",
          look.tile,
        )}
      >
        <Icon name={icon ?? (tone === "warning" ? "schedule" : "check_circle")} size={22} />
      </span>
      <div className="flex min-w-[min(100%,300px)] flex-1 flex-col gap-0.5">
        <span className="text-caption font-semibold uppercase tracking-[0.04em]">
          Prochaine étape
        </span>
        <span className="text-card-title">{title}</span>
        {body ? <span className="text-meta">{body}</span> : null}
      </div>
      {action ? <StepAction action={action} /> : null}
    </section>
  );
}
