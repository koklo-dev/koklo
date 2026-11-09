"use client";

import type { IdeaPageSummary } from "@koklo/contract";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import type { StorageScope } from "../lib/feature-draft.ts";
import { editorOf, focusWhenReady } from "../lib/idea-focus.ts";
import { moveAnnouncement, numberedTitle, type SaveState } from "../lib/idea-labels.ts";
import { arrayMoveIds } from "../lib/idea-order.ts";
import { ideaPath } from "../lib/shell-routes.ts";
import { type IdeaAgent, useIdeaAgent } from "../lib/use-idea-agent.ts";
import { useIdeaFreeze } from "../lib/use-idea-freeze.ts";
import { type IdeaModel, useIdeaPage } from "../lib/use-idea-page.ts";
import { useIdeaPresence } from "../lib/use-idea-presence.ts";
import { useIdeaPublish } from "../lib/use-idea-publish.ts";
import { type IdeaSynthesisModel, useIdeaSynthesis } from "../lib/use-idea-synthesis.ts";
import { useProjectShell } from "../lib/use-project-shell.ts";
import { useBeginFeatureSession, useStorageScope } from "../lib/use-storage-scope.ts";
import { ProjectNotFound } from "./features-empty.tsx";
import { IdeaAgentPanel } from "./idea-agent-panel.tsx";
import { DocumentSkeleton, IdeaDocument } from "./idea-document.tsx";
import { type FramingActions, IdeaFramingNotices } from "./idea-freeze-confirm.tsx";
import { FREEZE_BUTTON_ID, IdeaHeader, IdeaPublishNotice } from "./idea-header.tsx";
import { IdeaEmpty, IdeaLoadError, IdeaSkeleton } from "./idea-states.tsx";
import { IdeaSynthesis } from "./idea-synthesis.tsx";
import { IdeaTreeDesktop, IdeaTreeMobile, type TreeHandlers } from "./idea-tree.tsx";

function useTreeHandlers(
  model: ReturnType<typeof useIdeaPage>,
  announce: (text: string) => void,
  onRenameRequest: (pageId: string) => void,
) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<IdeaPageSummary | null>(null);
  const open = useCallback(
    (slug: string) => router.push(`${ideaPath(model.projectId)}?page=${slug}`),
    [router, model.projectId],
  );
  const create = useCallback(
    async (afterPageId?: string) => {
      const page = await model.actions.create.mutateAsync({
        projectId: model.projectId,
        title: "Page sans titre",
        ...(afterPageId ? { afterPageId } : {}),
      });
      open(page.slug);
      onRenameRequest(page.id);
      announce("Page ajoutée");
    },
    [model.actions.create, model.projectId, open, onRenameRequest, announce],
  );
  const handlers: TreeHandlers = {
    deleting,
    onAdd: () => void create(),
    onInsertAfter: (page) => void create(page.id),
    onRename: (page) => {
      open(page.slug);
      onRenameRequest(page.id);
    },
    onMove: (page, direction) => {
      const ids = arrayMoveIds(
        model.pages.map((p) => p.id),
        page.id,
        direction,
      );
      if (!ids) return;
      void model.actions.reorder(ids);
      const position = ids.indexOf(page.id) + 1;
      announce(moveAnnouncement(page.title, position, ids.length));
    },
    onAskDelete: setDeleting,
    onConfirmDelete: () => {
      if (!deleting) return;
      const target = deleting;
      setDeleting(null);
      model.actions.remove.mutate(
        { projectId: model.projectId, pageId: target.id },
        {
          onSuccess: () => {
            announce(`Page ${numberedTitle(target.title, 0).slice(5)} supprimée`);
            const first = model.pages.find((p) => p.id !== target.id);
            if (model.current?.id === target.id && first) open(first.slug);
          },
        },
      );
    },
  };
  return { handlers, open };
}

interface Framing {
  freeze: ReturnType<typeof useIdeaFreeze>;
  actions: FramingActions;
}

function ArticleContent({
  model,
  scope,
  renameId,
  onSaveState,
  open,
  agent,
  synthesis,
}: {
  model: IdeaModel;
  scope: StorageScope | null;
  renameId: string | null;
  onSaveState: (state: SaveState, flush: () => Promise<void>) => void;
  open: (slug: string) => void;
  agent: IdeaAgent;
  synthesis: IdeaSynthesisModel;
}) {
  const first = model.pages[0];
  if (model.synthesisOpen) return <IdeaSynthesis model={model} synthesis={synthesis} />;
  if (model.pages.every((p) => p.status === "empty") && model.slug === null && first)
    return <IdeaEmpty onStart={() => open(first.slug)} />;
  if (!model.current) return <DocumentSkeleton />;
  return (
    <IdeaDocument
      model={model}
      summary={model.current}
      scope={scope}
      renameFocus={renameId === model.current.id}
      onSaveState={onSaveState}
      agent={agent}
    />
  );
}

function IdeaBody({
  model,
  scope,
  publish,
  framing,
  synthesis,
  renameId,
  onSaveState,
  open,
  handlers,
  announcement,
  agent,
}: {
  model: IdeaModel;
  scope: StorageScope | null;
  publish: ReturnType<typeof useIdeaPublish>;
  framing: Framing;
  synthesis: IdeaSynthesisModel;
  renameId: string | null;
  onSaveState: (state: SaveState, flush: () => Promise<void>) => void;
  open: (slug: string) => void;
  handlers: TreeHandlers;
  announcement: string;
  agent: IdeaAgent;
}) {
  return (
    <>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <div className="flex min-w-0 flex-col lg:min-h-0 lg:flex-1 lg:flex-row">
        <IdeaTreeDesktop model={model} handlers={handlers} />
        <IdeaTreeMobile model={model} handlers={handlers} />
        <article
          aria-label="Page du dossier"
          className="flex min-w-0 flex-1 flex-col gap-4 px-4 py-7 md:px-10 md:pb-12 lg:overflow-y-auto [&>*]:shrink-0"
        >
          <IdeaFramingNotices
            model={model}
            freeze={framing.freeze.state}
            actions={framing.actions}
          />
          <IdeaPublishNotice
            model={model}
            publish={publish.state}
            onRetry={() => void publish.publish()}
          />
          <ArticleContent
            model={model}
            scope={scope}
            renameId={renameId}
            onSaveState={onSaveState}
            open={open}
            agent={agent}
            synthesis={synthesis}
          />
        </article>
        {model.canWrite && !model.synthesisOpen ? (
          <IdeaAgentPanel
            agent={agent}
            current={model.current}
            onExplore={(file) => {
              const target = model.pages.find((p) => p.slug === file);
              if (target) open(target.slug);
            }}
          />
        ) : null}
      </div>
    </>
  );
}

/** « Revoir les questions » ouvre Hypothèses et risques ; annuler rend le focus à « Passer au cadrage ». */
function useFramingActions(
  model: IdeaModel,
  freeze: ReturnType<typeof useIdeaFreeze>,
  open: (slug: string) => void,
): FramingActions {
  return {
    confirm: freeze.confirm,
    retry: freeze.retry,
    refreeze: freeze.request,
    cancel: () => {
      freeze.cancel();
      focusWhenReady(() => document.getElementById(FREEZE_BUTTON_ID));
    },
    review: () => {
      freeze.cancel();
      const target = model.pages.find((p) => p.slug.endsWith("hypotheses-risques"));
      if (!target) return;
      open(target.slug);
      focusWhenReady(editorOf);
    },
  };
}

const asPeople = (present: ReturnType<typeof useIdeaPresence>) =>
  present.map((p) => ({
    name: p.isClient ? `${p.name} (client)` : `${p.name} (équipe)`,
    initials: p.initials,
    isClient: p.isClient,
  }));

/** État d'enregistrement du document, publication et passage au cadrage, qui vident d'abord ce qui attend. */
function useSaveAndPublish(projectId: string, openQuestions: number) {
  const [save, setSave] = useState<SaveState>("idle");
  const flushRef = useRef<() => Promise<void>>(async () => undefined);
  const onSaveState = useCallback((state: SaveState, flush: () => Promise<void>) => {
    setSave(state);
    flushRef.current = flush;
  }, []);
  const flush = useCallback(() => flushRef.current(), []);
  const publish = useIdeaPublish(projectId, flush);
  const freeze = useIdeaFreeze(projectId, openQuestions, flush);
  return { save, onSaveState, publish, freeze };
}

/** Agent, Synthèse et passage au cadrage de l'écran : tout ce que le corps reçoit en plus du modèle des pages. */
function useCompanions(
  model: IdeaModel,
  open: (slug: string) => void,
  freeze: ReturnType<typeof useIdeaFreeze>,
) {
  const agent = useIdeaAgent({
    projectId: model.projectId,
    pages: model.pages,
    current: model.current,
    enabled: model.gate === "ready" && model.canWrite,
  });
  const synthesis = useIdeaSynthesis(model.projectId, model.synthesisOpen);
  const actions = useFramingActions(model, freeze, open);
  return { agent, synthesis, framing: { freeze, actions } };
}

/** En-tête relié à la coquille (nom du projet) et à la présence. */
function ConnectedHeader({
  model,
  save,
  publish,
  freeze,
}: {
  model: IdeaModel;
  save: SaveState;
  publish: ReturnType<typeof useIdeaPublish>;
  freeze: ReturnType<typeof useIdeaFreeze>;
}) {
  const shell = useProjectShell(model.projectId);
  const present = useIdeaPresence(model.projectId, model.current?.id ?? null, model.canWrite);
  return (
    <IdeaHeader
      model={model}
      projectName={shell.data?.name ?? "Projet"}
      saveState={save}
      people={asPeople(present)}
      publish={publish.state}
      onPublish={() => void publish.publish()}
      freeze={freeze.state}
      onFreeze={freeze.request}
    />
  );
}

/** Écran S-idea (design/screens/S-idea.md) : arborescence des pages, document de la page, agent, publication. */
export function IdeaPage({ projectId }: { projectId: string }) {
  const model = useIdeaPage(projectId);
  const scope = useStorageScope();
  useBeginFeatureSession(scope);
  const [announcement, setAnnouncement] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const { save, onSaveState, publish, freeze } = useSaveAndPublish(
    projectId,
    model.maturity.openQuestions,
  );
  const { handlers, open } = useTreeHandlers(model, setAnnouncement, setRenameId);
  const { agent, synthesis, framing } = useCompanions(model, open, freeze);
  if (model.gate === "not-found") return <ProjectNotFound />;
  if (model.gate === "error") return <IdeaLoadError onRetry={model.refetch} />;
  return (
    <div className="lg:flex lg:h-dvh lg:flex-col">
      <div className="lg:shrink-0">
        <ConnectedHeader model={model} save={save} publish={publish} freeze={freeze} />
      </div>
      {model.gate === "loading" ? (
        <IdeaSkeleton />
      ) : (
        <IdeaBody
          model={model}
          scope={scope}
          publish={publish}
          framing={framing}
          synthesis={synthesis}
          renameId={renameId}
          onSaveState={onSaveState}
          open={open}
          handlers={handlers}
          announcement={announcement}
          agent={agent}
        />
      )}
    </div>
  );
}
