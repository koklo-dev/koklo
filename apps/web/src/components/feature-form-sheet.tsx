"use client";

import type { FeatureDetail, Role } from "@koklo/contract";
import { Button, Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@koklo/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type MutableRefObject, type ReactNode, useEffect, useRef, useState } from "react";
import { errorCode } from "../lib/api-error.ts";
import { fieldId } from "../lib/feature-form-ids.ts";
import { orpc } from "../lib/orpc.ts";
import { describeFeatureError } from "../lib/spec-errors.ts";
import type { FeatureDelete } from "../lib/use-feature-delete.ts";
import { type FeatureFormModel, useFeatureForm } from "../lib/use-feature-form.ts";
import type { FeatureWrite } from "../lib/use-feature-submit.ts";
import { useUnauthorizedRedirect } from "../lib/use-unauthorized-redirect.ts";
import { CriteriaEditor } from "./feature-criteria-editor.tsx";
import { FeatureDeleteConfirm, FeatureDeleteTrigger } from "./feature-delete-confirm.tsx";
import { FeatureError } from "./feature-error.tsx";
import { DescriptionField, GeneralFields } from "./feature-form-fields.tsx";
import { FormMessages } from "./feature-form-messages.tsx";
import { LinksFields } from "./feature-links-fields.tsx";
import { SaveProgress } from "./save-progress.tsx";

let lastOwner = 0;
const REASON = "feature-form-save-reason";

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

/** Zone défilante du panneau : atteignable au clavier (axe `scrollable-region-focusable`), anneau `--ring`. */
function ScrollRegion({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <section
      aria-label="Saisie de la fonctionnalité"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: région défilante, doit pouvoir être lue au clavier
      tabIndex={0}
      className={`flex min-h-0 flex-1 flex-col overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
    >
      {children}
    </section>
  );
}

function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <p className="text-[13px] text-muted-foreground">Chargement de la fonctionnalité…</p>
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
  detail: FeatureDetail | null;
  owner: number;
  closeRef: MutableRefObject<() => void>;
}

/** Pourquoi « Enregistrer » est désactivé, ou `null` (S-feature-form §4.1, §4.2). */
function disabledReason(model: FeatureFormModel, write: FeatureWrite): string | null {
  if (write.busy && !model.mine) return "Un enregistrement est déjà en cours.";
  if (model.awaitingChoice) return "Choisissez comment reprendre votre brouillon.";
  return model.noChange ? "Aucune modification à enregistrer." : null;
}

interface FooterProps {
  busy: boolean;
  disabled: boolean;
  reason: string | null;
  onClose: () => void;
  /** Suppression : seulement en modification, une fois la fonctionnalité lue. */
  remove: {
    del: FeatureDelete;
    specId: string;
    title: string;
    disabled: boolean;
    explained: boolean;
  } | null;
}

function FormFooter(props: FooterProps) {
  const { remove } = props;
  if (remove?.del.confirming) {
    const { del } = remove;
    return (
      <SheetFooter className="flex-col sm:flex-col sm:justify-start">
        <FeatureDeleteConfirm
          specId={remove.specId}
          title={remove.title}
          busy={del.deleting}
          onConfirm={del.confirm}
          onKeep={del.keep}
        />
      </SheetFooter>
    );
  }
  return (
    <SheetFooter className="flex-col sm:flex-col sm:justify-start md:flex-row md:justify-start">
      <Button
        type="submit"
        className="h-11 w-full md:h-9 md:w-auto"
        disabled={props.disabled}
        aria-busy={props.busy || undefined}
        aria-describedby={props.reason ? REASON : undefined}
      >
        {props.busy ? "Enregistrement…" : "Enregistrer"}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full md:h-9 md:w-auto"
        onClick={props.onClose}
      >
        Fermer
      </Button>
      {remove ? (
        <FeatureDeleteTrigger
          disabled={remove.disabled}
          describedBy={remove.explained ? REASON : undefined}
          onAsk={remove.del.ask}
        />
      ) : null}
    </SheetFooter>
  );
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

/** Entrée de la suppression : en modification seulement, désactivée tant qu'une écriture suit son cours. */
function removal(props: BodyProps, model: FeatureFormModel): FooterProps["remove"] {
  const { specId, write } = props;
  const baseline = model.state.baseline;
  if (props.mode !== "edit" || !specId || !baseline) return null;
  const disabled = write.busy || (model.mine && write.phase === "late");
  return {
    del: model.del,
    specId,
    title: baseline.title.trim(),
    disabled,
    explained: write.busy && !model.mine,
  };
}

/** Formulaire prêt : champs, messages, indicateur d'avancement et pied (S-feature-form §3.2). */
function FormBody(props: BodyProps) {
  const { projectId, mode, specId, role, head, write, announce, detail, owner } = props;
  const model = useFeatureForm({
    projectId,
    mode,
    specId,
    role,
    detail,
    head,
    write,
    owner,
    announce,
  });
  const { close, checkList } = useFormClose(props, model);
  const readOnly = model.mine && write.busy;
  const reason = disabledReason(model, write);
  useEffect(() => document.getElementById(fieldId("title"))?.focus(), []);
  const field = { model, readOnly };

  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        model.save();
      }}
    >
      <ScrollRegion className="gap-6">
        <FormMessages model={model} write={write} onClose={close} onCheckList={checkList} />
        <GeneralFields {...field} />
        <DescriptionField {...field} />
        <CriteriaEditor {...field} announce={announce} original={model.state.baseline} />
        <LinksFields {...field} designer={role === "designer"} />
      </ScrollRegion>
      {model.mine && write.phase !== "idle" ? (
        <SaveProgress write={write} version={write.batch?.commitSha?.slice(0, 7) ?? null} />
      ) : null}
      {reason ? (
        <p id={REASON} className="text-[13px] text-muted-foreground">
          {reason}
        </p>
      ) : null}
      <FormFooter
        busy={readOnly}
        disabled={Boolean(reason) || (model.mine && write.phase === "late")}
        reason={reason}
        onClose={close}
        remove={removal(props, model)}
      />
    </form>
  );
}

function Title({ mode, specId }: Pick<FormSheetProps, "mode" | "specId">) {
  if (mode === "create") return <>Nouvelle fonctionnalité</>;
  return (
    <>
      <span className="sr-only">{`Modifier ${specId}`}</span>
      <span aria-hidden="true">
        Modifier <span className="font-mono">{specId}</span>
      </span>
    </>
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

/** Formulaire de création ou de modification d'une fonctionnalité, dans un `Sheet` de 440 px. */
export function FeatureFormSheet(props: FormSheetProps) {
  const { projectId, mode, specId, role, onClose, keepFocus, statusText } = props;
  const [opener] = useState(() => document.activeElement);
  const owner = useRef(0);
  if (owner.current === 0) owner.current = ++lastOwner;
  const closeRef = useRef<() => void>(onClose);
  closeRef.current = onClose;
  const query = useQuery({
    ...orpc.spec.getFeature.queryOptions({ input: { projectId, specId: specId ?? "" } }),
    enabled: mode === "edit",
  });
  useUnauthorizedRedirect(query.error);
  const ready =
    mode === "create" || (query.data !== undefined && errorCode(query.error) !== "NOT_FOUND");
  return (
    <Sheet open onOpenChange={(open) => open || closeRef.current()}>
      <SheetContent
        aria-describedby={undefined}
        closeLabel="Fermer le formulaire"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!keepFocus.current) restoreFocus(opener, specId);
        }}
      >
        <SheetHeader>
          <SheetTitle className="text-xl font-semibold tracking-[-0.015em]">
            <Title mode={mode} specId={specId} />
          </SheetTitle>
        </SheetHeader>
        {/* Région d'état unique de l'écran tant que le panneau est ouvert (le reste de la page est masqué). */}
        <div role="status" className="sr-only">
          {statusText}
        </div>
        {ready ? (
          <FormBody
            {...props}
            detail={query.data ?? null}
            owner={owner.current}
            closeRef={closeRef}
          />
        ) : (
          <>
            <ScrollRegion>
              {query.isError ? (
                <FeatureError
                  view={describeFeatureError(query.error, role)}
                  role={role}
                  onRetry={() => void query.refetch()}
                />
              ) : (
                <Loading />
              )}
            </ScrollRegion>
            <SheetFooter>
              <Button type="button" variant="outline" className="h-11 md:h-9" onClick={onClose}>
                Fermer
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
