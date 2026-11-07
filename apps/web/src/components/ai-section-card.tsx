import { cn } from "@koklo/ui";
import type { ReactNode } from "react";

/** Carte bordée d'une section de l'écran (maquette 24) : titre h3, sous-titre, action à droite, corps. */
export function AiSectionCard({
  title,
  subtitle,
  action,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cn("flex flex-col gap-3 rounded-lg border bg-card p-4 md:p-5", className)}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 basis-72 flex-col gap-0.5">
          <h3 className="text-subsection-title">{title}</h3>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
