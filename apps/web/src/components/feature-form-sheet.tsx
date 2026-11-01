"use client";

import type { FeatureDetail, Role } from "@koklo/contract";
import { Button, Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@koklo/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type MutableRefObject, useEffect, useRef, useState } from "react";
import { fieldId } from "../lib/feature-form-ids.ts";
import { orpc } from "../lib/orpc.ts";
import { describeFeatureError } from "../lib/spec-errors.ts";
import { type FeatureFormModel, useFeatureForm } from "../lib/use-feature-form.ts";
import type { FeatureWrite } from "../lib/use-feature-submit.ts";
import { useUnauthorizedRedirect } from "../lib/use-unauthorized-redirect.ts";
import { CriteriaEditor } from "./feature-criteria-editor.tsx";
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
  announce: (text: string) => void;
  /** Ferme le formulaire (adresse) ; la saisie est déjà gardée. */
  onClose: () => void;
  /** Vrai quand le focus ne doit pas revenir au bouton d'origine (retour à la liste, focus géré par la page). */
  keepFocus: MutableRefObject<boolean>;
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

function FormFooter(props: {
  busy: boolean;
  disabled: boolean;
  reason: string | null;
  onClose: () => void;
}) {
  return (
    <SheetFooter className="flex-col sm:flex-col sm:justify-start md:flex-row-reverse md:justify-start">
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
    </SheetFooter>
  );
}

/** Fermeture : brouillon écrit puis annoncé, échec ou liste en retard effacés, « Vérifier la liste ». */
function useFormClose(props: BodyProps, model: FeatureFormModel) {
  const { write, announce, onClose, closeRef } = props;
  const queryClient = useQueryClient();
  const close = (): void => {
    const kept = write.busy ? false : model.flushDraft();
    if (model.mine && (write.phase === "failed" || write.phase === "late")) write.dismiss();
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
      <section
        aria-label="Saisie de la fonctionnalité"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: région défilante, doit pouvoir être lue au clavier
        tabIndex={0}
        className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <FormMessages model={model} write={write} onClose={close} onCheckList={checkList} />
        <GeneralFields {...field} />
        <DescriptionField {...field} />
        <CriteriaEditor {...field} announce={announce} original={model.state.baseline} />
        <LinksFields {...field} designer={role === "designer"} />
      </section>
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
  const { projectId, mode, specId, role, onClose, keepFocus } = props;
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
  const ready = mode === "create" || query.data !== undefined;
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
        {ready ? (
          <FormBody
            {...props}
            detail={query.data ?? null}
            owner={owner.current}
            closeRef={closeRef}
          />
        ) : (
          <>
            <section
              aria-label="Saisie de la fonctionnalité"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: région défilante, doit pouvoir être lue au clavier
              tabIndex={0}
              className="flex-1 overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {query.isError ? (
                <FeatureError
                  view={describeFeatureError(query.error, role)}
                  role={role}
                  onRetry={() => void query.refetch()}
                />
              ) : (
                <Loading />
              )}
            </section>
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
