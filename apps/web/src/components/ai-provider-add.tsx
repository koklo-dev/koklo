"use client";

import type { AiProviderItemOutput } from "@koklo/contract";
import { Button, cn, Icon } from "@koklo/ui";
import { useEffect, useRef, useState } from "react";
import { PROVIDER_DESCRIPTIONS, PROVIDER_ORDER, providerName } from "../lib/ai-provider-names.ts";
import { AI_SETTINGS_LABELS as L } from "../lib/ai-settings-labels.ts";
import { ProviderKeyForm } from "./ai-provider-key.tsx";

type Provider = AiProviderItemOutput["provider"];

type Panel = ReturnType<typeof useAddPanel>;

/** État du volet d'ajout : ouvert d'emblée sans fournisseur ; focus sur le premier choix, retour au bouton. */
export function useAddPanel(initiallyOpen: boolean) {
  const [open, setOpen] = useState(initiallyOpen);
  const [selected, setSelected] = useState<Provider | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open && !initiallyOpen)
      panel.current?.querySelector<HTMLElement>("input[type=radio]")?.focus();
  }, [open, initiallyOpen]);
  const close = () => {
    setOpen(false);
    setSelected(null);
    trigger.current?.focus();
  };
  return {
    open,
    selected,
    setSelected,
    trigger,
    panel,
    close,
    toggle: () => (open ? close() : setOpen(true)),
  };
}

/** « Ajouter un fournisseur » : bouton primaire, en tête de la carte Fournisseurs. */
export function AiAddButton({ panel, canAdd }: { panel: Panel; canAdd: boolean }) {
  if (!canAdd) return null;
  return (
    <Button
      ref={panel.trigger}
      type="button"
      aria-expanded={panel.open}
      aria-controls="ai-add-panel"
      className="h-11 w-full md:h-9 md:w-auto"
      onClick={panel.toggle}
    >
      <Icon name="add" size={18} />
      {L.add}
    </Button>
  );
}

function ProviderCards({
  choices,
  selected,
  onSelect,
}: {
  choices: Provider[];
  selected: Provider | null;
  onSelect: (provider: Provider) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={L.chooseProvider}
      className="grid grid-cols-1 gap-2 md:grid-cols-2"
    >
      {choices.map((id) => (
        <label
          key={id}
          className={cn(
            "flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border bg-background px-3 py-2.5 text-sm",
            "has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
            selected === id && "border-2 border-primary px-[11px] py-[9px]",
          )}
        >
          <input
            type="radio"
            name="ai-provider-choice"
            value={id}
            checked={selected === id}
            onChange={() => onSelect(id)}
            className="sr-only"
          />
          <Icon
            name={selected === id ? "check_circle" : "radio_button_unchecked"}
            size={20}
            className="mt-0.5 shrink-0"
          />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="font-semibold">{providerName(id)}</span>
            <span className="text-xs leading-snug text-muted-foreground">
              {PROVIDER_DESCRIPTIONS[id]}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}

/** Volet d'ajout (S-ai-settings §2) : cartes radio des fournisseurs pas encore ajoutés, puis le formulaire de clé. */
export function AiProviderAdd({
  panel,
  owned,
  withModels,
  announce,
}: {
  panel: Panel;
  /** Fournisseurs déjà ajoutés : leurs cartes ne sont pas proposées. */
  owned: ReadonlySet<Provider>;
  /** Fournisseurs ayant au moins un modèle qualifié. */
  withModels: ReadonlySet<Provider>;
  announce: (message: string) => void;
}) {
  const choices = PROVIDER_ORDER.filter((id) => !owned.has(id));
  if (choices.length === 0 || !panel.open) return null;
  return (
    <div
      id="ai-add-panel"
      ref={panel.panel}
      className="flex flex-col gap-3 rounded-lg border border-dashed border-input p-4"
    >
      <p className="text-sm font-semibold">{L.chooseTitle}</p>
      <ProviderCards choices={choices} selected={panel.selected} onSelect={panel.setSelected} />
      {panel.selected ? (
        <ProviderKeyForm
          key={panel.selected}
          provider={panel.selected}
          mode="add"
          hasModels={withModels.has(panel.selected)}
          onDone={panel.close}
          onCancel={panel.close}
          announce={announce}
        />
      ) : null}
    </div>
  );
}
