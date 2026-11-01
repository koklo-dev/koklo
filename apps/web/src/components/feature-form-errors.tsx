"use client";

import { Alert, AlertDescription, AlertTitle, Button, Icon } from "@koklo/ui";
import { useEffect, useRef } from "react";
import {
  GITHUB_STATUS_LINK,
  type SaveErrorAction,
  type SaveErrorView,
} from "../lib/feature-errors.ts";
import type { FormIssue } from "../lib/feature-form.ts";
import { FIELD_LABELS, fieldId, focusIdOf } from "../lib/feature-form-ids.ts";
import { fieldOfIssue } from "../lib/spec-issues.ts";

interface SummaryProps {
  issues: FormIssue[];
  /** Nombre d'envois tentés : le focus revient sur le résumé à chaque tentative invalide. */
  attempt: number;
  criteriaCount: number;
  onFocusField: (field: string) => void;
}

const points = (count: number): string => `${count} point${count > 1 ? "s" : ""}`;

/** Résumé des erreurs de saisie : une alerte, un vrai lien par erreur qui place le focus sur le champ. */
export function FormSummary({ issues, attempt, criteriaCount, onFocusField }: SummaryProps) {
  const title = useRef<HTMLHeadingElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: chaque tentative invalide ramène le focus ici
  useEffect(() => title.current?.focus(), [attempt]);
  return (
    <Alert variant="destructive">
      <Icon name="warning" size={20} />
      <AlertTitle ref={title} tabIndex={-1} className="outline-none">
        {`Corrigez ${points(issues.length)} avant d'enregistrer`}
      </AlertTitle>
      <AlertDescription>
        <ul className="flex list-none flex-col gap-1">
          {issues.map((issue) => (
            <li key={issue.field}>
              <a
                href={`#${focusIdOf(issue.field, criteriaCount)}`}
                className="underline underline-offset-4"
                onClick={(event) => {
                  event.preventDefault();
                  onFocusField(issue.field);
                }}
              >
                {issue.message}
              </a>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

export interface SaveErrorHandlers {
  onRetry: () => void;
  onCheckList: () => void;
  onReload: () => void;
  onGotoLinks: () => void;
  onClose: () => void;
  onFocusField: (field: string) => void;
}
interface ErrorProps {
  view: SaveErrorView;
  handlers: Partial<SaveErrorHandlers>;
  /** Relectures consécutives sans nouvelle version lue (conflit de version répété). */
  unchangedReloads?: number;
  criteriaCount: number;
  /** Remplace les actions du formulaire (bloc de la page, formulaire fermé). */
  children?: React.ReactNode;
}

const LABELS: Record<SaveErrorAction, string> = {
  retry: "Réessayer",
  "check-list": "Vérifier la liste",
  reload: "Recharger la version actuelle",
  "goto-links": "Aller à Éléments liés",
  close: "Fermer",
  github: "Ouvrir la page GitHub",
  projects: "Voir les projets",
};
const HANDLER_OF: Partial<
  Record<SaveErrorAction, Exclude<keyof SaveErrorHandlers, "onFocusField">>
> = {
  retry: "onRetry",
  "check-list": "onCheckList",
  reload: "onReload",
  "goto-links": "onGotoLinks",
  close: "onClose",
};
const LINKS: Partial<Record<SaveErrorAction, string>> = {
  github: "/github",
  projects: "/projects",
};

/** Le texte, avec le lien `/github` à la place de la consigne « Vérifier l'état de l'application GitHub ». */
function TextWithLink({ view }: { view: SaveErrorView }) {
  const at = view.githubLink ? view.text.indexOf(GITHUB_STATUS_LINK) : -1;
  if (at < 0) return <p>{view.text}</p>;
  return (
    <p>
      {view.text.slice(0, at)}
      <a href="/github" className="font-medium underline underline-offset-4">
        {GITHUB_STATUS_LINK}
      </a>
    </p>
  );
}

function Diagnostics({
  report,
  onFocusField,
}: {
  report: NonNullable<SaveErrorView["report"]>;
  onFocusField: (field: string) => void;
}) {
  return (
    <>
      <ul className="flex list-none flex-col gap-1.5">
        {report.issues.slice(0, 100).map((issue, index) => {
          const field = fieldOfIssue(issue);
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: diagnostics ordonnés, sans identifiant propre
            <li key={index} className="flex flex-wrap items-baseline gap-x-2">
              {field ? (
                <a
                  href={`#${fieldId(field)}`}
                  className="underline underline-offset-4"
                  onClick={(event) => {
                    event.preventDefault();
                    onFocusField(field);
                  }}
                >
                  {issue.message}
                </a>
              ) : (
                <span>{issue.message}</span>
              )}
              <span className="font-mono text-xs">{issue.code}</span>
              {issue.entityId ? <span className="font-mono text-xs">{issue.entityId}</span> : null}
            </li>
          );
        })}
      </ul>
      {report.truncated ? <p>D'autres problèmes ne sont pas affichés.</p> : null}
    </>
  );
}

/** Échec d'enregistrement (S-feature-form §4.7) : une alerte, icône, titre, texte et actions de la table unique. */
export function SaveErrorAlert({
  view,
  handlers,
  unchangedReloads = 0,
  criteriaCount,
  children,
}: ErrorProps) {
  const field = view.field;
  const known = field && field in FIELD_LABELS ? field : null;
  return (
    <Alert variant="destructive">
      <Icon name="warning" size={20} />
      <AlertTitle>{view.title}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <TextWithLink view={view} />
        {view.requestId ? (
          <p>
            Référence : <span className="font-mono">{view.requestId}</span>
          </p>
        ) : null}
        {view.report ? (
          <Diagnostics report={view.report} onFocusField={(f) => handlers.onFocusField?.(f)} />
        ) : null}
        {field ? (
          <p className="flex flex-wrap items-center gap-2">
            <span>{`Champ : ${field}`}</span>
            {known ? (
              <a
                href={`#${focusIdOf(known, criteriaCount)}`}
                className="underline underline-offset-4"
                onClick={(event) => {
                  event.preventDefault();
                  handlers.onFocusField?.(known);
                }}
              >
                {FIELD_LABELS[known as keyof typeof FIELD_LABELS]}
              </a>
            ) : null}
          </p>
        ) : null}
        {view.kind === "stale-base" && unchangedReloads >= 1 ? (
          <p>La spec est en cours de relecture. Réessayez dans un instant.</p>
        ) : null}
        <div className="flex flex-col gap-2 md:flex-row">
          {children ??
            view.actions.map((action) => {
              const link = LINKS[action];
              const handler = HANDLER_OF[action];
              return link ? (
                <Button key={action} asChild variant="outline" className="h-11 md:h-9">
                  <a href={link}>{LABELS[action]}</a>
                </Button>
              ) : (
                <Button
                  key={action}
                  type="button"
                  variant="outline"
                  className="h-11 md:h-9"
                  onClick={handler ? handlers[handler] : undefined}
                >
                  {LABELS[action]}
                </Button>
              );
            })}
        </div>
      </AlertDescription>
    </Alert>
  );
}
