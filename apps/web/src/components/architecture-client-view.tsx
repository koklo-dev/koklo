"use client";

import { Button, EmptyState, Icon, InlineAlert, Skeleton } from "@koklo/ui";
import { type Ref, useRef, useState } from "react";
import {
  CLIENT_ARCHITECTURE_ERROR_TEXT,
  CLIENT_ARCHITECTURE_ERROR_TITLE,
  CLIENT_ARCHITECTURE_STATUS,
  CLIENT_COMMENT_SENT,
  CLIENT_NOT_VALIDATED_TEXT,
  CLIENT_NOT_VALIDATED_TITLE,
  CLIENT_READONLY_COMMENT_TEXT,
  CLIENT_READONLY_LEAD,
  CLIENT_READONLY_PLAIN_TEXT,
  clientArchitectureSummary,
  clientCommentTitle,
} from "../lib/architecture-client-labels.ts";
import type { ArchitectureTab } from "../lib/architecture-tab.ts";
import { useArchitectureUrl } from "../lib/use-architecture-url.ts";
import {
  useArchitectureComment,
  useClientArchitecture,
  useClientDecisions,
  useClientFlows,
} from "../lib/use-client-architecture.ts";
import {
  ClientComponents,
  ClientDecisionsTab,
  ClientFlowsTab,
  ClientSchema,
  type CommentTarget,
} from "./architecture-client-tabs.tsx";
import { ArchitectureHeader } from "./architecture-header.tsx";
import { DataCommentDialog } from "./data-comment-dialog.tsx";
import { ErrorNotice } from "./error-notice.tsx";
import { PageBody } from "./page-body.tsx";

/** Bandeau « Lecture seule » (maquette 13 l.132-137, `role="note"`) ; le business lit sans commenter. */
function ReadonlyBanner({ canComment }: { canComment: boolean }) {
  return (
    <InlineAlert variant="readonly" icon="visibility" className="text-meta">
      <strong className="font-semibold">{CLIENT_READONLY_LEAD}</strong>{" "}
      {canComment ? CLIENT_READONLY_COMMENT_TEXT : CLIENT_READONLY_PLAIN_TEXT}
    </InlineAlert>
  );
}

/** Flux « Commenter » : cible nommée, ouverture (le bouton d'origine reprend le focus à la fermeture), envoi, annonce. */
function useCommentFlow(projectId: string) {
  const comment = useArchitectureComment(projectId);
  const [target, setTarget] = useState<CommentTarget | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const opener = useRef<HTMLElement | null>(null);
  return {
    announcement,
    target,
    pending: comment.pending,
    failed: comment.failed,
    open: (next: CommentTarget) => {
      opener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      comment.reset();
      setAnnouncement("");
      setTarget(next);
    },
    close: () => setTarget(null),
    restoreFocus: () => opener.current?.focus(),
    submit: async (body: string) => {
      if (target && (await comment.send({ kind: target.kind, ref: target.ref }, body))) {
        setTarget(null);
        setAnnouncement(CLIENT_COMMENT_SENT);
      }
    },
  };
}

type Flow = ReturnType<typeof useCommentFlow>;

function CommentDialog({ flow }: { flow: Flow }) {
  if (!flow.target) return null;
  return (
    <DataCommentDialog
      open
      title={clientCommentTitle(flow.target.kind, flow.target.name)}
      pending={flow.pending}
      failed={flow.failed}
      onOpenChange={(next) => next || flow.close()}
      onSubmit={(body) => void flow.submit(body)}
      restoreFocus={flow.restoreFocus}
    />
  );
}

const SKELETON = <Skeleton aria-busy="true" className="h-64 rounded-xl" />;

type ClientData = {
  query: ReturnType<typeof useClientArchitecture>;
  decisions: ReturnType<typeof useClientDecisions>;
  flows: ReturnType<typeof useClientFlows>;
};
type ClientTab = Exclude<ArchitectureTab, "review" | "document">;

/** Onglets du client : le Document et la Relecture n'existent pas pour lui (B581). */
const clientTabOf = (tab: ArchitectureTab): ClientTab =>
  tab === "review" || tab === "document" ? "schema" : tab;

/** En-tête du client : statut « Validé par l'équipe · lecture seule », résumé, compteurs, « Commenter » (client seul). */
function ClientHeader({
  projectId,
  name,
  titleRef,
  tab,
  data,
  onComment,
  target,
}: {
  projectId: string;
  name: string | undefined;
  titleRef: Ref<HTMLHeadingElement>;
  tab: ClientTab;
  data: ClientData;
  onComment: ((target: CommentTarget) => void) | undefined;
  target: CommentTarget | undefined;
}) {
  const { query, decisions, flows } = data;
  const available = query.data?.available === true;
  const count = query.data?.items.length ?? 0;
  const counted = {
    decisions: decisions.query.data ? decisions.total : undefined,
    flows: flows.query.data ? flows.total : undefined,
  };
  return (
    <ArchitectureHeader
      projectId={projectId}
      name={name}
      titleRef={titleRef}
      reviewing={false}
      team={false}
      client
      head={undefined}
      tab={tab}
      {...(available
        ? {
            status: "validated" as const,
            statusLabel: CLIENT_ARCHITECTURE_STATUS,
            summary: clientArchitectureSummary({ components: count, ...counted }),
            tabCounts: {
              components: { value: count },
              ...(counted.decisions === undefined
                ? {}
                : { decisions: { value: counted.decisions } }),
              ...(counted.flows === undefined ? {} : { flows: { value: counted.flows } }),
            },
          }
        : {})}
      {...(available && onComment && target
        ? {
            secondaryActions: (
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full md:h-9 md:w-auto"
                onClick={() => onComment(target)}
              >
                <Icon name="add_comment" size={20} />
                Commenter
              </Button>
            ),
          }
        : {})}
    />
  );
}

/** Corps : chargement, erreur, « pas encore validée », ou bandeau et onglet choisi. */
function ClientBody({
  projectId,
  tab,
  data,
  url,
  canComment,
  onComment,
}: {
  projectId: string;
  tab: ClientTab;
  data: ClientData;
  url: ReturnType<typeof useArchitectureUrl>;
  canComment: boolean;
  onComment: ((target: CommentTarget) => void) | undefined;
}) {
  const { query, decisions, flows } = data;
  if (query.isPending) return SKELETON;
  if (query.isError) {
    return (
      <ErrorNotice title={CLIENT_ARCHITECTURE_ERROR_TITLE} onRetry={() => void query.refetch()}>
        {CLIENT_ARCHITECTURE_ERROR_TEXT}
      </ErrorNotice>
    );
  }
  if (!query.data.available) {
    return (
      <div className="mx-auto mt-8 flex w-full max-w-[560px] flex-col gap-3">
        <EmptyState
          icon="schedule"
          title={CLIENT_NOT_VALIDATED_TITLE}
          description={CLIENT_NOT_VALIDATED_TEXT}
          wideDescription
        />
      </div>
    );
  }
  const model = query.data;
  return (
    <div className="flex flex-col gap-4">
      <ReadonlyBanner canComment={canComment} />
      {tab === "schema" ? <ClientSchema model={model} url={url} onComment={onComment} /> : null}
      {tab === "components" ? <ClientComponents model={model} onComment={onComment} /> : null}
      {tab === "decisions" ? (
        <ClientDecisionsTab
          projectId={projectId}
          decisions={decisions}
          url={url}
          onComment={onComment}
        />
      ) : null}
      {tab === "flows" ? (
        <ClientFlowsTab projectId={projectId} flows={flows} url={url} onComment={onComment} />
      ) : null}
    </div>
  );
}

/**
 * Architecture validée, vue du client et du business (`/projects/<id>/spec/architecture`, maquette 13 l.132-137, 865) :
 * bandeau « Lecture seule », Schéma, Composants, Décisions et Flux sans Document ni Relecture, « En clair » et
 * « Commenter » (client seulement ; le serveur refuse le business). Seul `clientSpace.*` est lu : jamais YAML, Mermaid,
 * chemin, SHA ni proposition.
 */
export function ArchitectureClientView({
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
  const url = useArchitectureUrl();
  const query = useClientArchitecture(projectId);
  const available = query.data?.available === true;
  const decisions = useClientDecisions(projectId, url.d, available, {
    q: url.q,
    status: url.status,
  });
  const flows = useClientFlows(projectId, url.f, available);
  const flow = useCommentFlow(projectId);
  const tab = clientTabOf(url.tab);
  const data = { query, decisions, flows };
  const onComment = canComment ? flow.open : undefined;
  // « Commenter » de l'en-tête vise l'élément choisi de l'onglet, sinon le premier.
  const target = headerTargetOf(tab, {
    url,
    items: query.data?.items ?? [],
    decisions: decisions.items,
    flows: flows.items,
  });
  return (
    <>
      <ClientHeader
        projectId={projectId}
        name={name}
        titleRef={titleRef}
        tab={tab}
        data={data}
        onComment={onComment}
        target={target}
      />
      <PageBody>
        <ClientBody
          projectId={projectId}
          tab={tab}
          data={data}
          url={url}
          canComment={canComment}
          onComment={onComment}
        />
      </PageBody>
      <span role="status" className="sr-only">
        {flow.announcement}
      </span>
      <CommentDialog flow={flow} />
    </>
  );
}

function headerTargetOf(
  tab: string,
  ctx: {
    url: {
      sel?: string | undefined;
      c?: string | undefined;
      d?: string | undefined;
      f?: string | undefined;
    };
    items: ReadonlyArray<{ id: string; name: string }>;
    decisions: ReadonlyArray<{ id: string; title: string }>;
    flows: ReadonlyArray<{ specId: string; title: string }>;
  },
): CommentTarget | undefined {
  if (tab === "decisions") {
    const row = ctx.decisions.find((item) => item.id === ctx.url.d) ?? ctx.decisions[0];
    return row ? { kind: "adr", ref: row.id, name: row.title } : undefined;
  }
  if (tab === "flows") {
    const row = ctx.flows.find((item) => item.specId === ctx.url.f) ?? ctx.flows[0];
    return row ? { kind: "archflow", ref: row.specId, name: row.title } : undefined;
  }
  const item = ctx.items.find((entry) => entry.id === (ctx.url.sel ?? ctx.url.c)) ?? ctx.items[0];
  return item ? { kind: "component", ref: item.id, name: item.name } : undefined;
}
