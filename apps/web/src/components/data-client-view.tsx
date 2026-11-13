"use client";

import type { ClientSpaceDataModel } from "@koklo/contract";
import { Button, EmptyState, Icon, InlineAlert, Skeleton } from "@koklo/ui";
import { type Ref, useRef, useState } from "react";
import {
  CLIENT_DATA_STATUS,
  CLIENT_LOAD_ERROR_TEXT,
  CLIENT_LOAD_ERROR_TITLE,
  COMMENT_BUTTON,
  COMMENT_SENT,
  clientSummaryOf,
  NOT_VALIDATED_TEXT,
  NOT_VALIDATED_TITLE,
  READONLY_COMMENT_TEXT,
  READONLY_LEAD,
  READONLY_PLAIN_TEXT,
} from "../lib/data-client-labels.ts";
import type { DataTab } from "../lib/data-tab.ts";
import { useClientDataModel, useClientFixtures, useTableComment } from "../lib/use-client-data.ts";
import { useDataUrl } from "../lib/use-data-url.ts";
import { ClientDiagram, ClientFixtures, ClientTables } from "./data-client-tabs.tsx";
import { DataCommentDialog } from "./data-comment-dialog.tsx";
import { DataHeader } from "./data-header.tsx";
import { ErrorNotice } from "./error-notice.tsx";
import { PageBody } from "./page-body.tsx";

type Model = ReturnType<typeof useClientDataModel>;

/** Bandeau « Lecture seule » (maquette 11 l.160-167) ; le business lit sans commenter. */
function ReadonlyBanner({ canComment }: { canComment: boolean }) {
  return (
    <InlineAlert variant="readonly" icon="visibility" className="text-meta">
      <strong className="font-semibold">{READONLY_LEAD}</strong>{" "}
      {canComment ? READONLY_COMMENT_TEXT : READONLY_PLAIN_TEXT}
    </InlineAlert>
  );
}

interface SharedProps {
  projectId: string;
  tab: DataTab;
  url: ReturnType<typeof useDataUrl>;
  canComment: boolean;
  onComment: (tableId: string) => void;
}

function TabBody({
  projectId,
  model,
  tab,
  url,
  canComment,
  onComment,
}: SharedProps & { model: ClientSpaceDataModel }) {
  if (tab === "tables") return <ClientTables model={model} onOpen={url.openDiagram} />;
  if (tab === "fixtures") return <ClientFixtures projectId={projectId} />;
  return <ClientDiagram model={model} url={url} onComment={canComment ? onComment : undefined} />;
}

/** Corps de la vue : chargement, erreur, « pas encore validé », ou bandeau et onglet choisi. */
function Body({ query, ...props }: SharedProps & { query: Model }) {
  const { canComment } = props;
  if (query.isPending) return <Skeleton aria-busy="true" className="h-64 rounded-xl" />;
  if (query.isError) {
    return (
      <ErrorNotice title={CLIENT_LOAD_ERROR_TITLE} onRetry={() => void query.refetch()}>
        {CLIENT_LOAD_ERROR_TEXT}
      </ErrorNotice>
    );
  }
  if (!query.data.available) {
    return (
      <div className="mx-auto mt-8 flex w-full max-w-[560px] flex-col gap-3">
        <EmptyState
          icon="schedule"
          title={NOT_VALIDATED_TITLE}
          description={NOT_VALIDATED_TEXT}
          wideDescription
        />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <ReadonlyBanner canComment={canComment} />
      <TabBody {...props} model={query.data} />
    </div>
  );
}

/** Flux « Commenter » : table visée, ouverture (le bouton d'origine reprend le focus à la fermeture), envoi, annonce. */
function useCommentFlow(projectId: string, items: ClientSpaceDataModel["items"]) {
  const comment = useTableComment(projectId);
  const [target, setTarget] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const opener = useRef<HTMLElement | null>(null);
  return {
    announcement,
    tableName: items.find((table) => table.id === target)?.name,
    pending: comment.pending,
    failed: comment.failed,
    isOpen: target !== null,
    open: (tableId: string) => {
      opener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      comment.reset();
      setAnnouncement("");
      setTarget(tableId);
    },
    close: () => setTarget(null),
    restoreFocus: () => opener.current?.focus(),
    submit: async (body: string) => {
      if (target && (await comment.send(target, body))) {
        setTarget(null);
        setAnnouncement(COMMENT_SENT);
      }
    },
  };
}

type Flow = ReturnType<typeof useCommentFlow>;

/** Bouton « Commenter » de l'en-tête (maquette 11 l.596) : 44 px pleine largeur sous 768 px. */
function HeaderComment({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 w-full md:h-9 md:w-auto"
      onClick={onClick}
    >
      <Icon name="add_comment" size={20} />
      {COMMENT_BUTTON}
    </Button>
  );
}

function CommentDialog({ flow }: { flow: Flow }) {
  if (!flow.isOpen || !flow.tableName) return null;
  return (
    <DataCommentDialog
      open
      tableName={flow.tableName}
      pending={flow.pending}
      failed={flow.failed}
      onOpenChange={(next) => next || flow.close()}
      onSubmit={(body) => void flow.submit(body)}
      restoreFocus={flow.restoreFocus}
    />
  );
}

/**
 * Modèle de données validé, vu du client et du business (`/projects/<id>/spec/data`, maquette 11 l.160-261, 596) :
 * bandeau « Lecture seule », Diagramme, Tables et Jeux d'exemple sans Relecture, fiche « Ce qu'on enregistre » et
 * « Commenter » (client seulement ; le serveur refuse le business). Rien de ce que l'équipe seule lit n'est demandé.
 */
export function DataClientView({
  projectId,
  name,
  titleRef,
  canComment,
}: {
  projectId: string;
  name: string | undefined;
  titleRef: Ref<HTMLHeadingElement>;
  canComment: boolean;
}) {
  const url = useDataUrl();
  const query = useClientDataModel(projectId);
  const available = query.data?.available === true;
  const fixtures = useClientFixtures(projectId, available);
  const flow = useCommentFlow(projectId, query.data?.items ?? []);
  const items = query.data?.items ?? [];
  const tab: DataTab = url.tab === "review" ? "diagram" : url.tab;
  // « Commenter » de l'en-tête vise la table choisie dans le diagramme, sinon la première.
  const headerTarget = items.find((table) => table.id === url.sel) ?? items[0];
  return (
    <>
      <DataHeader
        projectId={projectId}
        name={name}
        titleRef={titleRef}
        reviewing={false}
        team={false}
        head={undefined}
        tab={tab}
        {...(available
          ? {
              status: "validated" as const,
              statusLabel: CLIENT_DATA_STATUS,
              summary: clientSummaryOf(items.length),
              tabCounts: {
                tables: { value: items.length },
                ...(fixtures.data ? { fixtures: { value: fixtures.data.items.length } } : {}),
              },
            }
          : {})}
        {...(available && canComment && headerTarget
          ? { secondaryActions: <HeaderComment onClick={() => flow.open(headerTarget.id)} /> }
          : {})}
      />
      <PageBody>
        <Body
          query={query}
          projectId={projectId}
          tab={tab}
          url={url}
          canComment={canComment}
          onComment={flow.open}
        />
      </PageBody>
      <span role="status" className="sr-only">
        {flow.announcement}
      </span>
      <CommentDialog flow={flow} />
    </>
  );
}
