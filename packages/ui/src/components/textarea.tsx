import type * as React from "react";
import { cn } from "../lib/cn.ts";
import { FIELD_BASE } from "./input.tsx";

/** Zone de saisie multiligne, mêmes jetons et mêmes états que `Input`. */
function Textarea({
  className,
  mono = false,
  ...props
}: React.ComponentProps<"textarea"> & {
  /** Police mono (texte de code ou de Markdown à relire tel quel). */
  mono?: boolean;
}) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        FIELD_BASE,
        "flex field-sizing-content min-h-16 py-2.5 leading-normal",
        mono && "font-mono text-meta",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
