import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { IconButton } from "./icon-button.tsx";
import { IdTag } from "./id-tag.tsx";

export interface FlowStep {
  label: string;
  /** Écran de l'étape (`S-…`). */
  screen?: string | undefined;
}

export interface FlowErrorCase {
  /** Numéro de l'étape en cause (1 : le point de départ). */
  step: number;
  text: string;
}

/**
 * Étapes d'un parcours (DESIGN.md §5.16, maquette 10 l.282-289) : un `ol` de cartes de 150 px reliées par des
 * flèches décoratives. L'étape 1 est le point de départ. Sous 768 px les étapes sont en colonne.
 */
export function FlowSteps({
  steps,
  className,
}: {
  steps: readonly FlowStep[];
  className?: string;
}) {
  return (
    <ol
      data-slot="flow-steps"
      aria-label="Étapes du parcours"
      className={cn(
        "m-0 flex list-none flex-col items-stretch gap-2 p-0 md:flex-row md:flex-wrap md:gap-y-2",
        className,
      )}
    >
      {steps.map((step, index) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: étapes ordonnées, deux étapes peuvent porter le même libellé
          key={`${index}-${step.label}`}
          className="flex flex-col items-start gap-1 md:flex-row md:items-center md:gap-0"
        >
          <span className="flex w-full flex-col gap-1 rounded-[10px] border border-border bg-surface px-3 py-2.5 md:w-[150px]">
            <span className="text-[11px] text-muted-foreground">Étape {index + 1}</span>
            <span className="text-meta font-semibold leading-[1.3]">{step.label}</span>
            {step.screen ? (
              <IdTag size="sm" className="self-start">
                {step.screen}
              </IdTag>
            ) : null}
          </span>
          {index < steps.length - 1 ? (
            <>
              <Icon
                name="arrow_forward"
                size={20}
                className="hidden text-muted-foreground md:block"
              />
              <Icon
                name="arrow_downward"
                size={20}
                className="self-center text-muted-foreground md:hidden"
              />
            </>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** Cas d'erreur d'un parcours : fond d'erreur clair, « Étape 4 : » en 600 (maquette 10 l.292, jetons d'alerte). */
export function FlowError({ step, text }: FlowErrorCase) {
  return (
    <span
      data-slot="flow-error"
      className="flex items-start gap-2 rounded-lg bg-alert-error px-2.5 py-2 text-meta text-alert-error-foreground"
    >
      <Icon name="subdirectory_arrow_right" size={18} />
      <span>
        <strong className="font-semibold">Étape {step} :</strong> {text}
      </span>
    </span>
  );
}

export interface FlowCardProps {
  id: string;
  title: string;
  actor: string;
  /** Point de départ puis étapes. */
  steps: readonly FlowStep[];
  errors?: readonly FlowErrorCase[];
  features?: readonly string[];
  selected?: boolean;
  /** Équipe qui écrit : icône « Modifier P-… ». */
  onEdit?: () => void;
  className?: string;
}

/** Carte d'un parcours (DESIGN.md §5.16) : identifiant, titre, acteur, fonctionnalités, étapes, cas d'erreur. */
export function FlowCard({
  id,
  title,
  actor,
  steps,
  errors = [],
  features = [],
  selected = false,
  onEdit,
  className,
}: FlowCardProps) {
  return (
    <section
      data-slot="flow-card"
      data-spec-id={id}
      aria-current={selected || undefined}
      aria-label={`${id} ${title}`}
      className={cn(
        "flex flex-col gap-3.5 rounded-xl border bg-background p-4",
        selected ? "border-primary" : "border-border",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <IdTag>{id}</IdTag>
          <h3 className="text-section-title">{title}</h3>
          <span className="text-meta text-muted-foreground">· {actor}</span>
        </div>
        {features.length > 0 ? (
          <span className="text-caption font-normal text-muted-foreground max-md:order-last max-md:basis-full">
            Fonctionnalités : {features.join(", ")}
          </span>
        ) : null}
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
      <FlowSteps steps={steps} />
      {errors.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {errors.map((error) => (
            <FlowError key={`${error.step}-${error.text}`} {...error} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
