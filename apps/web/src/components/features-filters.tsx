"use client";

import { featurePrioritySchema, featureStatusSchema } from "@koklo/contract";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  FilterChip,
} from "@koklo/ui";
import type { Ref } from "react";
import {
  type FeaturePriority,
  type FeatureStatus,
  type FeatureValidation,
  priorityLabel,
  statusLabel,
  validationLabel,
} from "../lib/feature-labels.ts";
import type { FeaturesUrlPatch } from "../lib/features-url.ts";
import type { useSearchBox } from "../lib/use-features-list.ts";
import { FeaturesSearch } from "./features-search.tsx";

const ALL = "all";

interface Option {
  value: string;
  label: string;
}

interface FilterChipMenuProps {
  /** Nom du filtre : « Validation », « Priorité », « Avancement ». */
  label: string;
  /** Libellé du choix qui remet le filtre à zéro. */
  allLabel: string;
  value: string | undefined;
  options: readonly Option[];
  onChange: (value: string | null) => void;
  triggerRef?: Ref<HTMLButtonElement>;
}

/**
 * Pastille de filtre pointillée (maquette 10 l.183) qui ouvre un menu à choix unique ; une fois un choix fait, la
 * pastille le nomme (« Priorité : Indispensable ») et reste pleine. « Tous » / « Toutes » remet le filtre à zéro.
 */
export function FilterChipMenu({
  label,
  allLabel,
  value,
  options,
  onChange,
  triggerRef,
}: FilterChipMenuProps) {
  const chosen = options.find((option) => option.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <FilterChip
          ref={triggerRef}
          {...(chosen ? { pressed: true } : { add: true })}
          aria-label={chosen ? `${label} : ${chosen.label}` : label}
          className="max-md:h-11"
        >
          {chosen ? `${label} : ${chosen.label}` : label}
        </FilterChip>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={value ?? ALL}
          onValueChange={(next) => onChange(next === ALL ? null : next)}
        >
          <DropdownMenuRadioItem value={ALL}>{allLabel}</DropdownMenuRadioItem>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const VALIDATION_OPTIONS = (["validated", "to_validate", "to_revise"] as const).map((value) => ({
  value,
  label: validationLabel(value),
}));
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
  validation: FeatureValidation | undefined;
  onChange: (patch: FeaturesUrlPatch) => void;
  onClear: () => void;
  /** Première pastille : reçoit le focus après « Effacer les filtres ». */
  statusRef: Ref<HTMLButtonElement>;
  search: ReturnType<typeof useSearchBox>;
}

/** Recherche puis filtres Validation, Priorité et Avancement : le changement relance la requête, sans « Appliquer ». */
export function FeaturesFilters({
  status,
  priority,
  validation,
  onChange,
  onClear,
  statusRef,
  search,
}: FiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FeaturesSearch search={search} />
      <FilterChipMenu
        label="Validation"
        allLabel="Toutes"
        value={validation}
        options={VALIDATION_OPTIONS}
        onChange={(value) => onChange({ validation: value as FeatureValidation | null })}
        triggerRef={statusRef}
      />
      <FilterChipMenu
        label="Priorité"
        allLabel="Toutes"
        value={priority}
        options={PRIORITY_OPTIONS}
        onChange={(value) => onChange({ priority: value as FeaturePriority | null })}
      />
      <FilterChipMenu
        label="Avancement"
        allLabel="Tous"
        value={status}
        options={STATUS_OPTIONS}
        onChange={(value) => onChange({ status: value as FeatureStatus | null })}
      />
      {status || priority || validation ? (
        <Button variant="ghost" size="sm" className="max-md:h-11 max-md:w-full" onClick={onClear}>
          Effacer les filtres
        </Button>
      ) : null}
    </div>
  );
}
