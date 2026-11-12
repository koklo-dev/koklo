import type { ReactNode } from "react";
import type { IconName } from "../icons/icon.tsx";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { IconButton } from "./icon-button.tsx";
import { IdTag } from "./id-tag.tsx";
import { Pill, pillVariants } from "./pill.tsx";
import { WorkflowStates } from "./workflow-states.tsx";

export type RuleType = "contrainte" | "calcul" | "workflow";

/** Types de règle : libellé et icône de la légende et de la pastille (maquette 10 l.581). */
export const RULE_TYPES: Record<RuleType, { label: string; icon: IconName }> = {
  contrainte: { label: "Contrainte", icon: "block" },
  calcul: { label: "Calcul", icon: "calculate" },
  workflow: { label: "Workflow à états", icon: "account_tree" },
};

export interface RuleCardProps {
  id: string;
  title: string;
  type: RuleType;
  statement: string;
  example?: string | undefined;
  /** États d'un workflow : le premier est l'état initial. */
  states?: readonly string[];
  /** Fonctionnalités qui appliquent la règle. */
  features?: readonly string[];
  /** Carte choisie (`?sel=`) : bordure `--primary`. */
  selected?: boolean;
  /** Équipe qui écrit : icône « Modifier R-nnn ». */
  onEdit?: () => void;
  className?: string;
}

/** Bloc libellé 12/600 puis valeur 13 (« Exemple »). */
function Example({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption font-semibold text-muted-foreground">Exemple</span>
      <span className="text-meta">{children}</span>
    </div>
  );
}

/**
 * Carte d'une règle métier (DESIGN.md §5.16, maquette 10 l.231-241) : identifiant, titre, type en pastille, énoncé
 * encadré, états du workflow, exemple et fonctionnalités qui l'appliquent.
 */
export function RuleCard({
  id,
  title,
  type,
  statement,
  example,
  states = [],
  features = [],
  selected = false,
  onEdit,
  className,
}: RuleCardProps) {
  const kind = RULE_TYPES[type];
  return (
    <article
      data-slot="rule-card"
      data-spec-id={id}
      aria-current={selected || undefined}
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border bg-background p-4",
        selected ? "border-primary" : "border-border",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <IdTag>{id}</IdTag>
        <h3 className="min-w-0 flex-1 text-card-title font-semibold">{title}</h3>
        <Pill tone="soft" icon={kind.icon} iconFill={false}>
          {kind.label}
        </Pill>
        {onEdit ? (
          <IconButton
            icon="edit"
            size="sm"
            aria-label={`Modifier ${id}`}
            className="size-7 max-md:size-11"
            onClick={onEdit}
          />
        ) : null}
      </div>
      <p className="m-0 rounded-lg bg-surface px-3 py-2.5 text-body leading-[1.55]">{statement}</p>
      {type === "workflow" && states.length > 0 ? <WorkflowStates states={states} /> : null}
      {example ? <Example>{example}</Example> : null}
      {features.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-caption font-normal text-muted-foreground">
          Appliquée par
          {features.map((feature) => (
            <IdTag key={feature}>{feature}</IdTag>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export interface RuleTypeLegendProps {
  /** Type filtré ; absent : tous les types. */
  value: RuleType | undefined;
  /** Un second appui sur le type actif retire le filtre (`undefined`). */
  onChange: (value: RuleType | undefined) => void;
  className?: string;
}

/**
 * Légende des types de règle (maquette 10 l.226) : trois pastilles à contour qui sont aussi des boutons
 * `aria-pressed` filtrant la liste (DESIGN.md §5.16) ; la pastille active a la bordure `--primary` et le fond `--secondary`.
 */
export function RuleTypeLegend({ value, onChange, className }: RuleTypeLegendProps) {
  return (
    <fieldset
      data-slot="rule-type-legend"
      className={cn("m-0 flex min-w-0 flex-wrap items-center gap-2 border-0 p-0", className)}
    >
      <legend className="sr-only">Filtrer par type de règle</legend>
      {(Object.keys(RULE_TYPES) as RuleType[]).map((type) => {
        const pressed = value === type;
        return (
          <button
            key={type}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(pressed ? undefined : type)}
            className={cn(
              pillVariants({ size: "md", tone: "outline" }),
              "gap-1.5 pl-1.5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:h-11 max-md:px-3",
              pressed && "border-primary bg-secondary",
            )}
          >
            <Icon name={RULE_TYPES[type].icon} size={16} />
            {RULE_TYPES[type].label}
          </button>
        );
      })}
    </fieldset>
  );
}
