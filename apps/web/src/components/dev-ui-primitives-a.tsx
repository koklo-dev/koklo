"use client";

import { Button, Icon, IconButton, Kbd, Spinner } from "@koklo/ui";
import { useState } from "react";
import { DevUiFrame, DevUiNote, DevUiRow, DevUiSection } from "./dev-ui-frame.tsx";
import {
  ELEVATIONS,
  ICON_SIZES,
  ICON_TONES,
  NEW_ICONS,
  TEXT_ROLES,
} from "./dev-ui-primitives-data.ts";

const noop = () => undefined;
const VARIANTS = [
  ["default", "Principal"],
  ["secondary", "Secondaire"],
  ["outline", "Contour"],
  ["ghost", "Discret"],
  ["destructive", "Supprimer"],
  ["dashed", "Pointillé"],
  ["link", "Lien"],
] as const;
const SIZES = [
  ["xs", "xs · 28"],
  ["sm", "sm · 32"],
  ["md", "md · 36"],
  ["lg", "lg · 40"],
] as const;

function TokensFrame() {
  return (
    <DevUiFrame title="Jetons" wide>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <DevUiNote>Textes ajoutés</DevUiNote>
          {TEXT_ROLES.map(({ className, spec, sample }) => (
            <p key={className} className="flex flex-wrap items-baseline gap-x-3">
              <span className={className}>{sample}</span>
              <span className="text-meta text-muted-foreground">
                {className.split(" ")[0]} · {spec}
              </span>
            </p>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <DevUiNote>Alerte de succès, ombres et rayons</DevUiNote>
          <p className="rounded-card border border-alert-success-border bg-alert-success px-3 py-2 text-meta text-alert-success-foreground">
            Enregistré. Rien d'autre à faire.
          </p>
          {ELEVATIONS.map(({ className, label }) => (
            <div key={label} className={`border bg-raised px-3 py-3 text-meta ${className}`}>
              {label}
            </div>
          ))}
          <div className="rounded-card bg-overlay px-3 py-3 text-meta text-foreground">
            Voile des dialogues (--overlay)
          </div>
        </div>
      </div>
    </DevUiFrame>
  );
}

function ButtonsFrame() {
  const [pressed, setPressed] = useState(false);
  return (
    <DevUiFrame title="Boutons" wide>
      <DevUiNote>Variantes (taille md)</DevUiNote>
      <DevUiRow>
        {VARIANTS.map(([variant, label]) => (
          <Button key={variant} variant={variant} data-gallery-variant={variant}>
            {label}
          </Button>
        ))}
        <Button variant="inherit" data-gallery-variant="inherit">
          Hérité
        </Button>
      </DevUiRow>
      <DevUiNote>Quatre tailles, sans puis avec icône</DevUiNote>
      <DevUiRow>
        {SIZES.map(([id, label]) => (
          <Button
            key={id}
            size={id === "md" ? "default" : id}
            variant="secondary"
            data-gallery-size={id}
          >
            {label}
          </Button>
        ))}
      </DevUiRow>
      <DevUiRow>
        {SIZES.map(([id, label]) => (
          <Button key={id} size={id === "md" ? "default" : id} icon="add">
            {label}
          </Button>
        ))}
      </DevUiRow>
      <DevUiNote>Raccourci, chargement, enfoncé, pleine largeur</DevUiNote>
      <DevUiRow>
        <Button variant="outline" icon="search" shortcut="⌘K">
          Rechercher
        </Button>
        <Button loading>Envoi en cours…</Button>
        <Button variant="outline" size="sm" loading>
          Envoi
        </Button>
        <Button variant="outline" pressed={pressed} onClick={() => setPressed((on) => !on)}>
          Filtre actif
        </Button>
        <Button variant="outline" pressed>
          Enfoncé
        </Button>
      </DevUiRow>
      <Button fullWidth variant="secondary" icon="arrow_forward">
        Pleine largeur
      </Button>
      <DevUiNote>Désactivé, toujours avec sa raison</DevUiNote>
      <DevUiRow>
        <Button disabled disabledReason="Choisissez d'abord un projet">
          Action indisponible
        </Button>
        <Button variant="dashed" disabled disabledReason="Droits insuffisants">
          Pointillé indisponible
        </Button>
      </DevUiRow>
    </DevUiFrame>
  );
}

function IconButtonsFrame() {
  return (
    <DevUiFrame title="Boutons d'icône">
      <DevUiRow>
        <IconButton icon="close" size="sm" aria-label="Fermer (32)" onClick={noop} />
        <IconButton icon="close" aria-label="Fermer (36)" onClick={noop} />
        <IconButton
          icon="more_horiz"
          size="sm"
          variant="outline"
          aria-label="Plus d'actions (32)"
        />
        <IconButton
          icon="arrow_forward"
          tone="primary"
          aria-label="Envoyer le message"
          onClick={noop}
        />
        <IconButton icon="add" variant="outline" aria-label="Ajouter" disabled />
      </DevUiRow>
      <DevUiNote>32 (icône 18), 36 (icône 20) et envoi primaire 32, rayon 8</DevUiNote>
    </DevUiFrame>
  );
}

function LoadingFrame() {
  return (
    <DevUiFrame title="Chargement et touches">
      <DevUiRow>
        {([16, 18, 20] as const).map((size) => (
          <Spinner key={size} size={size} />
        ))}
        <span className="text-foreground">
          <Spinner tone="current" />
        </span>
        <span className="text-meta text-muted-foreground">
          Décoratif : l'état est annoncé par le bouton
        </span>
      </DevUiRow>
      <DevUiRow>
        <Kbd>⌘K</Kbd>
        <Kbd>Échap</Kbd>
        <Kbd>↵</Kbd>
        <span className="text-meta text-muted-foreground">Touches de raccourci</span>
      </DevUiRow>
    </DevUiFrame>
  );
}

function IconsFrame() {
  return (
    <DevUiFrame title="Icônes" wide>
      <DevUiNote>Tailles 14 à 28</DevUiNote>
      <DevUiRow>
        {ICON_SIZES.map((size) => (
          <span key={size} className="inline-flex items-center gap-1 text-meta">
            <Icon name="check_circle" size={size} fill />
            {size}
          </span>
        ))}
      </DevUiRow>
      <DevUiNote>Tons (sans ton : couleur du texte)</DevUiNote>
      <DevUiRow>
        {ICON_TONES.map(({ tone, label }) => (
          <span key={tone} className="inline-flex items-center gap-1 text-meta">
            <Icon name="check_circle" tone={tone} size={20} />
            {label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1 text-meta">
          <Icon name="check_circle" size={20} />
          défaut
        </span>
      </DevUiRow>
      <DevUiNote>Glyphes ajoutés par TK-138 (« wand_stars » = agent IA)</DevUiNote>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
        {NEW_ICONS.map((name) => (
          <li key={name} className="flex items-center gap-2 text-code text-muted-foreground">
            <Icon name={name} size={20} className="text-foreground" />
            <span className="min-w-0 break-words font-mono">{name}</span>
          </li>
        ))}
      </ul>
    </DevUiFrame>
  );
}

/** Section « Primitives de base », groupe A : jetons, icônes, actions (S-dev-ui, TK-138). */
export function DevUiPrimitivesA() {
  return (
    <DevUiSection id="dev-ui-prim-a" title="Primitives de base · A : jetons, icônes, actions">
      <TokensFrame />
      <ButtonsFrame />
      <IconButtonsFrame />
      <LoadingFrame />
      <IconsFrame />
    </DevUiSection>
  );
}
