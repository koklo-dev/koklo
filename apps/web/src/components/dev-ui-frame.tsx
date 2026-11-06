import { cn } from "@koklo/ui";
import type { ReactNode } from "react";

/** Section numérotée comme la planche 04 : h2 nommant la région, puis des cadres. */
export function DevUiSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="text-section-title">
        {title}
      </h2>
      <div className="grid gap-6 md:grid-cols-[repeat(auto-fit,minmax(340px,1fr))]">{children}</div>
    </section>
  );
}

/** Cadre titré en h3 (`--background`, bordure, rayon 12, marges 20 px). */
export function DevUiFrame({
  title,
  wide = false,
  children,
}: {
  title: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-xl border bg-background p-5",
        wide && "md:col-span-full",
      )}
    >
      <h3 className="text-subsection-title">{title}</h3>
      {children}
    </div>
  );
}

/** Ligne d'exemples qui passe à la ligne à 375 px. */
export function DevUiRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

/** Sous-titre d'un groupe d'exemples dans un cadre. */
export function DevUiNote({ children }: { children: ReactNode }) {
  return <p className="text-meta text-muted-foreground">{children}</p>;
}
