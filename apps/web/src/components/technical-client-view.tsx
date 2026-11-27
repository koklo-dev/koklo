"use client";

import { Button, EmptyState, Icon, InlineAlert, Skeleton } from "@koklo/ui";
import type { Ref } from "react";
import {
  CLIENT_COMMENT_TEXT,
  CLIENT_ERROR_TEXT,
  CLIENT_LEAD,
  CLIENT_NOT_VALIDATED_TEXT,
  CLIENT_NOT_VALIDATED_TITLE,
  CLIENT_PLAIN_TEXT,
  CLIENT_STATUS,
  clientSummaryOf,
  commentTitleFor,
  TECHNICAL_ERROR_TITLE,
  type TechnicalCommentKind,
} from "../lib/technical-labels.ts";
import type { TechnicalTab } from "../lib/technical-tab.ts";
import {
  useClientDocument,
  useClientEnvironments,
  useClientStack,
  useClientTechnical,
} from "../lib/use-client-technical.ts";
import { PHONE_MAX, useMaxWidth } from "../lib/use-max-width.ts";
import { useClientOperations, useClientRequirements } from "../lib/use-technical-api.ts";
import { type TechnicalUrlModel, useTechnicalUrl } from "../lib/use-technical-url.ts";
import { CommentDialog, useCommentFlow } from "./client-comment-flow.tsx";
import { ErrorNotice } from "./error-notice.tsx";
import { type DocumentSection, SpecDocumentTab } from "./spec-document-tab.tsx";
import { ClientApiTab, ClientNfrTab } from "./technical-client-api.tsx";
import { TechnicalClientComments } from "./technical-client-comments.tsx";
import { EnvironmentsView, NO_ENVIRONMENT_TITLE } from "./technical-environments-tab.tsx";
import { TechnicalHeader } from "./technical-header.tsx";
import { StackFiche } from "./technical-stack-fiche.tsx";
import {
  StackCards,
  StackCountBar,
  StackPanel,
  selectedChoiceOf,
  usePressedChoice,
} from "./technical-stack-tab.tsx";

interface Target {
  kind: TechnicalCommentKind;
  ref: string;
  name: string;
}
type Comment = ((target: Target) => void) | undefined;
type ClientTab = Exclude<TechnicalTab, "review">;

const SKELETON = <Skeleton aria-busy="true" className="h-64 rounded-xl" />;

const failure = (retry: () => unknown) => (
  <div className="p-4 md:px-7">
    <ErrorNotice title={TECHNICAL_ERROR_TITLE} onRetry={() => void retry()}>
      {CLIENT_ERROR_TEXT}
    </ErrorNotice>
  </div>
);

const choiceTarget = (choice: { specId: string; role: string }): Target => ({
  kind: "stack",
  ref: choice.specId,
  name: choice.role,
});

/** Opérations et exigences du cahier validé : lues sur leur onglet seulement. */
function useClientApi(
  projectId: string,
  url: TechnicalUrlModel,
  tab: ClientTab,
  available: boolean,
) {
  const { q, zone, op, nfr } = url;
  const enabled = available && tab === "api";
  const operations = useClientOperations({ projectId, q, zone, op, enabled });
  const requirements = useClientRequirements({
    projectId,
    nfr,
    enabled: available && tab === "nfr",
  });
  return { operations, requirements, operation: op ?? operations.items[0]?.specId };
}

/** Données lues par les onglets du client : seul `clientSpace.*` est appelé. */
function useClientTabs(projectId: string, url: TechnicalUrlModel, available: boolean) {
  const tab: ClientTab = url.tab === "review" ? "stack" : url.tab;
  const stack = useClientStack(projectId, url.sel, available);
  const environments = useClientEnvironments(projectId, available);
  const document = useClientDocument(projectId, available && tab === "document");
  const choice = selectedChoiceOf(stack.items, url.sel);
  const current = document.sections.find((item) => item.slug === url.s) ?? document.sections[0];
  const api = useClientApi(projectId, url, tab, available);
  return { tab, stack, environments, document, choice, current, ...api };
}

type Tabs = ReturnType<typeof useClientTabs>;

const operationTarget = (id: string): Target => ({ kind: "operation", ref: id, name: id });

/** Cible de « Commenter » dans l'en-tête : l'élément ouvert de l'onglet. */
const HEADER_TARGETS: Record<ClientTab, (tabs: Tabs) => Target | undefined> = {
  stack: ({ choice }) => (choice ? choiceTarget(choice) : undefined),
  api: ({ operation }) => (operation ? operationTarget(operation) : undefined),
  nfr: () => ({ kind: "requirements", ref: "requirements", name: "Exigences" }),
  environments: () => ({ kind: "environments", ref: "environments", name: "Environnements" }),
  document: ({ current }) =>
    current ? { kind: "tech_section", ref: current.specId, name: current.title } : undefined,
};

function ClientStackTab({
  projectId,
  url,
  tabs,
  onComment,
}: {
  projectId: string;
  url: TechnicalUrlModel;
  tabs: Tabs;
  onComment: Comment;
}) {
  const { stack, choice } = tabs;
  const phone = useMaxWidth(PHONE_MAX);
  const pressed = usePressedChoice(url.sel, choice?.specId);
  if (stack.query.isError) return failure(stack.query.refetch);
  if (stack.query.isPending) return <div className="p-4 md:px-7">{SKELETON}</div>;
  const onPhone = phone && url.sel !== undefined && choice !== undefined;
  return (
    <div className="flex min-h-0 flex-1 flex-wrap xl:flex-nowrap">
      {onPhone ? null : (
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-3.5 px-4 pt-4 pb-6 md:pl-7">
          <StackCountBar total={stack.total} open={stack.open} />
          <StackCards
            items={stack.items}
            layers={stack.layers}
            selected={pressed}
            onSelect={url.select}
          />
          {stack.hasNext ? (
            <Button
              type="button"
              variant="outline"
              className="self-center max-md:h-11"
              onClick={() => void stack.query.fetchNextPage()}
            >
              Charger la suite
            </Button>
          ) : null}
        </div>
      )}
      {choice ? (
        <StackPanel
          id={choice.specId}
          asked={url.sel !== undefined}
          onClose={() => url.select(null)}
        >
          <StackFiche
            key={choice.specId}
            projectId={projectId}
            choice={choice}
            client
            onComment={onComment ? () => onComment(choiceTarget(choice)) : undefined}
          />
        </StackPanel>
      ) : null}
    </div>
  );
}

function ClientEnvironmentsTab({ tabs }: { tabs: Tabs }) {
  const { environments } = tabs;
  if (environments.isError) return failure(environments.refetch);
  if (!environments.data) return <div className="p-4 md:px-7">{SKELETON}</div>;
  return (
    <div className="px-4 pt-4 pb-6 md:px-7">
      <EnvironmentsView
        content={environments.data}
        empty={
          <EmptyState
            variant="inline"
            bordered
            icon="dns"
            title={NO_ENVIRONMENT_TITLE}
            description="L'équipe n'a encore décrit aucun environnement."
          />
        }
      />
    </div>
  );
}

function ClientDocumentTab({
  projectId,
  url,
  tabs,
  canComment,
}: {
  projectId: string;
  url: TechnicalUrlModel;
  tabs: Tabs;
  canComment: boolean;
}) {
  const { document: doc } = tabs;
  return (
    <SpecDocumentTab
      query={doc.query}
      loaded={doc.loaded}
      sections={doc.sections}
      commitSha={undefined}
      selected={url.s}
      onSelect={url.setSection}
      emptyText="L'équipe n'a pas encore rédigé le cahier technique."
      side={
        canComment
          ? (current: DocumentSection | undefined) =>
              current ? (
                <TechnicalClientComments projectId={projectId} specId={current.specId} />
              ) : null
          : undefined
      }
    />
  );
}

/** Bandeau « Lecture seule » (maquette 14 l.131-136) ; le business lit sans commenter. */
function ReadonlyBanner({ canComment }: { canComment: boolean }) {
  return (
    <div className="px-4 pt-4 md:px-7">
      <InlineAlert variant="readonly" icon="visibility" className="text-meta">
        <strong className="font-semibold">{CLIENT_LEAD}</strong>{" "}
        {canComment ? CLIENT_COMMENT_TEXT : CLIENT_PLAIN_TEXT}
      </InlineAlert>
    </div>
  );
}

interface TabProps {
  projectId: string;
  url: TechnicalUrlModel;
  tabs: Tabs;
  canComment: boolean;
  onComment: Comment;
}

/** Onglet choisi du cahier validé. */
function ClientTabContent({ projectId, url, tabs, canComment, onComment }: TabProps) {
  switch (tabs.tab) {
    case "stack":
      return <ClientStackTab projectId={projectId} url={url} tabs={tabs} onComment={onComment} />;
    case "api":
      return (
        <ClientApiTab
          projectId={projectId}
          url={url}
          list={tabs.operations}
          onComment={onComment ? (id) => onComment(operationTarget(id)) : undefined}
        />
      );
    case "nfr":
      return <ClientNfrTab url={url} list={tabs.requirements} />;
    case "environments":
      return <ClientEnvironmentsTab tabs={tabs} />;
    case "document":
      return (
        <ClientDocumentTab projectId={projectId} url={url} tabs={tabs} canComment={canComment} />
      );
  }
}

/** Corps : chargement, erreur, « en cours de validation », ou bandeau et onglet choisi. */
function ClientBody({
  query,
  ...props
}: TabProps & {
  query: ReturnType<typeof useClientTechnical>;
}) {
  if (query.isPending) return <div className="p-4 md:px-7">{SKELETON}</div>;
  if (query.isError) return failure(query.refetch);
  if (!query.data.available) {
    return (
      <div className="mx-auto mt-8 flex w-full max-w-[560px] flex-col gap-3 px-4">
        <EmptyState
          icon="schedule"
          title={CLIENT_NOT_VALIDATED_TITLE}
          description={CLIENT_NOT_VALIDATED_TEXT}
          wideDescription
        />
      </div>
    );
  }
  return (
    <>
      <ReadonlyBanner canComment={props.canComment} />
      <ClientTabContent {...props} />
    </>
  );
}

function CommentButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 w-full md:h-9 md:w-auto"
      onClick={onClick}
    >
      <Icon name="add_comment" size={20} />
      Commenter
    </Button>
  );
}

/**
 * Cahier technique validé, vu du client et du business (maquette 14 l.131-136, 800) : « Lecture seule », les cinq
 * onglets sans YAML, contrat ni écriture, « Commenter » (client seulement ; le serveur refuse le business).
 */
export function TechnicalClientView({
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
  const url = useTechnicalUrl();
  const query = useClientTechnical(projectId);
  const available = query.data?.available === true;
  const tabs = useClientTabs(projectId, url, available);
  const flow = useCommentFlow<Target>(projectId, (target) =>
    commentTitleFor(target.kind, target.name),
  );
  const onComment = canComment ? flow.open : undefined;
  const target = HEADER_TARGETS[tabs.tab](tabs);
  const counts = available ? query.data?.counts : undefined;
  return (
    <>
      <TechnicalHeader
        projectId={projectId}
        name={name}
        titleRef={titleRef}
        reviewing={false}
        tab={tabs.tab}
        {...(counts
          ? {
              status: "validated" as const,
              statusLabel: CLIENT_STATUS,
              summary: clientSummaryOf(counts),
              tabCounts: {
                stack: { value: counts.choices },
                api: { value: counts.operations },
                nfr: { value: counts.requirements },
                environments: { value: counts.environments },
              },
              secondaryActions:
                onComment && target ? <CommentButton onClick={() => onComment(target)} /> : null,
            }
          : {})}
      />
      <ClientBody
        projectId={projectId}
        query={query}
        url={url}
        tabs={tabs}
        canComment={canComment}
        onComment={onComment}
      />
      <span role="status" className="sr-only">
        {flow.announcement}
      </span>
      <CommentDialog flow={flow} />
    </>
  );
}
