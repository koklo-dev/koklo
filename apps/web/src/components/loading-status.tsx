import { cn } from "@koklo/ui";
import type { ComponentProps } from "react";

interface LoadingStatusProps extends ComponentProps<"div"> {
  label: string;
  /** Nombre de lignes d'attente (squelettes) sous le libellé. */
  rows?: number;
  rowClassName?: string;
}

/** État de chargement annoncé (`role=status`) : libellé + squelettes qui ne pulsent que si le mouvement est permis. */
export function LoadingStatus({
  label,
  rows = 3,
  rowClassName = "h-10",
  className,
  ...props
}: LoadingStatusProps) {
  return (
    <div role="status" aria-busy="true" className={cn("flex flex-col gap-3", className)} {...props}>
      <p className="text-[13px] text-muted-foreground">{label}</p>
      {Array.from({ length: rows }, (_, row) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: squelettes statiques, sans identité
          key={row}
          className={cn("rounded-md bg-muted motion-safe:animate-pulse", rowClassName)}
        />
      ))}
    </div>
  );
}
