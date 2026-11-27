"use client";

import { Button, EmptyState, type IconName, Skeleton } from "@koklo/ui";
import type { ReactElement, ReactNode } from "react";
import { rateLimitedReadText } from "../lib/git-read-labels.ts";
import {
  LIST_ERROR_TEXT,
  READY_TEXT,
  READY_TITLE,
  SECURITY_ERROR_TITLE,
} from "../lib/security-labels.ts";
import { ErrorNotice } from "./error-notice.tsx";

/** Prêt (design S-spec-security §4) : l'agent peut proposer le modèle de menaces, ou l'équipe l'écrit à la main. */
export function SecurityReady({ agent, onCreate }: { agent: ReactElement; onCreate: () => void }) {
  return (
    <div className="mx-auto mt-8 flex w-full max-w-[580px] flex-col gap-3 px-4 pb-8">
      <EmptyState
        icon="shield"
        title={READY_TITLE}
        description={READY_TEXT}
        wideDescription
        action={agent}
        secondaryAction={
          <Button type="button" variant="outline" className="h-11 md:h-9" onClick={onCreate}>
            Écrire à la main
          </Button>
        }
      />
    </div>
  );
}

/** État vide d'un onglet, avec l'action de qui écrit. */
export function SecurityEmpty({
  icon,
  title,
  text,
  action,
}: {
  icon: IconName;
  title: string;
  text: string;
  action?: { label: string; onClick: () => void } | undefined;
}) {
  return (
    <EmptyState
      variant="inline"
      bordered
      icon={icon}
      title={title}
      description={text}
      {...(action
        ? {
            action: (
              <Button variant="outline" size="sm" className="max-md:h-11" onClick={action.onClick}>
                {action.label}
              </Button>
            ),
          }
        : {})}
    />
  );
}

interface TabQuery<T> {
  data: T | undefined;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

/** Une lecture d'onglet : squelette à la taille du contenu, échec avec « Réessayer » (quota compris), puis le contenu. */
export function SecurityRead<T>({
  query,
  children,
}: {
  query: TabQuery<T>;
  children: (data: T) => ReactNode;
}) {
  if (query.isError) {
    return (
      <ErrorNotice title={SECURITY_ERROR_TITLE} onRetry={() => void query.refetch()}>
        {rateLimitedReadText(query.error) ?? LIST_ERROR_TEXT}
      </ErrorNotice>
    );
  }
  if (query.data === undefined) return <Skeleton aria-busy="true" className="h-64 rounded-xl" />;
  return <>{children(query.data)}</>;
}
