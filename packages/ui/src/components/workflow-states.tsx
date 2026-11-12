import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";

export interface WorkflowStatesProps {
  /** Noms des états dans l'ordre du fichier : le premier est l'état initial. */
  states: readonly string[];
  /** Nom accessible de la liste. */
  label?: string;
  className?: string;
}

/**
 * États d'un workflow (DESIGN.md §5.16, maquette 10 l.236) : une liste lue dans l'ordre, l'état initial plein
 * `--primary`, les états finaux en contour, une flèche décorative après l'état initial.
 */
export function WorkflowStates({
  states,
  label = "États de la règle",
  className,
}: WorkflowStatesProps) {
  return (
    <ul
      data-slot="workflow-states"
      aria-label={label}
      className={cn(
        "m-0 flex list-none flex-wrap items-center gap-1.5 p-0 text-caption font-normal",
        className,
      )}
    >
      {states.map((state, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: états ordonnés, le même nom peut revenir
        <li key={`${index}-${state}`} className="flex items-center gap-1.5">
          <span
            data-initial={index === 0 || undefined}
            className={cn(
              "rounded-md px-2 py-[3px]",
              index === 0 ? "bg-primary text-primary-foreground" : "border border-border",
            )}
          >
            {state}
          </span>
          {index === 0 && states.length > 1 ? (
            <Icon name="arrow_forward" size={16} className="text-muted-foreground" />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
