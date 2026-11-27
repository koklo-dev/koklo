import { type ReactNode, useId } from "react";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";

/**
 * Ce que l'équipe attend du client (DESIGN.md §5.28, maquette 15 l.211) : ambre tant que c'est attendu, bordée ensuite,
 * avec une action facultative.
 */
export function ExpectationBox({
  pending = false,
  title,
  action,
  children,
}: {
  pending?: boolean;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      data-slot="expectation-box"
      data-pending={pending || undefined}
      className={cn(
        "flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-xl border px-4 py-3.5",
        pending
          ? "border-alert-warning-border bg-alert-warning text-alert-warning-foreground"
          : "border-border",
      )}
    >
      <Icon name="contact_phone" size={20} className="shrink-0" />
      <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-0.5 max-md:flex-[1_1_220px]">
        <h2 id={id} className="m-0 text-subsection-title">
          {title}
        </h2>
        <div className="break-words text-meta leading-normal">{children}</div>
      </div>
      {action}
    </section>
  );
}
