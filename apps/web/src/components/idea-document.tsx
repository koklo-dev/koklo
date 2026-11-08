"use client";

import type { IdeaPage, IdeaPageSummary, IdeaProposal } from "@koklo/contract";
import { Button, PageStatus, Prose, ProsePath, Skeleton } from "@koklo/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { StorageScope } from "../lib/feature-draft.ts";
import { ideaFile, modifiedLine, type SaveState } from "../lib/idea-labels.ts";
import { orpc } from "../lib/orpc.ts";
import type { IdeaAgent } from "../lib/use-idea-agent.ts";
import { useIdeaAutosave } from "../lib/use-idea-autosave.ts";
import type { IdeaModel } from "../lib/use-idea-page.ts";
import { IdeaConflictNotice } from "./idea-conflict.tsx";
import { IdeaEditor } from "./idea-editor.tsx";
import { IdeaProposals } from "./idea-proposals.tsx";
import { IdeaLoadError } from "./idea-states.tsx";

function TitleField({
  page,
  editable,
  autoFocus,
  onRename,
}: {
  page: IdeaPage;
  editable: boolean;
  autoFocus: boolean;
  onRename: (title: string) => void;
}) {
  const [value, setValue] = useState(page.title);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setValue(page.title), [page.title]);
  useEffect(() => {
    if (!autoFocus) return;
    // Après la fermeture du menu de page, qui retient le focus tant qu'il est ouvert.
    const frame = requestAnimationFrame(() => input.current?.select());
    return () => cancelAnimationFrame(frame);
  }, [autoFocus]);
  const commit = () => {
    const title = value.trim();
    if (title && title !== page.title) onRename(title);
    else setValue(page.title);
  };
  return (
    <h2 className="text-settings-title">
      <input
        ref={input}
        aria-label="Titre de la page"
        value={value}
        readOnly={!editable}
        maxLength={120}
        onChange={(event) => setValue(event.target.value.replace(/[\r\n]/g, ""))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "Escape") setValue(page.title);
        }}
        className="w-full rounded-md bg-transparent [font:inherit] tracking-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </h2>
  );
}

function StatusLine({ summary, model }: { summary: IdeaPageSummary; model: IdeaModel }) {
  const next = summary.status === "stable" ? "draft" : "stable";
  const label = summary.status === "stable" ? "Rouvrir" : "Marquer comme stable";
  return (
    <div className="flex flex-wrap items-center gap-2.5 text-meta text-muted-foreground">
      <PageStatus status={summary.status} pill />
      <span>{modifiedLine(summary)}</span>
      {model.canWrite && summary.status !== "empty" ? (
        <Button
          type="button"
          variant="text"
          className="max-md:h-11"
          disabled={model.actions.setStatus.isPending}
          onClick={() =>
            model.actions.setStatus.mutate({
              projectId: model.projectId,
              pageId: summary.id,
              status: next,
            })
          }
        >
          {label}
        </Button>
      ) : null}
    </div>
  );
}

interface BodyProps {
  model: IdeaModel;
  summary: IdeaPageSummary;
  page: IdeaPage;
  proposals: IdeaProposal[];
  agent: IdeaAgent;
  scope: StorageScope;
  renameFocus: boolean;
  onSaveState: (state: SaveState, flush: () => Promise<void>) => void;
}

const ASK_AGAIN = "Refais ta proposition à partir de la version actuelle de cette page.";

function DocumentBody({
  model,
  summary,
  page,
  proposals,
  agent,
  scope,
  renameFocus,
  onSaveState,
}: BodyProps) {
  const editable = model.canWrite;
  const autosave = useIdeaAutosave({ projectId: model.projectId, page, scope, editable });
  const { state, flush } = autosave;
  useEffect(() => onSaveState(state, flush), [state, flush, onSaveState]);
  // Une sauvegarde qui change la version périme les propositions (B223) : on le montre sans attendre la relecture.
  const [edited, setEdited] = useState(false);
  useEffect(() => {
    if (state === "saving" || state === "saved") setEdited(true);
  }, [state]);
  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-[18px]">
      <div className="flex flex-col gap-2">
        <ProsePath>{ideaFile(summary.slug)}</ProsePath>
        <Prose className="gap-0">
          <TitleField
            page={page}
            editable={editable}
            autoFocus={renameFocus}
            onRename={(title) =>
              model.actions.rename.mutate({ projectId: model.projectId, pageId: page.id, title })
            }
          />
        </Prose>
        <StatusLine summary={summary} model={model} />
      </div>
      {autosave.conflict ? (
        <IdeaConflictNotice
          conflict={autosave.conflict}
          onKeepMine={autosave.keepMine}
          onTakeTheirs={autosave.takeTheirs}
        />
      ) : null}
      <IdeaProposals
        proposals={proposals}
        page={page}
        decisions={model.decisions}
        stale={edited}
        onAskAgain={agent.available ? () => void agent.send({ text: ASK_AGAIN }) : undefined}
      >
        {(slots, renderSlot) => (
          <IdeaEditor
            page={page}
            editable={editable}
            replacement={autosave.replacement}
            onChange={autosave.change}
            onBlur={() => void autosave.flush()}
            slots={slots}
            renderSlot={renderSlot}
            onAgentAction={agent.available ? agent.act : undefined}
          />
        )}
      </IdeaProposals>
    </div>
  );
}

/** Document de la page ouverte (lecture à l'ouverture, jamais en cache d'une visite à l'autre), remonté à chaque page. */
export function IdeaDocument({
  model,
  summary,
  scope,
  renameFocus,
  onSaveState,
  agent,
}: {
  model: IdeaModel;
  summary: IdeaPageSummary;
  agent: IdeaAgent;
  scope: StorageScope | null;
  renameFocus: boolean;
  onSaveState: BodyProps["onSaveState"];
}) {
  const query = useQuery({
    ...orpc.idea.get.queryOptions({ input: { projectId: model.projectId, pageId: summary.id } }),
    gcTime: 0,
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (query.isError) return <IdeaLoadError onRetry={() => void query.refetch()} />;
  if (!query.data || !scope) return <DocumentSkeleton />;
  return (
    <DocumentBody
      // La version change quand une proposition est acceptée ou annulée : l'éditeur recharge le contenu.
      key={`${summary.id}:${query.data.version}`}
      model={model}
      summary={summary}
      agent={agent}
      page={query.data}
      proposals={query.data.proposals}
      scope={scope}
      renameFocus={renameFocus}
      onSaveState={onSaveState}
    />
  );
}

export function DocumentSkeleton() {
  return (
    <div
      aria-busy="true"
      className="mx-auto flex w-full max-w-[680px] flex-col gap-4"
      data-testid="idea-skeleton"
    >
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
