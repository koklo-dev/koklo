"use client";

import type { IdeaPageSummary } from "@koklo/contract";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import type { StorageScope } from "../lib/feature-draft.ts";
import { moveAnnouncement, numberedTitle, type SaveState } from "../lib/idea-labels.ts";
import { arrayMoveIds } from "../lib/idea-order.ts";
import { ideaPath } from "../lib/shell-routes.ts";
import { type IdeaModel, useIdeaPage } from "../lib/use-idea-page.ts";
import { useIdeaPresence } from "../lib/use-idea-presence.ts";
import { useIdeaPublish } from "../lib/use-idea-publish.ts";
import { useProjectShell } from "../lib/use-project-shell.ts";
import { useBeginFeatureSession, useStorageScope } from "../lib/use-storage-scope.ts";
import { ProjectNotFound } from "./features-empty.tsx";
import { DocumentSkeleton, IdeaDocument } from "./idea-document.tsx";
import { IdeaHeader, IdeaPublishNotice } from "./idea-header.tsx";
import { IdeaEmpty, IdeaLoadError, IdeaSkeleton } from "./idea-states.tsx";
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

function IdeaBody({
  model,
  scope,
  publish,
  renameId,
  onSaveState,
  open,
  handlers,
  announcement,
}: {
  model: IdeaModel;
  scope: StorageScope | null;
  publish: ReturnType<typeof useIdeaPublish>;
  renameId: string | null;
  onSaveState: (state: SaveState, flush: () => Promise<void>) => void;
  open: (slug: string) => void;
  handlers: TreeHandlers;
  announcement: string;
}) {
  const first = model.pages[0];
  const allEmpty = model.pages.every((p) => p.status === "empty");
  const noneChosen = model.slug === null;
  return (
    <>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <div className="flex min-w-0 flex-col lg:flex-row">
        <IdeaTreeDesktop model={model} handlers={handlers} />
        <IdeaTreeMobile model={model} handlers={handlers} />
        <article
          aria-label="Page du dossier"
          className="flex min-w-0 flex-1 flex-col gap-4 px-4 py-7 md:px-10 md:pb-12"
        >
          <IdeaPublishNotice
            model={model}
            publish={publish.state}
            onRetry={() => void publish.publish()}
          />
          {allEmpty && noneChosen && first ? (
            <IdeaEmpty onStart={() => open(first.slug)} />
          ) : model.current ? (
            <IdeaDocument
              model={model}
              summary={model.current}
              scope={scope}
              renameFocus={renameId === model.current.id}
              onSaveState={onSaveState}
            />
          ) : (
            <DocumentSkeleton />
          )}
        </article>
      </div>
    </>
  );
}

const asPeople = (present: ReturnType<typeof useIdeaPresence>) =>
  present.map((p) => ({
    name: p.isClient ? `${p.name} (client)` : `${p.name} (équipe)`,
    initials: p.initials,
    isClient: p.isClient,
  }));

/** Écran S-idea (design/screens/S-idea.md) : arborescence des pages, document de la page, publication. */
export function IdeaPage({ projectId }: { projectId: string }) {
  const model = useIdeaPage(projectId);
  const shell = useProjectShell(projectId);
  const scope = useStorageScope();
  useBeginFeatureSession(scope);
  const [save, setSave] = useState<SaveState>("idle");
  const [announcement, setAnnouncement] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const flushRef = useRef<() => Promise<void>>(async () => undefined);
  const onSaveState = useCallback((state: SaveState, flush: () => Promise<void>) => {
    setSave(state);
    flushRef.current = flush;
  }, []);
  const publish = useIdeaPublish(
    projectId,
    useCallback(() => flushRef.current(), []),
  );
  const present = useIdeaPresence(projectId, model.current?.id ?? null, model.canWrite);
  const { handlers, open } = useTreeHandlers(model, setAnnouncement, setRenameId);
  const header = (
    <IdeaHeader
      model={model}
      projectName={shell.data?.name ?? "Projet"}
      saveState={save}
      people={asPeople(present)}
      publish={publish.state}
      onPublish={() => void publish.publish()}
    />
  );
  if (model.gate === "not-found") return <ProjectNotFound />;
  if (model.gate === "error") return <IdeaLoadError onRetry={model.refetch} />;
  return (
    <>
      {header}
      {model.gate === "loading" ? (
        <IdeaSkeleton />
      ) : (
        <IdeaBody
          model={model}
          scope={scope}
          publish={publish}
          renameId={renameId}
          onSaveState={onSaveState}
          open={open}
          handlers={handlers}
          announcement={announcement}
        />
      )}
    </>
  );
}
