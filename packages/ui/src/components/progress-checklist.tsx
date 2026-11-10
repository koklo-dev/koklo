import type { ComponentProps } from "react";
import { primeIcon } from "../icons/cache.ts";
import * as checkCircle from "../icons/generated/check_circle.ts";
import * as errorIcon from "../icons/generated/error.ts";
import * as radio from "../icons/generated/radio_button_unchecked.ts";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { Spinner } from "./spinner.tsx";

// La liste de création est visible dès l'ouverture de la carte : ses icônes sont rendues sans attente.
primeIcon("check_circle", checkCircle);
primeIcon("error", errorIcon);
primeIcon("radio_button_unchecked", radio);

export type ProgressStepStatus = "done" | "running" | "todo" | "error";

export interface ProgressStep {
  key: string;
  label: string;
  status: ProgressStepStatus;
  /** Phrase sous une étape en échec. */
  detail?: string;
}

const STATE_TEXT: Record<ProgressStepStatus, string> = {
  done: "terminé",
  running: "en cours",
  todo: "à faire",
  error: "en échec",
};

function StepIcon({ status }: { status: ProgressStepStatus }) {
  if (status === "running") return <Spinner size={18} />;
  if (status === "done") return <Icon name="check_circle" size={18} fill tone="success" />;
  if (status === "error") return <Icon name="error" size={18} fill tone="danger" />;
  return <Icon name="radio_button_unchecked" size={18} tone="muted" />;
}

export type ProgressChecklistProps = Omit<ComponentProps<"ul">, "children"> & {
  items: readonly ProgressStep[];
  /** Vrai (défaut) : la liste est une région `status` ; faux quand un parent l'est déjà. */
  announce?: boolean;
};

/**
 * Liste d'avancement d'une création (DESIGN.md §5.12, maquette 08 l.88-92) : lignes 13/écart 8, icône + texte
 * (jamais la couleur seule), libellé muted tant que l'étape n'est pas faite.
 */
export function ProgressChecklist({
  items,
  announce = true,
  className,
  ...props
}: ProgressChecklistProps) {
  return (
    <ul
      data-slot="progress-checklist"
      {...(announce ? { role: "status" } : {})}
      className={cn("m-0 flex list-none flex-col gap-2 p-0 text-meta", className)}
      {...props}
    >
      {items.map((step) => (
        <li
          key={step.key}
          data-status={step.status}
          className={cn(
            "flex flex-col gap-0.5",
            step.status === "done" && "text-foreground",
            step.status === "error"
              ? "text-destructive"
              : step.status !== "done" && "text-muted-foreground",
          )}
        >
          <span className="flex items-center gap-2">
            <StepIcon status={step.status} />
            <span>{step.label}</span>
            <span className="sr-only"> ({STATE_TEXT[step.status]})</span>
          </span>
          {step.detail ? <span className="pl-[26px]">{step.detail}</span> : null}
        </li>
      ))}
    </ul>
  );
}
