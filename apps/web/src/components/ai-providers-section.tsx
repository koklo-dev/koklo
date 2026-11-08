"use client";

import type { AiProviderItemOutput } from "@koklo/contract";
import { Card, CardDescription, CardHeader, CardTitle } from "@koklo/ui";
import { AI_SETTINGS_LABELS as L } from "../lib/ai-settings-labels.ts";
import { AiAddButton, AiProviderAdd, useAddPanel } from "./ai-provider-add.tsx";
import { AiProvidersList } from "./ai-providers-list.tsx";

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
    <Card role="region" aria-label={L.providers} className="flex flex-col gap-3">
      <CardHeader
        className="flex-col items-stretch md:flex-row md:items-start"
        action={<AiAddButton panel={add} canAdd={owned.size < 6} />}
      >
        <CardTitle>{L.providers}</CardTitle>
        <CardDescription>{L.providersIntro}</CardDescription>
      </CardHeader>
      {items.length === 0 ? <p className="text-sm">{L.noProvider}</p> : null}
      <AiProvidersList items={items} withModels={withModels} announce={announce} />
      <AiProviderAdd panel={add} owned={owned} withModels={withModels} announce={announce} />
    </Card>
  );
}
