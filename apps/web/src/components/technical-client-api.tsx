"use client";

import { Skeleton } from "@koklo/ui";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/orpc.ts";
import { LIST_ERROR_TEXT, OPERATION_ERROR_TITLE } from "../lib/technical-api-labels.ts";
import { asSpecItem } from "../lib/use-client-technical.ts";
import { useSearchBox } from "../lib/use-features-list.ts";
import type { OperationListModel, RequirementListModel } from "../lib/use-technical-api.ts";
import type { TechnicalUrlModel } from "../lib/use-technical-url.ts";
import { ErrorNotice } from "./error-notice.tsx";
import { OperationBrowser } from "./technical-api-tab.tsx";
import { RequirementBrowser } from "./technical-nfr-tab.tsx";
import { OperationFiche } from "./technical-operation-fiche.tsx";

/** Onglets API et Exigences du cahier validé (maquette 14 l.131-136) : `clientSpace.*` seul, aucun fichier. */
function ClientDetail({
  projectId,
  opId,
  onComment,
}: {
  projectId: string;
  opId: string;
  onComment: ((opId: string) => void) | undefined;
}) {
  const query = useQuery(orpc.clientSpace.technicalOp.queryOptions({ input: { projectId, opId } }));
  if (query.isError) {
    return (
      <ErrorNotice title={OPERATION_ERROR_TITLE} onRetry={() => void query.refetch()}>
        {LIST_ERROR_TEXT}
      </ErrorNotice>
    );
  }
  if (!query.data) return <Skeleton aria-busy="true" className="h-64 rounded-xl" />;
  const { operation } = query.data;
  if (!operation) return null;
  return (
    <OperationFiche
      key={opId}
      projectId={projectId}
      operation={asSpecItem(operation)}
      client
      onComment={onComment ? () => onComment(opId) : undefined}
    />
  );
}

export function ClientApiTab({
  projectId,
  url,
  list,
  onComment,
}: {
  projectId: string;
  url: TechnicalUrlModel;
  list: OperationListModel;
  onComment: ((opId: string) => void) | undefined;
}) {
  const search = useSearchBox(url);
  return (
    <OperationBrowser
      url={url}
      list={list}
      search={search}
      detail={(opId) => <ClientDetail projectId={projectId} opId={opId} onComment={onComment} />}
    />
  );
}

export function ClientNfrTab({
  url,
  list,
}: {
  url: TechnicalUrlModel;
  list: RequirementListModel;
}) {
  return <RequirementBrowser list={list} asked={url.nfr} />;
}
