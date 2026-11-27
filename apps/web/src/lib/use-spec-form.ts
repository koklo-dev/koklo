"use client";

import { useQueryClient } from "@tanstack/react-query";
import { type RefObject, useEffect, useRef } from "react";
import { orpc } from "./orpc.ts";
import type { FeatureWrite } from "./use-feature-submit.ts";

/** Vues où la spec est lue et le formulaire peut s'ouvrir. */
const WRITABLE_VIEWS = ["list", "empty", "empty-filtered"];

/** Ce que le formulaire lit de l'adresse de l'écran : `?new=1`, `?edit=<id>` et leur fermeture. */
export interface FormUrl {
  new: boolean;
  edit: string | undefined;
  closeForm: (sel?: string) => void;
  openCreate: () => void;
  openEdit: (specId: string) => void;
}

/**
 * Ouverture du formulaire par l'adresse (`?new=1`, `?edit=<id>`) : seulement pour qui écrit le livrable (le designer
 * lit) et quand `spec.head` est prêt ; sinon le paramètre est retiré. Une écriture terminée le referme.
 */
export function useSpecForm(
  url: FormUrl,
  ctx: {
    role: string | undefined;
    ready: boolean;
    viewKind: string;
    canWrite: (role: string | undefined) => boolean;
  },
  write: FeatureWrite,
) {
  const { role, ready, viewKind } = ctx;
  const canWrite = ctx.canWrite(role) && ready && WRITABLE_VIEWS.includes(viewKind);
  const wanted = url.new || Boolean(url.edit);
  const { closeForm } = url;
  const mayWrite = ctx.canWrite(role);
  useEffect(() => {
    if (role !== undefined && !mayWrite && wanted) closeForm();
  }, [role, mayWrite, wanted, closeForm]);
  const open = canWrite && wanted;
  const saved = write.saved;
  useEffect(() => {
    if (open && write.phase === "saved") {
      closeForm(saved?.meta.kind === "delete" ? undefined : saved?.meta.specId);
    }
  }, [open, write.phase, saved, closeForm]);
  return {
    canWrite,
    open,
    mode: url.edit ? ("edit" as const) : ("create" as const),
    specId: url.edit,
    close: () => closeForm(),
    openCreate: () => {
      write.dismiss();
      url.openCreate();
    },
    openEdit: (specId: string) => {
      write.dismiss();
      url.openEdit(specId);
    },
  };
}

/**
 * Après un enregistrement : les lectures se relisent (la liste du livrable, les fiches, `spec.head`, le statut des
 * livrables et la coque), puis le focus va à la ligne enregistrée ou au titre de la page.
 */
export function useSavedSync(
  write: FeatureWrite,
  formOpen: boolean,
  titleRef: RefObject<HTMLHeadingElement | null>,
  listKeys: ReadonlyArray<() => readonly unknown[]>,
) {
  const queryClient = useQueryClient();
  const done = useRef<string | null>(null);
  const { saved } = write;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `listKeys` est constant pour un écran donné
  useEffect(() => {
    if (!saved?.commitSha || formOpen) return;
    const key = `${saved.meta.target}:${saved.commitSha}`;
    if (done.current === key) return;
    done.current = key;
    const specId = saved.meta.kind === "delete" ? undefined : saved.meta.specId;
    void Promise.all([
      ...listKeys.map((listKey) => queryClient.invalidateQueries({ queryKey: listKey() })),
      queryClient.invalidateQueries({ queryKey: orpc.spec.item.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.spec.head.key() }),
      // Le statut du livrable suit son contenu : « Validé » repasse « À valider » (TK-109, B445).
      queryClient.invalidateQueries({ queryKey: orpc.spec.deliverables.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.project.shell.key() }),
    ]).then(() => {
      if (saved.meta.inPlace) return;
      const row = specId
        ? document.querySelector<HTMLElement>(`[data-spec-id="${specId}"] button`)
        : null;
      (row ?? titleRef.current)?.focus();
    });
  }, [saved, formOpen, queryClient, titleRef]);
}
