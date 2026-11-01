"use client";

import { useCallback, useEffect, useRef } from "react";
import { canWriteSpec } from "./roles.ts";
import type { FeatureWrite } from "./use-feature-submit.ts";
import type { useFeaturesData } from "./use-features-data.ts";
import type { useFeaturesUrl } from "./use-features-url.ts";

type Data = ReturnType<typeof useFeaturesData>;
type Url = ReturnType<typeof useFeaturesUrl>;

/** Vues où la spec est lue et le formulaire peut s'ouvrir (liste, spec vide, filtres sans résultat). */
const WRITABLE_VIEWS = ["list", "empty", "empty-filtered"];

/**
 * Ouverture du formulaire d'une fonctionnalité par l'adresse (`?new=1`, `?edit=F-nnn`) : seulement pour l'équipe
 * qui écrit et quand `spec.head` est prêt. Sans droit d'écriture, le paramètre est retiré (`?edit` devient la fiche).
 */
export function useFeatureFormPanel(url: Url, data: Data, write: FeatureWrite) {
  const { role, head, view } = data;
  const canWrite =
    canWriteSpec(role) && head?.status === "ready" && WRITABLE_VIEWS.includes(view.kind);
  const wanted = Boolean(url.new || url.edit);
  const fromSheet = useRef(false);
  const { closeForm, showFeature } = url;

  useEffect(() => {
    if (role === undefined || canWriteSpec(role) || !wanted) return;
    if (url.edit) showFeature(url.edit);
    else closeForm();
  }, [role, wanted, url.edit, showFeature, closeForm]);

  const open = canWrite && wanted;
  const close = useCallback(() => {
    const back = fromSheet.current ? url.edit : undefined;
    fromSheet.current = false;
    closeForm(back);
  }, [closeForm, url.edit]);

  // Une écriture terminée referme le formulaire : la page prend le relais (confirmation, focus).
  useEffect(() => {
    if (open && write.phase === "saved") {
      fromSheet.current = false;
      closeForm();
    }
  }, [open, write.phase, closeForm]);

  return {
    canWrite,
    open,
    mode: url.edit ? ("edit" as const) : ("create" as const),
    specId: url.edit,
    close,
    openCreate: () => {
      write.dismiss();
      url.openCreate();
    },
    openEdit: (specId: string, fromFiche = false) => {
      fromSheet.current = fromFiche;
      write.dismiss();
      url.openEdit(specId);
    },
  };
}
