"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  InlineAlert,
  ProgressBar,
  Skeleton,
  SkeletonRow,
  StatCard,
} from "@koklo/ui";
import { DevUiFrame, DevUiNote, DevUiRow, DevUiSection } from "./dev-ui-frame.tsx";
import { ALERTS, CARD_VARIANTS, PROGRESS_VALUES, STATS } from "./dev-ui-surfaces-data.ts";

const noop = () => undefined;

function CardsFrame() {
  return (
    <DevUiFrame title="Card" wide>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {CARD_VARIANTS.map(({ variant, title, description }) => (
          <Card key={variant} variant={variant}>
            <CardHeader
              action={
                <Button size="sm" variant="outline" onClick={noop}>
                  Modifier
                </Button>
              }
            >
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="text-meta">Contenu de la carte.</CardContent>
          </Card>
        ))}
        <Card variant="interactive" asChild>
          <a href="#dev-ui-surf-a">Carte interactive : tout le bloc est un lien</a>
        </Card>
        <Card variant="interactive" selected asChild>
          <a href="#dev-ui-surf-a">Carte interactive choisie : bordure --primary</a>
        </Card>
      </div>
    </DevUiFrame>
  );
}

function StatsFrame() {
  return (
    <DevUiFrame title="StatCard" wide>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        {STATS.map(({ label, icon, value, note, gauge }) => (
          <StatCard key={label} label={label} icon={icon} value={value} note={note} gauge={gauge} />
        ))}
      </div>
    </DevUiFrame>
  );
}

function ProgressFrame() {
  return (
    <DevUiFrame title="ProgressBar">
      {(["md", "lg"] as const).map((size) => (
        <div key={size} className="flex flex-col gap-2">
          <DevUiNote>{size === "md" ? "Taille 6 (rayon 3)" : "Taille 8 (rayon 4)"}</DevUiNote>
          {PROGRESS_VALUES.map((value) => (
            <div key={value} className="flex items-center gap-3">
              <ProgressBar
                value={value}
                size={size}
                aria-label={`Avancement ${value} % (taille ${size === "md" ? 6 : 8})`}
              />
              <span className="w-10 shrink-0 text-right text-meta text-muted-foreground">
                {value} %
              </span>
            </div>
          ))}
        </div>
      ))}
      <div className="flex flex-col gap-2">
        <DevUiNote>
          Teinte success et part en cours (enregistrement par lots : 200 écrites, 200 en cours sur
          512)
        </DevUiNote>
        <ProgressBar
          tone="success"
          value={(200 / 512) * 100}
          pending={(200 / 512) * 100}
          aria-label="Enregistrement : 200 sur 512"
        />
      </div>
    </DevUiFrame>
  );
}

function AlertsFrame() {
  return (
    <DevUiFrame title="InlineAlert">
      <DevUiNote>Sept tons, action en lien</DevUiNote>
      {ALERTS.map(({ variant, icon, text, action }) =>
        action === "Détails" ? (
          <InlineAlert
            key={variant}
            variant={variant}
            icon={icon}
            details={<p>Ne saisissez pas de données personnelles.</p>}
          >
            {text}
          </InlineAlert>
        ) : (
          <InlineAlert
            key={variant}
            variant={variant}
            icon={icon}
            action={action ? { label: action, onClick: noop } : undefined}
          >
            {text}
          </InlineAlert>
        ),
      )}
      <DevUiNote>Actions en boutons</DevUiNote>
      <InlineAlert
        variant="warning"
        icon="rate_review"
        actions={[
          { label: "Revoir", onClick: noop },
          { label: "Plus tard", onClick: noop },
        ]}
      >
        Marie Lefèvre demande 3 changements avant de valider.
      </InlineAlert>
      <InlineAlert
        variant="agent"
        icon="wand_stars"
        actions={[{ label: "Accepter", onClick: noop }]}
      >
        L'agent a préparé une reformulation.
      </InlineAlert>
    </DevUiFrame>
  );
}

function EmptyStatesFrame() {
  return (
    <DevUiFrame title="EmptyState">
      <DevUiNote>Encadré, avec action principale et secondaire</DevUiNote>
      <EmptyState
        icon="folder_open"
        title="Aucun projet pour l'instant"
        description="Créez un projet pour démarrer le dossier d'idée avec l'agent."
        action={
          <Button icon="edit" onClick={noop}>
            Créer un projet
          </Button>
        }
        secondaryAction={
          <Button variant="outline" onClick={noop}>
            Importer un texte
          </Button>
        }
      />
      <DevUiNote>En ligne, dans une liste</DevUiNote>
      <div className="rounded-xl border">
        <EmptyState
          variant="inline"
          icon="search_off"
          title="Aucun résultat"
          description="Aucune fonctionnalité ne correspond à ce filtre."
        />
      </div>
    </DevUiFrame>
  );
}

function LoadingFrame() {
  return (
    <DevUiFrame title="Skeleton et SkeletonRow">
      <DevUiNote>Blocs, puis quatre lignes (barres à 60, 45, 70 et 52 %)</DevUiNote>
      <DevUiRow>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="size-9 rounded-full" />
        <Skeleton className="h-9 w-32" />
      </DevUiRow>
      <div className="divide-y rounded-xl border">
        {[0, 1, 2, 3].map((index) => (
          <SkeletonRow key={index} index={index} />
        ))}
      </div>
    </DevUiFrame>
  );
}

function DeprecatedFrame() {
  return (
    <DevUiFrame title="Alert (déprécié)">
      <DevUiNote>Déprécié : utiliser InlineAlert. Montré une fois pour mémoire.</DevUiNote>
      <Alert>
        <AlertTitle>Ancienne alerte</AlertTitle>
        <AlertDescription>Remplacée par InlineAlert neutre.</AlertDescription>
      </Alert>
    </DevUiFrame>
  );
}

/** Section « Surfaces · A » : cartes, retours d'état et squelettes (S-dev-ui, TK-139). */
export function DevUiSurfacesA() {
  return (
    <DevUiSection id="dev-ui-surf-a" title="Surfaces · A : cartes, retours et états">
      <CardsFrame />
      <StatsFrame />
      <ProgressFrame />
      <AlertsFrame />
      <EmptyStatesFrame />
      <LoadingFrame />
      <DeprecatedFrame />
    </DevUiSection>
  );
}
