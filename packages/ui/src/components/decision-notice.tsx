import type { ComponentProps, ReactNode } from "react";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { Button } from "./button.tsx";

export type DecisionNoticeProps = Omit<ComponentProps<"div">, "children" | "role"> & {
  children: ReactNode;
  /** Présent pendant le délai d'annulation (10 s) : affiche « Annuler ». */
  onUndo?: () => void;
};

/** Trace d'une décision sur une proposition (maquette 06) : `role=status`, icône `history`, Annuler. */
export function DecisionNotice({ children, onUndo, className, ...props }: DecisionNoticeProps) {
  return (
    <div
      role="status"
      data-slot="decision-notice"
      className={cn("flex items-center gap-2 text-meta text-muted-foreground", className)}
      {...props}
    >
      <Icon name="history" size={16} />
      <span>{children}</span>
      {onUndo ? (
        <Button variant="text" size="xs" onClick={onUndo}>
          Annuler
        </Button>
      ) : null}
    </div>
  );
}
