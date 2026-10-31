"use client";

import type { FeatureSummary } from "@koklo/contract";
import {
  Badge,
  Button,
  Icon,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@koklo/ui";
import type { MouseEvent } from "react";
import { criteriaLabel, priorityLabel, statusIcon, statusLabel } from "../lib/feature-labels.ts";
import { GENERIC_ERROR } from "../lib/form-errors.ts";
import { ErrorNotice } from "./error-notice.tsx";

/** Priorité en mots : « Indispensable » ressort par la graisse, jamais par une couleur. */
export function PriorityText({ priority }: { priority: string }) {
  return (
    <span
      className={priority === "must" ? "font-semibold text-foreground" : "text-muted-foreground"}
    >
      {priorityLabel(priority)}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className="gap-1">
      <Icon name={statusIcon(status)} size={16} />
      <span>{statusLabel(status)}</span>
    </Badge>
  );
}

interface RowProps {
  feature: FeatureSummary;
  href: string;
  onOpen: (specId: string) => void;
}

/** Clic simple : la fiche s'ouvre sans quitter la page ; clic modifié (nouvel onglet) : lien normal. */
function plainClick(event: MouseEvent): boolean {
  return event.button === 0 && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
}

function FeatureRow({ feature, href, onOpen }: RowProps) {
  const meta = `${statusLabel(feature.status)} · ${priorityLabel(feature.priority)} · ${criteriaLabel(feature.criteriaCount)}`;
  return (
    <TableRow className="relative">
      <TableCell className="align-top font-mono text-xs text-muted-foreground">
        {feature.specId}
      </TableCell>
      <TableCell className="align-top">
        <a
          href={href}
          title={feature.title}
          data-feature-link={feature.specId}
          className="line-clamp-2 text-sm font-medium underline-offset-4 after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={(event) => {
            if (!plainClick(event)) return;
            event.preventDefault();
            onOpen(feature.specId);
          }}
        >
          {feature.title}
        </a>
        <p className="mt-1 flex items-center gap-1 text-[13px] text-muted-foreground md:hidden">
          <Icon name={statusIcon(feature.status)} size={16} />
          {meta}
        </p>
      </TableCell>
      <TableCell className="hidden align-top md:table-cell">
        <StatusBadge status={feature.status} />
      </TableCell>
      <TableCell className="hidden align-top text-[13px] md:table-cell">
        <PriorityText priority={feature.priority} />
      </TableCell>
      <TableCell className="hidden align-top text-right text-[13px] md:table-cell">
        {criteriaLabel(feature.criteriaCount)}
      </TableCell>
    </TableRow>
  );
}

export interface MoreState {
  hasNext: boolean;
  fetching: boolean;
  /** Échec de « Afficher plus » : `validation` = curseur périmé ou malformé. */
  failure: "validation" | "other" | null;
  onMore: () => void;
  onRestart: () => void;
}

function MoreFailure({ more }: { more: MoreState }) {
  if (more.failure === "validation") {
    return (
      <ErrorNotice
        title="La liste n'a pas pu être poursuivie"
        onRetry={more.onRestart}
        retryLabel="Revenir au début"
      >
        Revenez au début de la liste puis réessayez.
      </ErrorNotice>
    );
  }
  return (
    <ErrorNotice title="Impossible de charger les fonctionnalités" onRetry={more.onMore}>
      {GENERIC_ERROR}
    </ErrorNotice>
  );
}

interface ListProps {
  projectName: string | undefined;
  items: FeatureSummary[];
  hrefFor: (specId: string) => string;
  onOpen: (specId: string) => void;
  more: MoreState;
}

const HEADERS = [
  { label: "Identifiant", className: "" },
  { label: "Titre", className: "" },
  { label: "Statut", className: "hidden md:table-cell" },
  { label: "Priorité", className: "hidden md:table-cell" },
  { label: "Critères", className: "hidden text-right md:table-cell" },
];

/** Table des fonctionnalités dans l'ordre de l'API, suivie de « Afficher plus » ou de l'échec de la suite. */
export function FeaturesList({ projectName, items, hrefFor, onOpen, more }: ListProps) {
  return (
    <div className="flex flex-col gap-4">
      <Table>
        <TableCaption className="sr-only">
          {`Fonctionnalités du projet${projectName ? ` ${projectName}` : ""}`}
        </TableCaption>
        <TableHeader>
          <TableRow>
            {HEADERS.map((header) => (
              <TableHead key={header.label} scope="col" className={header.className}>
                {header.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((feature) => (
            <FeatureRow
              key={feature.specId}
              feature={feature}
              href={hrefFor(feature.specId)}
              onOpen={onOpen}
            />
          ))}
        </TableBody>
      </Table>
      {more.failure ? <MoreFailure more={more} /> : null}
      {more.hasNext && !more.failure ? (
        <Button
          variant="outline"
          className="h-11 w-full md:h-9 md:w-auto md:self-start"
          disabled={more.fetching}
          aria-busy={more.fetching || undefined}
          onClick={more.onMore}
        >
          {more.fetching ? "Chargement…" : "Afficher plus de fonctionnalités"}
        </Button>
      ) : null}
    </div>
  );
}
