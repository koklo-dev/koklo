import type { IconName } from "../icons/icon.tsx";
import { Pill, type PillProps } from "./pill.tsx";

export type TicketStatusValue = "todo" | "in_progress" | "in_review" | "done";

const TICKET: Record<
  TicketStatusValue,
  { label: string; icon: IconName; tone: NonNullable<PillProps["tone"]> }
> = {
  in_review: { label: "En revue", icon: "rate_review", tone: "warning" },
  in_progress: { label: "En cours", icon: "edit", tone: "neutral" },
  done: { label: "Terminé", icon: "check_circle", tone: "success" },
  todo: { label: "À faire", icon: "radio_button_unchecked", tone: "neutral" },
};

/** Statut d'un ticket dans une liste (DESIGN.md §5.11, maquette 07 l.161) : `Pill md`, icône et libellé. */
export function TicketStatus({
  status,
  agent = false,
  className,
}: {
  status: TicketStatusValue;
  /** Ticket confié à l'agent : `smart_toy` à la place de `edit` en cours. */
  agent?: boolean;
  className?: string;
}) {
  const { label, icon, tone } = TICKET[status];
  return (
    <Pill
      data-status={status}
      tone={tone}
      iconFill={tone !== "neutral"}
      icon={status === "in_progress" && agent ? "smart_toy" : icon}
      {...(className ? { className } : {})}
    >
      {label}
    </Pill>
  );
}
