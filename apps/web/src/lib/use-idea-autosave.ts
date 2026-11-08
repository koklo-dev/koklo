"use client";

import type { IdeaPage } from "@koklo/contract";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StorageScope } from "./feature-draft.ts";
import { clearIdeaDraft, readIdeaDraft, saveIdeaDraft } from "./idea-draft.ts";
import type { SaveState } from "./idea-labels.ts";
import { createIdeaSaver, type IdeaSaver, type IdeaSaverDeps } from "./idea-saver.ts";
import { orpc } from "./orpc.ts";

export interface IdeaConflict {
  mine: string;
  theirs: { version: number; contentMd: string; author: string | null };
}

/** Contenu à poser dans l'éditeur à la demande (reprise de la copie locale, « Prendre la leur »). */
export interface Replacement {
  contentMd: string;
  n: number;
}

interface Options {
  projectId: string;
  page: IdeaPage;
  scope: StorageScope;
  editable: boolean;
}

interface DepsInput {
  projectId: string;
  pageId: string;
  scope: StorageScope;
  client: QueryClient;
  setState: (state: SaveState) => void;
  setConflict: (conflict: IdeaConflict) => void;
}

function buildDeps({
  projectId,
  pageId,
  scope,
  client,
  setState,
  setConflict,
}: DepsInput): IdeaSaverDeps {
  return {
    save: ({ contentMd, baseVersion }) =>
      orpc.idea.save.call({ projectId, pageId, baseVersion, contentMd }),
    onState: setState,
    onConflict: async ({ mine }) => {
      const theirs = await orpc.idea.get.call({ projectId, pageId });
      setConflict({
        mine,
        theirs: {
          version: theirs.version,
          contentMd: theirs.contentMd,
          author: theirs.updatedBy?.name ?? null,
        },
      });
    },
    persistLocal: (contentMd, baseVersion) =>
      void saveIdeaDraft(scope, projectId, pageId, { contentMd, baseVersion }),
    clearLocal: () => clearIdeaDraft(projectId, pageId),
    onSaved: () =>
      void client.invalidateQueries({
        queryKey: orpc.idea.list.queryOptions({ input: { projectId } }).queryKey,
      }),
  };
}

function useConflictChoice(
  saver: IdeaSaver,
  conflict: IdeaConflict | null,
  setConflict: (conflict: IdeaConflict | null) => void,
  setReplacement: (update: (previous: Replacement | null) => Replacement) => void,
) {
  const keepMine = useCallback(() => {
    if (!conflict) return;
    setConflict(null);
    void saver.keepMine(conflict.theirs.version);
  }, [conflict, saver, setConflict]);
  const takeTheirs = useCallback(() => {
    if (!conflict) return;
    saver.takeTheirs(conflict.theirs.version, conflict.theirs.contentMd);
    setReplacement((previous) => ({
      contentMd: conflict.theirs.contentMd,
      n: (previous?.n ?? 0) + 1,
    }));
    setConflict(null);
  }, [conflict, saver, setConflict, setReplacement]);
  return { keepMine, takeTheirs };
}

/**
 * Enregistrement d'une page ouverte (T19, T20) : à l'ouverture, une copie locale plus récente que le serveur est reprise
 * (si le serveur a changé entre-temps, c'est un conflit qui le dira à l'envoi) ; ensuite `createIdeaSaver` pilote
 * débounce, perte de focus, hors ligne et conflit. La page est remontée à chaque changement de page (clé).
 */
export function useIdeaAutosave({ projectId, page, scope, editable }: Options) {
  const client = useQueryClient();
  const [state, setState] = useState<SaveState>("idle");
  const [conflict, setConflict] = useState<IdeaConflict | null>(null);
  const [replacement, setReplacement] = useState<Replacement | null>(null);
  const draft = useMemo(
    () => (editable ? readIdeaDraft(scope, projectId, page.id) : null),
    [editable, scope, projectId, page.id],
  );
  const restored = draft !== null && draft.contentMd !== page.contentMd;
  const pageRef = useRef(page);

  const saver = useMemo(
    () =>
      createIdeaSaver(
        buildDeps({ projectId, pageId: page.id, scope, client, setState, setConflict }),
        restored && draft
          ? { version: draft.baseVersion, contentMd: pageRef.current.contentMd }
          : { version: page.version, contentMd: page.contentMd },
      ),
    [client, draft, page.contentMd, page.id, page.version, projectId, restored, scope],
  );

  useEffect(() => {
    if (restored && draft) {
      setReplacement({ contentMd: draft.contentMd, n: 1 });
      saver.change(draft.contentMd);
      void saver.flush();
    }
    const online = () => void saver.retry();
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("online", online);
      void saver.flush();
      saver.dispose();
    };
  }, [saver, restored, draft]);

  const { keepMine, takeTheirs } = useConflictChoice(saver, conflict, setConflict, setReplacement);

  return {
    state,
    conflict,
    replacement,
    restored,
    change: saver.change,
    flush: saver.flush,
    keepMine,
    takeTheirs,
  };
}
