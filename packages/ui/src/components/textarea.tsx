import type * as React from "react";
import { cn } from "../lib/cn.ts";
import { FIELD_BASE } from "./input.tsx";

/** Zone de saisie multiligne, mêmes jetons et mêmes états que `Input`. */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        FIELD_BASE,
        "flex field-sizing-content min-h-16 py-2.5 leading-normal",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
