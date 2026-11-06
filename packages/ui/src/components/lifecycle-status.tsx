import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn.ts";
import { STATUS_PILL, STATUS_TONE } from "./status-pill.ts";

export type LifecycleStage = 0 | 1 | 2 | 3 | 4 | 5;

const STAGES = ["Idée", "Spécifiée", "Conçue", "Implémentée", "Testée", "Livrée"] as const;
const NOTCHES = [0, 1, 2, 3, 4, 5] as const;

export interface LifecycleStatusProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  stage: LifecycleStage;
}

/**
 * Cycle de vie calculé d'une fonctionnalité (DESIGN.md v2 §5.1) : jauge de 6 crans puis libellé. Le nom
 * « Avancement : Conçue, étape 3 sur 6 » contient le libellé visible ; `role="img"` le rend fiable, un
 * `aria-label` sur un `span` générique étant ignoré par plusieurs lecteurs d'écran.
 */
export function LifecycleStatus({ stage, className, ...props }: LifecycleStatusProps) {
  const label = STAGES[stage];
  return (
    <span
      data-slot="lifecycle-status"
      role="img"
      aria-label={`Avancement : ${label}, étape ${stage + 1} sur 6`}
      className={cn(
        STATUS_PILL,
        "gap-1.5",
        STATUS_TONE[stage === 5 ? "validated" : "neutral"],
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="inline-flex gap-0.5">
        {NOTCHES.map((n) => (
          <span
            key={n}
            data-active={n <= stage ? "true" : "false"}
            className={cn("size-[5px] rounded-[2px] bg-current", n > stage && "opacity-22")}
          />
        ))}
      </span>
      {label}
    </span>
  );
}
