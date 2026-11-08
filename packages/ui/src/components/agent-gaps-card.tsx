import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { Button } from "./button.tsx";

export type AgentGap = {
  id: string;
  /** Nom de la page concernée, en mono. */
  file?: string;
  text: string;
  /** `page` : une page existante (Explorer) ; `new-page` : une page à créer (Proposer une page). */
  kind: "page" | "new-page";
};

export const AGENT_GAPS_MAX = 4;

/** « Ce qui manque encore » (maquette 06) : 4 lignes au plus, une action par ligne ; rien s'il n'y a rien. */
export function AgentGapsCard({
  items,
  onAction,
  className,
}: {
  items: ReadonlyArray<AgentGap>;
  onAction: (gap: AgentGap) => void;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <section
      aria-label="Manques détectés"
      data-slot="agent-gaps-card"
      className={cn(
        "flex flex-col gap-2.5 rounded-[10px] border bg-background px-3.5 py-3",
        className,
      )}
    >
      <span className="text-meta font-semibold">Ce qui manque encore</span>
      {items.slice(0, AGENT_GAPS_MAX).map((gap) => (
        <div key={gap.id} className="flex items-center gap-2.5 text-meta">
          <Icon
            name="radio_button_unchecked"
            size={18}
            className="shrink-0 text-muted-foreground"
          />
          <span className="min-w-0 flex-1 break-words">
            {gap.file ? <span className="font-mono text-code">{gap.file}</span> : null}
            {gap.file ? " " : null}
            {gap.text}
          </span>
          <Button variant="outline" size="xs" onClick={() => onAction(gap)}>
            {gap.kind === "page" ? "Explorer" : "Proposer une page"}
          </Button>
        </div>
      ))}
    </section>
  );
}
