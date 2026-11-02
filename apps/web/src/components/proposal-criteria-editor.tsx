import { Button, Icon } from "@koklo/ui";
import {
  addCriterion,
  criterionKey,
  moveCriterion,
  patchCriterion,
  removeAt,
} from "../lib/feature-criteria.ts";
import type { CriterionValue } from "../lib/feature-form.ts";
import { proposalFieldId } from "../lib/framing-ids.ts";
import { ORDER_WARNING, stepOrderBroken } from "../lib/framing-validation.ts";
import { CriterionItem } from "./criterion-item.tsx";

interface Props {
  proposalId: string;
  criteria: CriterionValue[];
  onChange: (criteria: CriterionValue[]) => void;
  /** Message d'erreur d'un champ (`criteria.2.title`), ou `undefined`. */
  error: (field: string) => string | undefined;
  /** Annonce dans la région d'état (déplacement, ajout). */
  announce: (text: string) => void;
}

const focusById = (id: string): void => document.getElementById(id)?.focus();

/** Éditeur de critères d'une proposition : l'éditeur du formulaire de fonctionnalité, piloté par la carte. */
export function ProposalCriteriaEditor({ proposalId, criteria, onChange, error, announce }: Props) {
  const idOf = (field: string): string => proposalFieldId(proposalId, field);
  return (
    <section className="flex flex-col gap-3" aria-label="Critères d'acceptation">
      <h4 className="text-[13px] font-semibold text-muted-foreground">Critères d'acceptation</h4>
      <ol className="flex flex-col gap-3">
        {criteria.map((criterion, index) => (
          <li key={criterionKey(criterion, index)} className="flex flex-col gap-2">
            <CriterionItem
              named
              idOf={idOf}
              criterion={criterion}
              number={index + 1}
              count={criteria.length}
              original={null}
              readOnly={false}
              error={error}
              onBlur={() => undefined}
              onChange={(patch) => onChange(patchCriterion(criteria, index, patch))}
              onMove={(delta) => {
                onChange(moveCriterion(criteria, index, delta));
                announce(`Critère ${index + 1} déplacé en position ${index + 1 + delta}.`);
              }}
              onRemove={() => {
                onChange(removeAt(criteria, index));
                focusById(index > 0 ? idOf(`criteria.${index}.remove`) : idOf("criteria.add"));
              }}
              onFocus={focusById}
            />
            {stepOrderBroken(criterion.steps) ? (
              <p className="flex items-start gap-1 text-[13px] text-muted-foreground">
                <Icon name="warning" size={16} className="mt-0.5" />
                <span>{ORDER_WARNING}</span>
              </p>
            ) : null}
          </li>
        ))}
      </ol>
      <Button
        id={idOf("criteria.add")}
        type="button"
        variant="outline"
        className="h-11 w-full md:h-9 md:w-auto md:self-start"
        onClick={() => {
          onChange(addCriterion(criteria));
          announce(`Critère ${criteria.length + 1} ajouté.`);
        }}
      >
        <Icon name="add" size={16} />
        Ajouter un critère
      </Button>
    </section>
  );
}
