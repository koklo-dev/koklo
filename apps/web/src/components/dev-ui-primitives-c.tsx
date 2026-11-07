"use client";

import {
  Checkbox,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FilterChip,
  Input,
  OptionChip,
  RadioCard,
  RadioCardGroup,
  RadioGroup,
  RadioGroupItem,
  SearchField,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  SwitchRow,
  Textarea,
} from "@koklo/ui";
import { useState } from "react";
import { DevUiFrame, DevUiNote, DevUiRow, DevUiSection } from "./dev-ui-frame.tsx";

const THEMES = [
  { value: "light", label: "Clair" },
  { value: "dark", label: "Sombre", icon: "dark_mode" },
  { value: "auto", label: "Auto" },
] as const;
const PAGE_SIZES = [
  { value: "25", label: "25" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
] as const;
const FREQUENCIES = [
  { value: "daily", label: "Tous les jours" },
  { value: "weekly", label: "Toutes les semaines" },
] as const;
const MODELS = ["modele-1", "modele-2", "modele-3"] as const;

function ChipsFrame() {
  const [model, setModel] = useState<string>(MODELS[0]);
  return (
    <DevUiFrame title="Pastilles de filtre et options">
      <DevUiNote>Filtres : inactif, actif, avec compteur, ajout pointillé, désactivé</DevUiNote>
      <DevUiRow>
        <FilterChip>Tous</FilterChip>
        <FilterChip defaultPressed>À valider</FilterChip>
        <FilterChip count={12}>Ouverts</FilterChip>
        <FilterChip add>Ajouter un filtre</FilterChip>
        <FilterChip disabled>Figé</FilterChip>
      </DevUiRow>
      <DevUiNote>Options : un seul choix, texte technique en mono</DevUiNote>
      <div role="listbox" aria-label="Modèles" className="flex flex-wrap gap-2">
        {MODELS.map((m) => (
          <OptionChip key={m} mono selected={m === model} onSelect={() => setModel(m)}>
            {m}
          </OptionChip>
        ))}
      </div>
    </DevUiFrame>
  );
}

function SegmentedFrame() {
  return (
    <DevUiFrame title="Contrôle segmenté">
      <DevUiNote>Actif neutre (fond de page et anneau), sans violet</DevUiNote>
      <DevUiRow>
        <SegmentedControl aria-label="Apparence d'exemple" options={THEMES} defaultValue="light" />
      </DevUiRow>
      <DevUiNote>Mode radio (flèches) et taille xs</DevUiNote>
      <DevUiRow>
        <SegmentedControl
          aria-label="Affichage d'exemple"
          mode="radio"
          options={THEMES}
          defaultValue="auto"
        />
        <SegmentedControl
          aria-label="Lignes par page d'exemple"
          size="xs"
          options={PAGE_SIZES}
          defaultValue="50"
        />
      </DevUiRow>
    </DevUiFrame>
  );
}

function TogglesFrame() {
  return (
    <DevUiFrame title="Interrupteurs, cases et radios">
      <SwitchRow
        title="Fournisseur de secours"
        description="Bascule automatique en cas d'indisponibilité"
        defaultChecked
      />
      <DevUiRow>
        <Switch aria-label="Éteint" />
        <Switch aria-label="Allumé" defaultChecked />
        <Switch aria-label="Verrouillé" defaultChecked disabled />
      </DevUiRow>
      <DevUiRow>
        <Checkbox aria-label="Case décochée" />
        <Checkbox aria-label="Case cochée" defaultChecked />
        <Checkbox aria-label="Case indéterminée" checked="indeterminate" />
        <Checkbox aria-label="Case désactivée" disabled />
      </DevUiRow>
      <RadioGroup aria-label="Fréquence d'exemple" defaultValue="daily">
        {FREQUENCIES.map(({ value, label }) => (
          <div key={value} className="flex min-h-7 items-center gap-2 text-body">
            <RadioGroupItem value={value} id={`dev-radio-${value}`} />
            <label htmlFor={`dev-radio-${value}`}>{label}</label>
          </div>
        ))}
      </RadioGroup>
    </DevUiFrame>
  );
}

function RadioCardsFrame() {
  return (
    <DevUiFrame title="Cartes à choix" wide>
      <RadioCardGroup aria-label="Fournisseur d'exemple" defaultValue="a">
        <RadioCard
          value="a"
          title="Fournisseur A"
          description="Modèle par défaut, usage général"
          badge="Recommandé"
        />
        <RadioCard value="b" title="Fournisseur B" description="Secours, plus économique" />
        <RadioCard value="c" title="Fournisseur C" description="Indisponible" disabled />
      </RadioCardGroup>
    </DevUiFrame>
  );
}

function InputsFrame() {
  const [query, setQuery] = useState("F-0");
  return (
    <DevUiFrame title="Champs de saisie">
      <Input aria-label="Plafond mensuel" defaultValue="100 €" />
      <Input aria-label="Plafond compact" fieldSize="sm" placeholder="Taille 36" />
      <Input aria-label="Clé d'exemple" mono defaultValue="cle-0000-exemple" />
      <Input aria-label="Champ invalide" aria-invalid="true" defaultValue="-5" />
      <Input aria-label="Champ désactivé" disabled defaultValue="Non modifiable" />
      <SearchField
        label="Rechercher une fonctionnalité"
        placeholder="Titre ou F-nnn"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onClear={() => setQuery("")}
      />
      <Textarea aria-label="Note d'exemple" placeholder="Zone de texte" rows={3} />
      <Textarea aria-label="Note désactivée" disabled defaultValue="Zone désactivée" rows={2} />
    </DevUiFrame>
  );
}

function FieldsFrame() {
  return (
    <DevUiFrame title="Champs avec libellé">
      <Field>
        <FieldLabel htmlFor="dev-f-name" required>
          Nom du projet
        </FieldLabel>
        <Input id="dev-f-name" required defaultValue="Projet d'exemple" />
        <FieldDescription>Visible par toute l'équipe</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="dev-f-note" optional>
          Note
        </FieldLabel>
        <Input id="dev-f-note" />
      </Field>
      <Field data-invalid="true">
        <FieldLabel htmlFor="dev-f-cap" required>
          Plafond mensuel
        </FieldLabel>
        <Input
          id="dev-f-cap"
          aria-invalid="true"
          aria-describedby="dev-f-cap-err"
          defaultValue="-5"
        />
        <FieldError id="dev-f-cap-err">Saisir un montant positif</FieldError>
      </Field>
      <Field>
        <FieldLabel htmlFor="dev-f-role">Rôle</FieldLabel>
        <Select defaultValue="developer">
          <SelectTrigger id="dev-f-role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="developer">Développeur</SelectItem>
            <SelectItem value="designer">Designer</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Select disabled>
        <SelectTrigger aria-label="Liste désactivée" size="sm">
          <SelectValue placeholder="Taille 36, désactivée" />
        </SelectTrigger>
      </Select>
    </DevUiFrame>
  );
}

export function DevUiPrimitivesC() {
  return (
    <DevUiSection
      id="dev-ui-prim-c"
      title="Primitives de base · C : filtres, interrupteurs, champs"
    >
      <ChipsFrame />
      <SegmentedFrame />
      <TogglesFrame />
      <RadioCardsFrame />
      <InputsFrame />
      <FieldsFrame />
    </DevUiSection>
  );
}
