"use client";

import type { TechnicalEnvironments } from "@koklo/contract";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  EnvironmentTable,
  SpecRowsPanel,
} from "@koklo/ui";
import type { ReactNode } from "react";
import { rateLimitedReadText } from "../lib/git-read-labels.ts";
import { environmentRowsOf, INTEGRATION_PILLS } from "../lib/technical-labels.ts";
import type { TechnicalPageModel } from "../lib/use-technical-page.ts";
import { ErrorNotice } from "./error-notice.tsx";

type Content = Pick<TechnicalEnvironments, "environments" | "variables" | "integrations">;

/** « Variables et secrets » (noms seuls) et « Intégrations externes », côte à côte quand la place le permet. */
function Panels({ content }: { content: Content }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] gap-4">
      <SpecRowsPanel
        icon="key"
        title="Variables et secrets"
        note="Noms seulement : aucune valeur dans la spec"
        mono
        emptyText="Aucune variable pour l'instant."
        rows={content.variables.map(({ name, usage }) => ({
          name,
          usage,
          pill: { label: "Coffre de l'hébergeur", tone: "outline" as const },
        }))}
      />
      <SpecRowsPanel
        icon="cable"
        title="Intégrations externes"
        emptyText="Aucune intégration externe pour l'instant."
        rows={content.integrations.map(({ service, usage, status }) => ({
          name: service,
          usage,
          pill: INTEGRATION_PILLS[status],
        }))}
      />
    </div>
  );
}

/** Tableau et panneaux des environnements (maquette 14 l.280-300), communs à l'équipe et au client. */
export function EnvironmentsView({
  content,
  action,
  empty,
}: {
  content: Content;
  action?: ReactNode;
  empty: ReactNode;
}) {
  const { environments } = content;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {environments.length === 0 ? (
        empty
      ) : (
        <EnvironmentTable
          title="Environnements"
          columns={environments.map(({ specId, name }) => ({ id: specId, name }))}
          rows={environmentRowsOf(environments)}
          action={action}
        />
      )}
      <Panels content={content} />
    </div>
  );
}

export const NO_ENVIRONMENT_TITLE = "Aucun environnement pour l'instant";

/** « Modifier » de la légende : menu des environnements, puis la feuille de celui choisi. */
function EditMenu({
  environments,
  onEdit,
}: {
  environments: Content["environments"];
  onEdit: (id: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="max-md:h-11">
          Modifier
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {environments.map(({ specId, name }) => (
          <DropdownMenuItem key={specId} onSelect={() => onEdit(specId)}>
            {name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Empty({ onCreate }: { onCreate: (() => void) | undefined }) {
  return (
    <EmptyState
      variant="inline"
      bordered
      icon="dns"
      title={NO_ENVIRONMENT_TITLE}
      description="Développement, recette, production : adresse, hébergement, base et données de chacun."
      {...(onCreate
        ? {
            action: (
              <Button variant="outline" size="sm" onClick={onCreate}>
                Nouvel environnement
              </Button>
            ),
          }
        : {})}
    />
  );
}

/** Onglet Environnements de l'équipe. */
export function TechnicalEnvironmentsTab({ page }: { page: TechnicalPageModel }) {
  const { environments: query, form, url } = page;
  if (query.isError) {
    return (
      <div className="p-4 md:px-7">
        <ErrorNotice
          title="Impossible de charger les environnements"
          onRetry={() => void query.refetch()}
        >
          {rateLimitedReadText(query.error) ?? "Réessayez dans un instant."}
        </ErrorNotice>
      </div>
    );
  }
  const content = query.data;
  if (!content) return null;
  return (
    <div className="px-4 pt-4 pb-6 md:px-7">
      <EnvironmentsView
        content={content}
        action={
          form.canWrite ? (
            <EditMenu environments={content.environments} onEdit={form.openEdit} />
          ) : undefined
        }
        empty={
          <Empty onCreate={form.canWrite ? () => url.openCreateOn("environments") : undefined} />
        }
      />
    </div>
  );
}
