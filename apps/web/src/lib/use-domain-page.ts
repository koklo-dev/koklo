"use client";

import { useQueryClient } from "@tanstack/react-query";
import { type RefObject, useEffect, useRef } from "react";
import { DOMAIN_NOUNS, domainResultText } from "./domain-region.ts";
import { regionText, writeNoticeText, writeRegionText } from "./features-region.ts";
import { withFeaturesUrl } from "./features-url.ts";
import { orpc } from "./orpc.ts";
import { canReadRepos, canWriteSpec, canWriteTab } from "./roles.ts";
import { featuresPath } from "./shell-routes.ts";
import { type DomainData, type DomainTab, useDomainData } from "./use-domain-data.ts";
import { type FeatureWrite, useFeatureWrite } from "./use-feature-submit.ts";
import { useAnnouncements, useRepoCreated } from "./use-features-actions.ts";
import { useListFooter, useResultAnnouncement, useSearchBox } from "./use-features-list.ts";
import { useFeaturesUrl } from "./use-features-url.ts";
import { usePendingResume } from "./use-pending-save.ts";
import { useProposals } from "./use-proposals.ts";
import { useSavedToast } from "./use-saved-toast.ts";

type Url = ReturnType<typeof useFeaturesUrl>;

/** Vues où la spec est lue et le formulaire peut s'ouvrir (liste, spec vide, filtres sans résultat). */
const WRITABLE_VIEWS = ["list", "empty", "empty-filtered"];

/**
 * Ouverture du formulaire par l'adresse (`?new=1`, `?edit=<id>`) : seulement pour qui écrit cet onglet (B340) et quand
 * `spec.head` est prêt ; sinon le paramètre est retiré. Une écriture terminée referme le formulaire et choisit l'élément.
 */
function useDomainForm(url: Url, data: DomainData, write: FeatureWrite, tab: DomainTab) {
  const { role, head, view } = data;
  const canWrite =
    canWriteTab(role, tab) && head?.status === "ready" && WRITABLE_VIEWS.includes(view.kind);
  const wanted = Boolean(url.new || url.edit);
  const { closeForm } = url;
  useEffect(() => {
    if (role !== undefined && !canWriteTab(role, tab) && wanted) closeForm();
  }, [role, tab, wanted, closeForm]);
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

/** Après un enregistrement : les listes se relisent, puis le focus va à la carte enregistrée ou au titre de la page. */
function useSavedSync(
  write: FeatureWrite,
  formOpen: boolean,
  titleRef: RefObject<HTMLHeadingElement | null>,
) {
  const queryClient = useQueryClient();
  const done = useRef<string | null>(null);
  const { saved } = write;
  useEffect(() => {
    if (!saved?.commitSha || formOpen) return;
    const key = `${saved.meta.target}:${saved.commitSha}`;
    if (done.current === key) return;
    done.current = key;
    const specId = saved.meta.kind === "delete" ? undefined : saved.meta.specId;
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.spec.functional.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.spec.roles.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.spec.item.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.spec.head.key() }),
    ]).then(() => {
      const edit = specId
        ? document.querySelector<HTMLElement>(`[data-spec-id="${specId}"] button`)
        : null;
      (edit ?? titleRef.current)?.focus();
    });
  }, [saved, formOpen, queryClient, titleRef]);
}

/** Ce que la liste dit d'elle-même : texte de recherche annoncé après la frappe, barre de compte. */
function useSummary(url: Url, data: DomainData, tab: DomainTab) {
  const noun = DOMAIN_NOUNS[tab];
  const { view, head, functional, matrix } = data;
  const list = tab === "roles" ? matrix : functional;
  const total = tab === "roles" ? matrix.total : functional.total;
  const filtered = Boolean(url.q || (tab === "rules" && url.type));
  // La barre de compte porte la région d'état des listes ; la matrice des rôles a la sienne (annonce du filtre).
  const countBar = view.kind === "list" || (tab !== "roles" && view.kind === "empty-filtered");
  const projectTotal =
    tab === "rules" ? head?.counts.rules : tab === "flows" ? head?.counts.flows : undefined;
  const resultText = useResultAnnouncement(
    countBar || tab === "roles"
      ? domainResultText({ q: url.q, filtered, total, projectTotal, noun })
      : "",
    !list.query.isFetching && !list.stale,
    tab === "roles" ? matrix.actions.length : functional.items.length,
  );
  return { countBar, resultText, noun };
}

/** Tout ce que pilote un onglet Règles métier, Rôles et permissions ou Parcours. */
export function useDomainPage(projectId: string, tab: DomainTab) {
  const url = useFeaturesUrl();
  const data = useDomainData(projectId, tab, { type: url.type, q: url.q, selected: url.feature });
  const { announcement, announce } = useAnnouncements(data.view);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const footer = useListFooter(data.functional, () => orpc.spec.functional.key());
  const write = useFeatureWrite({ projectId, filters: () => ({ q: url.q }) });
  usePendingResume(projectId, data.role, write);
  const form = useDomainForm(url, data, write, tab);
  useSavedSync(write, form.open, titleRef);
  useSavedToast(write);
  const propose = useProposals(projectId, url, data);
  const summary = useSummary(url, data, tab);
  const writeText = writeRegionText(write, form.open);
  const { view } = data;
  return {
    tab,
    url,
    data,
    propose,
    announce,
    announcement,
    footer,
    write,
    form,
    titleRef,
    search: useSearchBox(url),
    team: canReadRepos(data.role),
    repoCreated: useRepoCreated(announce),
    noun: summary.noun,
    reopenDraft: () => (form.specId ? form.openEdit(form.specId) : form.openCreate()),
    hrefFor: (specId: string) =>
      featuresPath(projectId, withFeaturesUrl(`?${url.search}`, { feature: specId })),
    region: {
      text: [
        regionText({ view, expired: data.expired, noun: summary.noun.loading }),
        announcement,
        writeText,
      ]
        .filter(Boolean)
        .join(" "),
      countText: [summary.resultText, announcement, writeText, writeNoticeText(write)]
        .filter(Boolean)
        .join(" "),
      panelText: [announcement, writeRegionText(write, true)].filter(Boolean).join(" "),
      busy: view.kind === "loading",
      countBar: summary.countBar,
      showCount: summary.countBar && tab !== "roles" && !form.open,
    },
    canPropose: propose.enabled && canWriteSpec(data.role),
  };
}

export type DomainPageModel = ReturnType<typeof useDomainPage>;
