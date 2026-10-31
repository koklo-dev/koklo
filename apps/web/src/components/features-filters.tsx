"use client";

import { featurePrioritySchema, featureStatusSchema } from "@koklo/contract";
import {
  Button,
  Field,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@koklo/ui";
import { type Ref, useId } from "react";
import {
  type FeaturePriority,
  type FeatureStatus,
  priorityLabel,
  statusLabel,
} from "../lib/feature-labels.ts";
import type { FeaturesUrlPatch } from "../lib/features-url.ts";

const ALL = "all";

interface FilterSelectProps {
  label: string;
  allLabel: string;
  value: string | undefined;
  options: readonly { value: string; label: string }[];
  onChange: (value: string | null) => void;
  triggerRef?: Ref<HTMLButtonElement>;
}

/** `Select` à libellé visible et lié ; « Tous » / « Toutes » remet le filtre à zéro. */
function FilterSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
  triggerRef,
}: FilterSelectProps) {
  const id = useId();
  return (
    <Field className="md:w-[220px]">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value ?? ALL} onValueChange={(next) => onChange(next === ALL ? null : next)}>
        <SelectTrigger id={id} ref={triggerRef} className="h-11 md:h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

const STATUS_OPTIONS = featureStatusSchema.options.map((value) => ({
  value,
  label: statusLabel(value),
}));
const PRIORITY_OPTIONS = featurePrioritySchema.options.map((value) => ({
  value,
  label: priorityLabel(value),
}));

interface FiltersProps {
  status: FeatureStatus | undefined;
  priority: FeaturePriority | undefined;
  onChange: (patch: FeaturesUrlPatch) => void;
  onClear: () => void;
  statusRef: Ref<HTMLButtonElement>;
}

/** Filtres de statut et de priorité : le changement relance la requête, sans bouton « Appliquer ». */
export function FeaturesFilters({ status, priority, onChange, onClear, statusRef }: FiltersProps) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end">
      <FilterSelect
        label="Statut"
        allLabel="Tous"
        value={status}
        options={STATUS_OPTIONS}
        onChange={(value) => onChange({ status: value as FeatureStatus | null })}
        triggerRef={statusRef}
      />
      <FilterSelect
        label="Priorité"
        allLabel="Toutes"
        value={priority}
        options={PRIORITY_OPTIONS}
        onChange={(value) => onChange({ priority: value as FeaturePriority | null })}
      />
      {status || priority ? (
        <Button variant="ghost" className="h-11 w-full md:h-9 md:w-auto" onClick={onClear}>
          Effacer les filtres
        </Button>
      ) : null}
    </div>
  );
}
