import { featurePrioritySchema } from "@koklo/contract";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@koklo/ui";
import type { FormIssue } from "../lib/feature-form.ts";
import { priorityLabel } from "../lib/feature-labels.ts";
import { proposalFieldId } from "../lib/framing-ids.ts";
import type { EditValues } from "../lib/framing-validation.ts";
import { FieldMessage } from "./feature-form-fields.tsx";
import { ProposalCriteriaEditor } from "./proposal-criteria-editor.tsx";
import { ProposalIssues } from "./proposal-issues.tsx";

interface Props {
  proposalId: string;
  values: EditValues;
  onChange: (values: EditValues) => void;
  /** Erreurs à montrer (après une tentative d'acceptation). */
  issues: FormIssue[];
  onFinish: () => void;
  onCancel: () => void;
  announce: (text: string) => void;
}

const PRIORITIES = featurePrioritySchema.options;

/** Édition sur place d'une proposition (S-framing §3.5) : titre, priorité, description et critères seulement. */
export function ProposalEditor(props: Props) {
  const { proposalId, values, onChange, issues, onFinish, onCancel, announce } = props;
  const idOf = (field: string): string => proposalFieldId(proposalId, field);
  const error = (field: string): string | undefined =>
    issues.find((issue) => issue.field === field)?.message;
  const titleError = error("title");
  const descriptionError = error("description");
  return (
    <div className="flex flex-col gap-4">
      <ProposalIssues proposalId={proposalId} issues={issues} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={idOf("title")}>Titre</Label>
        <Input
          id={idOf("title")}
          className="h-11 md:h-9"
          value={values.title}
          aria-required="true"
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? `${idOf("title")}-error` : undefined}
          onChange={(event) => onChange({ ...values, title: event.target.value })}
        />
        {titleError ? <FieldMessage id={`${idOf("title")}-error`} text={titleError} /> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={idOf("priority")}>Priorité</Label>
        <Select
          value={values.priority}
          onValueChange={(priority) =>
            onChange({ ...values, priority: priority as EditValues["priority"] })
          }
        >
          <SelectTrigger id={idOf("priority")} className="h-11 md:h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITIES.map((priority) => (
              <SelectItem key={priority} value={priority}>
                {priorityLabel(priority)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={idOf("description")}>Description</Label>
        <Textarea
          id={idOf("description")}
          rows={4}
          value={values.description}
          aria-invalid={descriptionError ? true : undefined}
          aria-describedby={descriptionError ? `${idOf("description")}-error` : undefined}
          onChange={(event) => onChange({ ...values, description: event.target.value })}
        />
        {descriptionError ? (
          <FieldMessage id={`${idOf("description")}-error`} text={descriptionError} />
        ) : null}
      </div>
      <ProposalCriteriaEditor
        proposalId={proposalId}
        criteria={values.criteria}
        onChange={(criteria) => onChange({ ...values, criteria })}
        error={error}
        announce={announce}
      />
      <p className="text-[13px] text-muted-foreground">
        Les liens (écrans, rôles, règles) s'ajoutent ensuite depuis le formulaire de la
        fonctionnalité.
      </p>
      <div className="flex flex-col gap-2 md:flex-row">
        <Button type="button" className="h-11 md:h-9" onClick={onFinish}>
          Terminer la modification
        </Button>
        <Button type="button" variant="outline" className="h-11 md:h-9" onClick={onCancel}>
          Annuler les modifications
        </Button>
      </div>
    </div>
  );
}
