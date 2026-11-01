"use client";

import {
  Badge,
  Button,
  Icon,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@koklo/ui";
import { isRenamed, nextStepType } from "../lib/feature-criteria.ts";
import type { CriterionValue, StepValue } from "../lib/feature-form.ts";
import { fieldId } from "../lib/feature-form-ids.ts";
import { type StepType, stepLabel } from "../lib/feature-labels.ts";
import { FieldMessage } from "./feature-form-fields.tsx";

const STEP_TYPES: StepType[] = ["etant_donne", "quand", "alors", "et"];

export interface CriterionActions {
  onChange: (patch: Partial<Pick<CriterionValue, "title" | "steps">>) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  onFocus: (id: string) => void;
}
interface ItemProps extends CriterionActions {
  criterion: CriterionValue;
  /** Numéro affiché (à partir de 1). */
  number: number;
  count: number;
  original: CriterionValue[] | null;
  readOnly: boolean;
  error: (field: string) => string | undefined;
  onBlur: () => void;
}

function Identity({ criterion, renamed }: { criterion: CriterionValue; renamed: boolean }) {
  if (criterion.id && !renamed) {
    return <span className="font-mono text-xs text-muted-foreground">{criterion.id}</span>;
  }
  return (
    <Badge variant="outline" className="gap-1">
      <Icon name="add" size={16} />
      <span>Nouveau</span>
    </Badge>
  );
}

interface StepProps {
  step: StepValue;
  criterion: number;
  position: number;
  readOnly: boolean;
  error: string | undefined;
  onChange: (step: StepValue) => void;
  onRemove: () => void;
  onBlur: () => void;
}

function StepRow({
  step,
  criterion,
  position,
  readOnly,
  error,
  onChange,
  onRemove,
  onBlur,
}: StepProps) {
  const id = fieldId(`criteria.${criterion}.steps.${position}.text`);
  return (
    <li className="flex flex-col gap-2 md:flex-row md:items-start">
      <Select
        value={step.type}
        disabled={readOnly}
        onValueChange={(type) => onChange({ ...step, type: type as StepType })}
      >
        <SelectTrigger aria-label="Type d'étape" className="h-11 md:h-9 md:w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STEP_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {stepLabel(type)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex flex-1 flex-col gap-1">
        <Textarea
          id={id}
          aria-label="Texte de l'étape"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          rows={1}
          value={step.text}
          readOnly={readOnly}
          onChange={(event) => onChange({ ...step, text: event.target.value })}
          onBlur={onBlur}
        />
        {error ? <FieldMessage id={`${id}-error`} text={error} /> : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-11 w-11 md:h-9 md:w-9"
        aria-label={`Retirer l'étape ${position} du critère ${criterion}`}
        onClick={onRemove}
      >
        <Icon name="close" size={20} />
      </Button>
    </li>
  );
}

interface TitleProps {
  id: string;
  criterion: CriterionValue;
  renamed: boolean;
  readOnly: boolean;
  error: string | undefined;
  onChange: (title: string) => void;
  onBlur: () => void;
}

function CriterionTitle({ id, criterion, renamed, readOnly, error, onChange, onBlur }: TitleProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Titre du critère</Label>
      <Input
        id={id}
        className="h-11 md:h-9"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        value={criterion.title}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
      {error ? <FieldMessage id={`${id}-error`} text={error} /> : null}
      {renamed ? (
        <p className="text-[13px] text-muted-foreground">
          Ce critère recevra un nouvel identifiant.
        </p>
      ) : null}
    </div>
  );
}

function ActionsBar(props: {
  number: number;
  count: number;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { number, count, onMove, onRemove } = props;
  return (
    <div className="grid grid-cols-3 gap-2 md:flex">
      <Button
        id={fieldId(`criteria.${number}.up`)}
        type="button"
        variant="outline"
        className="h-11 md:h-9"
        aria-label={`Monter le critère ${number}`}
        aria-disabled={number === 1 || undefined}
        onClick={() => number > 1 && onMove(-1)}
      >
        <Icon name="keyboard_arrow_up" size={16} />
        Monter
      </Button>
      <Button
        id={fieldId(`criteria.${number}.down`)}
        type="button"
        variant="outline"
        className="h-11 md:h-9"
        aria-label={`Descendre le critère ${number}`}
        aria-disabled={number === count || undefined}
        onClick={() => number < count && onMove(1)}
      >
        <Icon name="keyboard_arrow_down" size={16} />
        Descendre
      </Button>
      <Button
        id={fieldId(`criteria.${number}.remove`)}
        type="button"
        variant="outline"
        className="h-11 md:h-9"
        aria-label={`Retirer le critère ${number}`}
        onClick={onRemove}
      >
        Retirer
      </Button>
    </div>
  );
}

function Steps(props: ItemProps) {
  const { criterion, number, readOnly, error, onBlur, onChange, onFocus } = props;
  const set = (steps: StepValue[]) => onChange({ steps });
  if (criterion.steps.length === 0) {
    return (
      <p className="flex items-center gap-1 text-[13px] text-muted-foreground">
        <Icon name="edit_note" size={16} />
        Ajoutez au moins une étape pour que ce critère soit testable.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {criterion.steps.map((step, index) => (
        <StepRow
          // biome-ignore lint/suspicious/noArrayIndexKey: étapes ordonnées, sans identifiant propre
          key={index}
          step={step}
          criterion={number}
          position={index + 1}
          readOnly={readOnly}
          error={error(`criteria.${number}.steps.${index + 1}.text`)}
          onChange={(next) => set(criterion.steps.map((s, i) => (i === index ? next : s)))}
          onRemove={() => {
            set(criterion.steps.filter((_, i) => i !== index));
            onFocus(fieldId(`criteria.${number}.add-step`));
          }}
          onBlur={onBlur}
        />
      ))}
    </ul>
  );
}

/** Un critère d'acceptation : `fieldset` nommé, titre, étapes typées, monter, descendre, retirer. */
export function CriterionItem(props: ItemProps) {
  const { criterion, number, count, original, readOnly, error, onBlur } = props;
  const { onChange, onMove, onRemove, onFocus } = props;
  const addStep = () => {
    onChange({ steps: [...criterion.steps, { type: nextStepType(criterion.steps), text: "" }] });
    onFocus(fieldId(`criteria.${number}.steps.${criterion.steps.length + 1}.text`));
  };
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <legend className="flex items-center gap-2 px-1 text-[13px] font-semibold">
        <span>{`Critère ${number}`}</span>
        <span className="sr-only">, </span>
        <Identity criterion={criterion} renamed={isRenamed(criterion, original)} />
      </legend>
      <CriterionTitle
        id={fieldId(`criteria.${number}.title`)}
        criterion={criterion}
        renamed={isRenamed(criterion, original)}
        readOnly={readOnly}
        error={error(`criteria.${number}.title`)}
        onChange={(title) => onChange({ title })}
        onBlur={onBlur}
      />
      <Steps {...props} />
      <Button
        id={fieldId(`criteria.${number}.add-step`)}
        type="button"
        variant="outline"
        className="h-11 w-full md:h-9 md:w-auto md:self-start"
        onClick={addStep}
      >
        <Icon name="add" size={16} />
        Ajouter une étape
      </Button>
      <ActionsBar number={number} count={count} onMove={onMove} onRemove={onRemove} />
    </fieldset>
  );
}
