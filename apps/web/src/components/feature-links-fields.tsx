"use client";

import { Field, FieldDescription, FieldError, FieldLabel, TagInput } from "@koklo/ui";
import { isLinkField, LINK_FIELDS } from "../lib/feature-form.ts";
import { fieldId } from "../lib/feature-form-ids.ts";
import { linkTags, patchForTags, validateTag } from "../lib/feature-links.ts";
import type { FeatureFormModel } from "../lib/use-feature-form.ts";
import { useRefsSearch } from "../lib/use-refs-search.ts";
import { CurrentValue } from "./feature-form-fields.tsx";

const DESIGNER_HELP =
  "En tant que designer, vous pouvez enregistrer une fonctionnalité seulement si elle est liée à au moins un écran.";

interface LinksProps {
  projectId: string;
  model: FeatureFormModel;
  readOnly: boolean;
  designer: boolean;
  agentFilled: boolean;
}

/**
 * « Liens » : une seule saisie à puces ; le préfixe de chaque identifiant le range dans l'une des six listes du
 * schéma (S-, RL-, R-, T-, E-, NFR-). Autocomplétion par `spec.refs.search` (anti-rebond 200 ms).
 */
export function LinksField({ projectId, model, readOnly, designer, agentFilled }: LinksProps) {
  const { values } = model.state;
  const search = useRefsSearch(projectId);
  const id = fieldId("screens");
  const hintId = `${id}-hint`;
  const message = model.issues
    .filter((issue) => isLinkField(issue.field))
    .map((issue) => issue.message)
    .join(" ");
  const invalid = Boolean(message) || model.state.serverFields.some(isLinkField);
  const tags = linkTags(values);
  return (
    <Field agentFilled={agentFilled && tags.length > 0} className="gap-1.5">
      <FieldLabel htmlFor={id}>Liens</FieldLabel>
      <TagInput
        id={id}
        label="Liens"
        value={tags}
        disabled={readOnly}
        invalid={invalid}
        aria-describedby={[message ? `${id}-error` : null, hintId].filter(Boolean).join(" ")}
        suggestions={search.suggestions}
        onQueryChange={search.onQueryChange}
        validate={validateTag}
        onChange={(next) => model.setValues(patchForTags(values, next))}
      />
      {message ? <FieldError id={`${id}-error`}>{message}</FieldError> : null}
      <FieldDescription id={hintId}>
        Règles, rôles, écrans, parcours.
        {designer ? ` ${DESIGNER_HELP}` : ""}
      </FieldDescription>
      {LINK_FIELDS.map((field) => (
        <CurrentValue key={field} field={field} model={model} />
      ))}
    </Field>
  );
}
