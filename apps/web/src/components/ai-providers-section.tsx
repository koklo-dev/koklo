"use client";

import type { AiProviderItemOutput } from "@koklo/contract";
import { AI_SETTINGS_LABELS as L } from "../lib/ai-settings-labels.ts";
import { AiAddButton, AiProviderAdd, useAddPanel } from "./ai-provider-add.tsx";
import { AiProvidersList } from "./ai-providers-list.tsx";
import { AiSectionCard } from "./ai-section-card.tsx";

type Provider = AiProviderItemOutput["provider"];

/** Carte « Fournisseurs » : bouton d'ajout primaire en haut à droite, lignes, formulaire d'ajout dessous. */
export function AiProvidersSection({
  items,
  withModels,
  announce,
}: {
  items: AiProviderItemOutput[];
  withModels: ReadonlySet<Provider>;
  announce: (message: string) => void;
}) {
  const owned = new Set(items.map((item) => item.provider));
  const add = useAddPanel(items.length === 0);
  return (
    <AiSectionCard
      title={L.providers}
      subtitle={L.providersIntro}
      action={<AiAddButton panel={add} canAdd={owned.size < 6} />}
    >
      {items.length === 0 ? <p className="text-sm">{L.noProvider}</p> : null}
      <AiProvidersList items={items} withModels={withModels} announce={announce} />
      <AiProviderAdd panel={add} owned={owned} withModels={withModels} announce={announce} />
      <p className="text-meta text-muted-foreground">{L.encrypted}</p>
    </AiSectionCard>
  );
}
