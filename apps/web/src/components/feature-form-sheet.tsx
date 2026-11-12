"use client";

import type { FeatureDetail, Role } from "@koklo/contract";
import { SpecItemSheet, type SpecItemSheetProps } from "@koklo/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type MutableRefObject, useRef, useState } from "react";
import { errorCode } from "../lib/api-error.ts";
import { DELETE_TRIGGER_ID, fieldId, REASON_ID } from "../lib/feature-form-ids.ts";
import { orpc } from "../lib/orpc.ts";
import { describeFeatureError } from "../lib/spec-errors.ts";
import { asFeatureItem } from "../lib/spec-item.ts";
import { type FeatureFormModel, useFeatureForm } from "../lib/use-feature-form.ts";
import type { FeatureWrite } from "../lib/use-feature-submit.ts";
import { useItemPrefill } from "../lib/use-item-prefill.ts";
import { useUnauthorizedRedirect } from "../lib/use-unauthorized-redirect.ts";
import { CriteriaEditor } from "./feature-criteria-editor.tsx";
import { FeatureDeleteConfirm } from "./feature-delete-confirm.tsx";
import { FeatureError } from "./feature-error.tsx";
import { DescriptionField, GeneralFields } from "./feature-form-fields.tsx";
import { type DeleteEntry, deleteEntry } from "./feature-form-footer.tsx";
import { FormMessages } from "./feature-form-messages.tsx";
import { LinksField } from "./feature-links-fields.tsx";
import { SaveProgress } from "./save-progress.tsx";

let lastOwner = 0;

export interface FormSheetProps {
  projectId: string;
  mode: "create" | "edit";
  specId?: string | undefined;
  role: Role | undefined;
  head: { branch: string; commitSha: string };
  write: FeatureWrite;
  /** Texte de la région d'état unique pendant que le panneau est ouvert (la page est alors masquée). */
  statusText: string;
  announce: (text: string) => void;
  /** Ferme le formulaire (adresse) ; la saisie est déjà gardée. */
  onClose: () => void;
  /** Vrai quand le focus ne doit pas revenir au bouton d'origine (retour à la liste, focus géré par la page). */
  keepFocus: MutableRefObject<boolean>;
}

const VALIDATED_WARNING =
  "Ce livrable est validé : enregistrer cette modification annule sa validation, qui devra être reposée sur la nouvelle version.";
const NEW_FILE = "features/F-nnn-titre.md";

/** Éléments du panneau qui ne dépendent que du mode (maquette 16 l.196-226, type Fonctionnalité). */
function frame({ mode, specId }: Pick<FormSheetProps, "mode" | "specId">, filePath?: string) {
  const edit = mode === "edit";
  return {
    mode,
    icon: "task_alt" as const,
    title: edit ? "Modifier la fonctionnalité" : "Nouvelle fonctionnalité",
    subtitle: `Fonctionnel · ${edit ? specId : "identifiant attribué à l'enregistrement"}`,
    ...(edit && specId ? { idTag: specId } : {}),
    closeLabel: "Fermer le formulaire",
    bodyLabel: "Saisie de la fonctionnalité",
    file: edit ? (filePath ?? `features/${specId}.md`) : NEW_FILE,
    commitNote: edit ? "un commit, relu dans l'historique" : "un commit à l'enregistrement",
    saveLabel: edit ? "Enregistrer les modifications" : "Enregistrer dans la spec",
  };
}

function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <p className="text-meta text-muted-foreground">Chargement de la fonctionnalité…</p>
      {Array.from({ length: 4 }, (_, row) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: squelettes statiques, sans identité
          key={row}
          className="h-10 rounded-md bg-muted motion-safe:animate-pulse"
        />
      ))}
    </div>
  );
}

interface BodyProps extends FormSheetProps {
  item: {
    values: FeatureDetail;
    validated: boolean;
    referencedBy: { items: Ref[]; total: number };
  } | null;
  owner: number;
  closeRef: MutableRefObject<() => void>;
  onCloseAutoFocus: (event: Event) => void;
}

/** Le focus initial va au titre, pas au premier bouton du panneau (le contenu du portail existe à ce moment-là). */
const focusTitle = (event: Event): void => {
  event.preventDefault();
  document.getElementById(fieldId("title"))?.focus();
};
type Ref = { kind: string; specId: string; title: string };

/** Pourquoi « Enregistrer » est désactivé, ou `null` (S-feature-form §4.1, §4.2). */
function disabledReason(model: FeatureFormModel, write: FeatureWrite): string | null {
  if (write.busy && !model.mine) return "Un enregistrement est déjà en cours.";
  if (model.awaitingChoice) return "Choisissez comment reprendre votre brouillon.";
  return model.noChange ? "Aucune modification à enregistrer." : null;
}

/** Fermeture : brouillon écrit puis annoncé, échec effacé, liste en retard gardée, « Vérifier la liste ». */
function useFormClose(props: BodyProps, model: FeatureFormModel) {
  const { write, announce, onClose, closeRef } = props;
  const queryClient = useQueryClient();
  const close = (): void => {
    const kept = write.busy ? false : model.flushDraft();
    // « Liste pas encore à jour » reste suivie par la page (relectures bornées) : seul l'échec est effacé.
    if (model.mine && write.phase === "failed") write.dismiss();
    if (kept) announce("Brouillon gardé sur cet appareil.");
    onClose();
  };
  closeRef.current = close;
  const checkList = () => {
    void queryClient.invalidateQueries({ queryKey: orpc.spec.listFeatures.key() });
    close();
  };
  return { close, checkList };
}

type Prefill = ReturnType<typeof useItemPrefill>;
type Extras = Partial<SpecItemSheetProps>;

/** Encadré « Décrire en une phrase » (création) ou bandeau « Préremplie par l'agent ». */
function assistProps(mode: FormSheetProps["mode"], prefill: Prefill): Extras {
  return {
    ...(mode === "create"
      ? {
          assist: {
            hint: "ex. « le client s'inscrit sur liste d'attente quand tout est complet »",
            value: prefill.text,
            onChange: prefill.setText,
            onPrefill: prefill.run,
            busy: prefill.busy,
            error: prefill.error,
          },
        }
      : {}),
    ...(prefill.filled ? { filled: { onClear: prefill.clear } } : {}),
  };
}

/** « Supprimer » du pied et, une fois demandée, la confirmation qui liste ce qui renvoie à l'élément. */
function deleteProps(remove: DeleteEntry | null, item: BodyProps["item"]): Extras {
  if (!remove) return { deleteButtonId: DELETE_TRIGGER_ID };
  return {
    deleteButtonId: DELETE_TRIGGER_ID,
    onDelete: remove.del.ask,
    deleteDisabled: remove.disabled,
    ...(remove.explained ? { deleteDescribedBy: REASON_ID } : {}),
    ...(remove.del.confirming
      ? {
          confirmation: (
            <FeatureDeleteConfirm
              specId={remove.specId}
              title={remove.title}
              busy={remove.del.deleting}
              referencedBy={item?.referencedBy ?? { items: [], total: 0 }}
              onConfirm={remove.del.confirm}
              onKeep={remove.del.keep}
            />
          ),
        }
      : {}),
  };
}

/** Avancement de l'écriture et raison d'un « Enregistrer » désactivé, entre le corps et le pied. */
function FooterNotes({
  model,
  write,
  reason,
}: {
  model: FeatureFormModel;
  write: FeatureWrite;
  reason: string | null;
}) {
  return (
    <>
      {model.mine && write.phase !== "idle" ? (
        <SaveProgress write={write} version={write.batch?.commitSha?.slice(0, 7) ?? null} />
      ) : null}
      {reason ? (
        <p id={REASON_ID} className="px-5 text-meta text-muted-foreground">
          {reason}
        </p>
      ) : null}
    </>
  );
}

/** Formulaire prêt : coque `SpecItemSheet`, champs, messages, avancement et suppression. */
function FormBody(props: BodyProps) {
  const { projectId, mode, specId, role, head, write, announce, item, owner } = props;
  const model = useFeatureForm({
    projectId,
    mode,
    specId,
    role,
    detail: item?.values ?? null,
    head,
    write,
    owner,
    announce,
  });
  const { close, checkList } = useFormClose(props, model);
  const prefill = useItemPrefill({
    projectId,
    values: model.state.values,
    setValues: model.setValues,
    announce,
  });
  const readOnly = model.mine && write.busy;
  const reason = disabledReason(model, write);
  const field = { model, readOnly, agentFilled: prefill.agentFilled };
  return (
    <SpecItemSheet
      open
      {...frame(props, item?.values.filePath)}
      dirty={model.dirty && !(model.mine && write.phase !== "idle" && write.phase !== "failed")}
      saving={readOnly}
      saveDisabled={Boolean(reason) || (model.mine && write.phase === "late")}
      saveDescribedBy={reason ? REASON_ID : undefined}
      onSave={model.save}
      onClose={close}
      onOpenAutoFocus={focusTitle}
      onCloseAutoFocus={props.onCloseAutoFocus}
      {...assistProps(mode, prefill)}
      {...deleteProps(deleteEntry(mode, specId, model, write), item)}
      {...(mode === "edit" && item?.validated ? { warning: VALIDATED_WARNING } : {})}
      beforeFooter={<FooterNotes model={model} write={write} reason={reason} />}
    >
      <div role="status" className="sr-only">
        {props.statusText}
      </div>
      <FormMessages model={model} write={write} onClose={close} onCheckList={checkList} />
      <GeneralFields {...field} />
      <DescriptionField {...field} />
      <CriteriaEditor
        {...field}
        agentFilled={prefill.agentFilled("criteria")}
        announce={announce}
        original={model.state.baseline}
      />
      <LinksField
        projectId={projectId}
        model={model}
        readOnly={readOnly}
        designer={role === "designer"}
        agentFilled={prefill.agentFilled("links")}
      />
    </SpecItemSheet>
  );
}

/** Rend le focus à l'élément d'où le formulaire a été ouvert, sinon à un équivalent encore présent. */
function restoreFocus(opener: Element | null, specId: string | undefined): void {
  const target =
    opener instanceof HTMLElement && opener.isConnected && opener !== document.body
      ? opener
      : (document.querySelector<HTMLElement>("[data-new-feature]") ??
        document.querySelector<HTMLElement>(`[data-feature-link="${specId}"]`));
  target?.focus();
}

/** Formulaire de création ou de modification d'une fonctionnalité, dans le panneau `SpecItemSheet`. */
export function FeatureFormSheet(props: FormSheetProps) {
  const { projectId, mode, specId, role, onClose, keepFocus, statusText } = props;
  const [opener] = useState(() => document.activeElement);
  const owner = useRef(0);
  if (owner.current === 0) owner.current = ++lastOwner;
  const closeRef = useRef<() => void>(onClose);
  closeRef.current = onClose;
  const query = useQuery({
    ...orpc.spec.item.get.queryOptions({
      input: { projectId, type: "feature", id: specId ?? "" },
    }),
    select: asFeatureItem,
    enabled: mode === "edit",
  });
  useUnauthorizedRedirect(query.error);
  const ready =
    mode === "create" || (query.data !== undefined && errorCode(query.error) !== "NOT_FOUND");
  const closing = useRef(false);
  const onCloseAutoFocus = (event: Event): void => {
    event.preventDefault();
    if (!keepFocus.current) restoreFocus(opener, specId);
  };
  if (ready) {
    return (
      <FormBody
        {...props}
        item={query.data ?? null}
        owner={owner.current}
        closeRef={closeRef}
        onCloseAutoFocus={onCloseAutoFocus}
      />
    );
  }
  return (
    <SpecItemSheet
      open
      {...frame(props)}
      dirty={false}
      saveDisabled
      onSave={() => undefined}
      onOpenAutoFocus={focusTitle}
      onClose={() => {
        closing.current = true;
        onClose();
      }}
      // Le panneau de chargement cède la place au formulaire : le focus ne retourne à l'ouverture qu'à la vraie fermeture.
      onCloseAutoFocus={(event) =>
        closing.current ? onCloseAutoFocus(event) : event.preventDefault()
      }
    >
      <div role="status" className="sr-only">
        {statusText}
      </div>
      {query.isError ? (
        <FeatureError
          view={describeFeatureError(query.error, role)}
          role={role}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <Loading />
      )}
    </SpecItemSheet>
  );
}
