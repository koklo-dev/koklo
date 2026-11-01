"use client";

import { Button, Icon } from "@koklo/ui";
import {
  addCriterion,
  criterionKey,
  moveCriterion,
  patchCriterion,
  removeAt,
} from "../lib/feature-criteria.ts";
import { ADD_CRITERION_ID, fieldId } from "../lib/feature-form-ids.ts";
import type { FeatureFormModel } from "../lib/use-feature-form.ts";
import { CriterionItem } from "./criterion-item.tsx";
import { messageOf } from "./feature-form-fields.tsx";

interface EditorProps {
  model: FeatureFormModel;
  readOnly: boolean;
  announce: (text: string) => void;
  /** Critères tels que lus, pour reconnaître un titre changé. */
  original: FeatureFormModel["state"]["baseline"];
}

/** Liste ordonnée des critères d'acceptation, envoyée en bloc (S-feature-form §3.3). */
export function CriteriaEditor({ model, readOnly, announce, original }: EditorProps) {
  const list = model.state.values.criteria;
  const set = (criteria: typeof list) => model.setValues({ criteria });
  const error = (field: string) => messageOf(model, field);
  const guard = (action: () => void) => () => {
    if (!readOnly) action();
  };
  return (
    <section aria-labelledby="feature-form-criteria-heading" className="flex flex-col gap-3">
      <h3
        id="feature-form-criteria-heading"
        className="text-[13px] font-semibold text-muted-foreground"
      >
        Critères d'acceptation
      </h3>
      {list.length > 0 ? (
        <ol className="flex flex-col gap-3">
          {list.map((criterion, index) => (
            <li key={criterionKey(criterion, index)}>
              <CriterionItem
                criterion={criterion}
                number={index + 1}
                count={list.length}
                original={original?.criteria ?? null}
                readOnly={readOnly}
                error={error}
                onBlur={() => model.blur("criteria")}
                onChange={(patch) => set(patchCriterion(list, index, patch))}
                onMove={(delta) => {
                  if (readOnly) return;
                  const target = index + 1 + delta;
                  set(moveCriterion(list, index, delta));
                  announce(`Critère ${index + 1} déplacé en position ${target}.`);
                  model.focusId(fieldId(`criteria.${target}.${delta < 0 ? "up" : "down"}`));
                }}
                onRemove={guard(() => {
                  set(removeAt(list, index));
                  model.focusId(index > 0 ? fieldId(`criteria.${index}.remove`) : ADD_CRITERION_ID);
                })}
                onFocus={(id) => model.focusId(id)}
              />
            </li>
          ))}
        </ol>
      ) : null}
      <p className="text-[13px] text-muted-foreground">
        Changer le titre d'un critère le remplace par un nouveau critère. Les identifiants ne sont
        jamais réutilisés : les scénarios de test qui citaient l'ancien devront être mis à jour.
      </p>
      <Button
        id={ADD_CRITERION_ID}
        type="button"
        variant="outline"
        className="h-11 w-full md:h-9 md:w-auto md:self-start"
        onClick={guard(() => {
          set(addCriterion(list));
          announce(`Critère ${list.length + 1} ajouté.`);
          model.focusId(fieldId(`criteria.${list.length + 1}.title`));
        })}
      >
        <Icon name="add" size={16} />
        Ajouter un critère
      </Button>
    </section>
  );
}
