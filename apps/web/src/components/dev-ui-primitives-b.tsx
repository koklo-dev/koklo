"use client";

import {
  Avatar,
  AvatarFallback,
  type AvatarShape,
  type AvatarSize,
  type AvatarTone,
  CountBadge,
  DeliverableStatus,
  Dot,
  IconTile,
  IdTag,
  LifecycleStatus,
  Pill,
  type Role,
  RolePill,
  ValidationStatus,
} from "@koklo/ui";
import { DevUiFrame, DevUiNote, DevUiRow, DevUiSection } from "./dev-ui-frame.tsx";
import {
  AVATAR_SIZES,
  AVATAR_TONES,
  COUNT_TONES,
  PILL_SIZES,
  PILL_TONES,
  ROLES,
  TILE_SIZES,
  TILE_TONES,
} from "./dev-ui-primitives-b-data.ts";

function PillsFrame() {
  return (
    <DevUiFrame title="Pastilles" wide>
      <DevUiNote>Trois tailles : xs 18, sm 22, md 24</DevUiNote>
      <DevUiRow>
        {PILL_SIZES.map((size) => (
          <Pill key={size} size={size} tone="soft">
            {size}
          </Pill>
        ))}
        <Pill size="sm" tone="soft" icon="schedule">
          Avec icône
        </Pill>
        <Pill tone="soft" icon="check_circle">
          Avec icône
        </Pill>
      </DevUiRow>
      <DevUiNote>Neuf tons</DevUiNote>
      <DevUiRow>
        {PILL_TONES.map((tone) => (
          <Pill key={tone} tone={tone}>
            {tone}
          </Pill>
        ))}
      </DevUiRow>
      <DevUiNote>Interactive : un bouton, Entrée ou Espace l'active</DevUiNote>
      <DevUiRow>
        <Pill interactive tone="outline">
          Tous les rôles
        </Pill>
        <Pill interactive tone="soft" icon="groups">
          Équipe
        </Pill>
      </DevUiRow>
    </DevUiFrame>
  );
}

function CountersFrame() {
  return (
    <DevUiFrame title="Compteurs et repères">
      <DevUiRow>
        {COUNT_TONES.map((tone, i) => (
          <CountBadge key={tone} tone={tone}>
            {i + 3}
          </CountBadge>
        ))}
      </DevUiRow>
      <DevUiRow>
        <Dot aria-label="Nouveauté" />
        <span className="text-meta text-muted-foreground">Repère de nouveauté (nom lu)</span>
      </DevUiRow>
    </DevUiFrame>
  );
}

function RolesFrame() {
  return (
    <DevUiFrame title="Rôles et identifiants">
      <DevUiRow>
        {ROLES.map((role: Role) => (
          <RolePill key={role} role={role} />
        ))}
      </DevUiRow>
      <DevUiRow>
        <IdTag>TK-138</IdTag>
        <IdTag tone="outline">S-dev-ui</IdTag>
        <IdTag size="sm">TK-139</IdTag>
        <IdTag size="sm" tone="outline">
          B1
        </IdTag>
      </DevUiRow>
      <DevUiRow>
        <IdTag variant="pill" prefix="Fournisseur A ·">
          modèle-1
        </IdTag>
      </DevUiRow>
    </DevUiFrame>
  );
}

function StatusesFrame() {
  return (
    <DevUiFrame title="Statuts" wide>
      <DevUiNote>Gabarit Pill md : 24 px, marges 0 10 0 6</DevUiNote>
      <DevUiRow>
        <ValidationStatus status="validated" />
        <ValidationStatus status="pending" />
        <ValidationStatus status="revise" />
        <ValidationStatus status="unsubmitted" />
      </DevUiRow>
      <DevUiRow>
        <DeliverableStatus status="todo" />
        <DeliverableStatus status="in_progress" />
        <DeliverableStatus status="pending" />
        <DeliverableStatus status="validated" />
      </DevUiRow>
      <DevUiRow>
        <LifecycleStatus stage={0} />
        <LifecycleStatus stage={3} />
        <LifecycleStatus stage={5} />
      </DevUiRow>
    </DevUiFrame>
  );
}

function AvatarsFrame() {
  const shapes: readonly AvatarShape[] = ["circle", "tile"];
  return (
    <DevUiFrame title="Avatars" wide>
      {shapes.map((shape) => (
        <div key={shape} className="flex flex-col gap-2">
          <DevUiNote>
            {shape === "circle" ? "Ronds, de 24 à 56" : "Tuiles, rayon selon la taille"}
          </DevUiNote>
          <DevUiRow>
            {AVATAR_SIZES.map((size: AvatarSize) => (
              <Avatar key={size} size={size} shape={shape}>
                <AvatarFallback>YK</AvatarFallback>
              </Avatar>
            ))}
          </DevUiRow>
        </div>
      ))}
      <DevUiNote>Tons : membre, doux, client, agent IA</DevUiNote>
      <DevUiRow>
        {AVATAR_TONES.map((tone: AvatarTone) => (
          <Avatar key={tone} tone={tone} size={32}>
            <AvatarFallback>{tone === "agent" ? "IA" : "AB"}</AvatarFallback>
          </Avatar>
        ))}
      </DevUiRow>
    </DevUiFrame>
  );
}

function TilesFrame() {
  return (
    <DevUiFrame title="Tuiles d'icône" wide>
      <DevUiRow>
        {TILE_SIZES.map((size) => (
          <IconTile key={size} size={size} icon="key" />
        ))}
      </DevUiRow>
      <DevUiRow>
        {TILE_TONES.map((tone) => (
          <IconTile key={tone} tone={tone} icon="description" />
        ))}
      </DevUiRow>
    </DevUiFrame>
  );
}

/** Section « Primitives de base », groupe B : pastilles, statuts, avatars (S-dev-ui, TK-138). */
export function DevUiPrimitivesB() {
  return (
    <DevUiSection id="dev-ui-prim-b" title="Primitives de base · B : pastilles, avatars, tuiles">
      <PillsFrame />
      <CountersFrame />
      <RolesFrame />
      <StatusesFrame />
      <AvatarsFrame />
      <TilesFrame />
    </DevUiSection>
  );
}
