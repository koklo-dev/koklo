"use client";

import { InlineAlert, ValidationPrompt } from "@koklo/ui";
import { doneText } from "../lib/client-validation-labels.ts";
import type { Decision, useReviewActions } from "../lib/use-review-actions.ts";

export type ReviewActions = ReturnType<typeof useReviewActions>;
type Target = Pick<Decision, "targetKind" | "targetRef" | "version">;

interface DecisionBlockProps {
  variant: "bar" | "inline";
  /** Parcours : « Valider ce parcours » ; bloc : « Valider les règles ». */
  noun: "parcours" | "bloc";
  target: Target;
  validation: "validated" | "to_validate" | "to_revise";
  question: string;
  validateLabel: string;
  askLabel?: string;
  placeholder?: string;
  rows?: number;
  actions: ReviewActions;
}

/**
 * Décision sur un parcours ou un bloc (maquette 10 l.296-318, 320-328) : l'invite tant que rien n'est décidé, puis la
 * confirmation verte (validé) ou rouge (changement demandé) avec « Annuler », qui remet la cible « à valider ».
 */
export function DecisionBlock({
  variant,
  noun,
  target,
  validation,
  question,
  validateLabel,
  askLabel,
  placeholder,
  rows,
  actions,
}: DecisionBlockProps) {
  if (validation !== "to_validate") {
    const requested = validation === "to_revise";
    return (
      <InlineAlert
        variant={requested ? "revise" : "validated"}
        icon={requested ? "edit_note" : "check_circle"}
        action={{
          label: "Annuler",
          onClick: () => void actions.decide({ ...target, status: "withdrawn" }),
        }}
        className={variant === "bar" ? "mx-0 rounded-xl [&>div]:px-4 [&>div]:py-2" : "[&>div]:pr-3"}
      >
        {doneText(noun, requested)}
      </InlineAlert>
    );
  }
  return (
    <ValidationPrompt
      variant={variant}
      question={question}
      validateLabel={validateLabel}
      {...(askLabel ? { askLabel } : {})}
      {...(placeholder ? { placeholder } : {})}
      {...(rows ? { rows } : {})}
      pending={actions.pending}
      error={actions.errorFor(target.targetKind, target.targetRef)}
      onValidate={() => void actions.decide({ ...target, status: "approved" })}
      onRequestChange={(comment) =>
        void actions.decide({ ...target, status: "changes_requested", comment })
      }
    />
  );
}
