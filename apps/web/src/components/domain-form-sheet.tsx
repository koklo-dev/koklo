"use client";

import type { Role, SpecItem, SpecOperation } from "@koklo/contract";
import { type IconName, InlineAlert, SpecItemSheet } from "@koklo/ui";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { errorCode } from "../lib/api-error.ts";
import { describeSaveError, type SaveErrorView } from "../lib/feature-errors.ts";
import type { FormIssue } from "../lib/feature-form.ts";
import { buildSubmitInput } from "../lib/feature-operation.ts";
import { orpc } from "../lib/orpc.ts";
import { describeFeatureError } from "../lib/spec-errors.ts";
import type { FeatureWrite } from "../lib/use-feature-submit.ts";
import { useUnauthorizedRedirect } from "../lib/use-unauthorized-redirect.ts";
import { domainFieldId } from "./domain-form-fields.tsx";
import { FeatureDeleteConfirm } from "./feature-delete-confirm.tsx";
import { FeatureError } from "./feature-error.tsx";
import { SaveErrorAlert } from "./feature-form-errors.tsx";
import { SaveProgress } from "./save-progress.tsx";

type Type = "rule" | "role" | "flow" | "table";
/** Valeurs lues d'un élément : celles du type (`RuleDetail`…) et ce que tous portent (version, fichier). */
type Values = { commitSha: string; filePath: string };
interface Loaded<I extends Values> {
  values: I;
  validated: boolean;
  referencedBy: { items: { kind: string; specId: string; title: string }[]; total: number };
}
type Item<I extends Values> = Loaded<I>;

/** Ce qui change d'un type à l'autre : cadre du panneau, valeurs, contrôle, opération et champs. */
export interface DomainFormConfig<V, T extends Type, I extends Values> {
  type: T;
  /** Livrable du sous-titre du panneau : « Fonctionnel » par défaut, « Données » pour une table. */
  section?: string;
  icon: IconName;
  /** « règle », « rôle », « parcours » avec leur article pour les titres. */
  noun: { create: string; edit: string; loading: string };
  bodyLabel: string;
  /** Fichier écrit à la création (le nom définitif est attribué à l'enregistrement). */
  newFile: string;
  /** Ce qu'un nom déjà pris répond (`write_conflict` à la création). */
  conflict: string;
  empty: V;
  valuesOf: (values: I) => V;
  issuesOf: (values: V) => FormIssue[];
  operationOf: (values: V, edit?: { specId: string; baseline: V }) => SpecOperation | null;
  titleOf: (values: V) => string;
  labels: Record<string, string>;
  fields: (context: FieldsContext<V>) => ReactNode;
}

export interface FieldsContext<V> {
  projectId: string;
  values: V;
  set: (patch: Partial<V>) => void;
  issues: FormIssue[];
  readOnly: boolean;
}

export interface DomainFormProps {
  projectId: string;
  mode: "create" | "edit";
  specId?: string | undefined;
  role: Role | undefined;
  head: { branch: string; commitSha: string };
  write: FeatureWrite;
  statusText: string;
  announce: (text: string) => void;
  onClose: () => void;
  keepFocus: React.MutableRefObject<boolean>;
}

let lastOwner = 0;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const VALIDATED_WARNING =
  "Ce livrable est validé : enregistrer cette modification annule sa validation, qui devra être reposée sur la nouvelle version.";
const DELETE_ID = "domain-form-delete";

function frameOf<V, T extends Type, I extends Values>(
  config: DomainFormConfig<V, T, I>,
  props: DomainFormProps,
  filePath?: string,
) {
  const edit = props.mode === "edit";
  return {
    mode: props.mode,
    icon: config.icon,
    title: edit ? config.noun.edit : config.noun.create,
    subtitle: `${config.section ?? "Fonctionnel"} · ${edit ? props.specId : "identifiant attribué à l'enregistrement"}`,
    ...(edit && props.specId ? { idTag: props.specId } : {}),
    closeLabel: "Fermer le formulaire",
    bodyLabel: config.bodyLabel,
    file: edit ? (filePath ?? "") : config.newFile,
    commitNote: edit ? "un commit, relu dans l'historique" : "un commit à l'enregistrement",
    saveLabel: edit ? "Enregistrer les modifications" : "Enregistrer dans la spec",
  };
}

/** Résumé des champs à corriger, le focus y revient à chaque tentative invalide. */
function Summary<V, T extends Type, I extends Values>({
  issues,
  config,
  attempt,
}: {
  issues: FormIssue[];
  config: DomainFormConfig<V, T, I>;
  attempt: number;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: chaque tentative invalide ramène le focus ici
  useEffect(() => ref.current?.focus(), [attempt]);
  return (
    <InlineAlert variant="error" icon="error">
      <p ref={ref} tabIndex={-1} className="outline-none">
        {issues.length} point{issues.length > 1 ? "s" : ""} à corriger :{" "}
        {issues.map((issue, index) => (
          <span key={issue.field}>
            {index > 0 ? ", " : null}
            <a
              href={`#${domainFieldId(issue.field)}`}
              className="underline underline-offset-4"
              onClick={(event) => {
                event.preventDefault();
                document.getElementById(domainFieldId(issue.field))?.focus();
              }}
            >
              {config.labels[issue.field] ?? issue.field}
            </a>
          </span>
        ))}
        .
      </p>
    </InlineAlert>
  );
}

/** Table unique des échecs, avec le texte propre aux éléments du domaine pour un nom déjà pris. */
function failureView<V, T extends Type, I extends Values>(
  config: DomainFormConfig<V, T, I>,
  write: FeatureWrite,
  role: Role | undefined,
  mode: "create" | "edit",
): SaveErrorView | null {
  if (write.phase !== "failed" || !write.failure) return null;
  const view = describeSaveError(write.failure, {
    role,
    mode: write.meta?.kind === "delete" ? "delete" : mode === "edit" ? "update" : "create",
  });
  if (view.kind !== "write-conflict") return view;
  return mode === "create"
    ? { ...view, title: "Ce nom est déjà pris", text: config.conflict, actions: ["close"] }
    : {
        ...view,
        title: "Cet élément a changé ou n'existe plus dans la spec",
        text: "Fermez ce formulaire et rouvrez l'élément pour voir où il en est.",
        actions: ["close"],
      };
}

interface BodyProps<V, T extends Type, I extends Values> {
  props: DomainFormProps;
  config: DomainFormConfig<V, T, I>;
  item: Item<I> | null;
  owner: number;
  onCloseAutoFocus: (event: Event) => void;
}

type Kind = "create" | "update" | "delete";

/** Saisie, contrôle et envoi du formulaire : tout ce que le panneau lit, hors rendu. */
function useDomainForm<V, T extends Type, I extends Values>({
  props,
  config,
  item,
  owner,
}: Omit<BodyProps<V, T, I>, "onCloseAutoFocus">) {
  const { projectId, mode, specId, head, write } = props;
  const baseline = item ? config.valuesOf(item.values) : config.empty;
  const [values, setValues] = useState<V>(baseline);
  const [attempt, setAttempt] = useState(0);
  const edit = mode === "edit" && specId ? { specId, baseline } : undefined;
  const mine = write.meta?.owner === owner;
  const operation = config.operationOf(values, edit);
  const submit = (op: SpecOperation, kind: Kind, title: string) =>
    write.submit({
      build: (idempotencyKey) =>
        buildSubmitInput(
          {
            projectId,
            idempotencyKey,
            branch: head.branch,
            ...(mode === "edit" && item ? { baseSha: item.values.commitSha } : {}),
          },
          op,
        ),
      snapshot: JSON.stringify([kind, values]),
      meta: { owner, kind, specId, title, status: "", priority: "", target: specId ?? "new" },
    });
  const save = () => {
    const found = config.issuesOf(values);
    setAttempt((n) => n + 1);
    if (found.length > 0 || !operation) return;
    submit(operation, mode === "edit" ? "update" : "create", config.titleOf(values));
  };
  let reason: string | null = null;
  if (write.busy && !mine) reason = "Un enregistrement est déjà en cours.";
  else if (operation === null) reason = "Aucune modification à enregistrer.";
  return {
    baseline,
    values,
    attempt,
    mine,
    save,
    submit,
    reason,
    issues: attempt > 0 ? config.issuesOf(values) : [],
    readOnly: mine && write.busy,
    set: (patch: Partial<V>) => setValues((current) => ({ ...current, ...patch })),
    dirty: !same(values, baseline) && !(mine && write.phase !== "idle" && write.phase !== "failed"),
  };
}

type FormModel<V, T extends Type, I extends Values> = ReturnType<typeof useDomainForm<V, T, I>>;

/** « Supprimer » du pied (modification seulement) et, une fois demandée, la confirmation qui liste les renvois. */
function useDeleteProps<V, T extends Type, I extends Values>(
  { props, config, item }: Omit<BodyProps<V, T, I>, "onCloseAutoFocus" | "owner">,
  model: FormModel<V, T, I>,
) {
  const [confirming, setConfirming] = useState(false);
  const { mode, specId, write } = props;
  if (mode !== "edit" || !specId) return { deleteButtonId: DELETE_ID };
  const title = config.titleOf(model.baseline);
  return {
    deleteButtonId: DELETE_ID,
    onDelete: () => setConfirming(true),
    deleteDisabled: write.busy,
    ...(confirming
      ? {
          confirmation: (
            <FeatureDeleteConfirm
              specId={specId}
              title={title}
              busy={model.readOnly}
              referencedBy={item?.referencedBy ?? { items: [], total: 0 }}
              onConfirm={() =>
                model.submit(
                  { kind: `${config.type}.delete`, specId } as SpecOperation,
                  "delete",
                  title,
                )
              }
              onKeep={() => {
                setConfirming(false);
                document.getElementById(DELETE_ID)?.focus();
              }}
            />
          ),
        }
      : {}),
  };
}

/** Formulaire prêt : coque `SpecItemSheet`, champs du type, résumé, avancement, suppression. */
function Body<V, T extends Type, I extends Values>(body: BodyProps<V, T, I>) {
  const { props, config, item, onCloseAutoFocus } = body;
  const { projectId, mode, role, write } = props;
  const model = useDomainForm(body);
  const deleteProps = useDeleteProps(body, model);
  const { mine, readOnly, reason, issues } = model;
  const failure = mine ? failureView(config, write, role, mode) : null;
  return (
    <SpecItemSheet
      open
      {...frameOf(config, props, item?.values.filePath)}
      dirty={model.dirty}
      saving={readOnly}
      saveDisabled={Boolean(reason) || (mine && write.phase === "late")}
      onSave={model.save}
      onClose={props.onClose}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        document.getElementById(domainFieldId(Object.keys(config.labels)[0] ?? ""))?.focus();
      }}
      onCloseAutoFocus={onCloseAutoFocus}
      {...deleteProps}
      {...(mode === "edit" && item?.validated ? { warning: VALIDATED_WARNING } : {})}
      {...(issues.length > 0
        ? { errorSummary: <Summary issues={issues} config={config} attempt={model.attempt} /> }
        : {})}
      beforeFooter={
        mine && write.phase !== "idle" ? (
          <SaveProgress write={write} version={write.batch?.commitSha?.slice(0, 7) ?? null} />
        ) : null
      }
    >
      <div role="status" className="sr-only">
        {props.statusText}
      </div>
      {failure ? (
        <SaveErrorAlert
          view={failure}
          handlers={{ onRetry: model.save, onClose: props.onClose, onReload: props.onClose }}
          criteriaCount={0}
        />
      ) : null}
      {config.fields({ projectId, values: model.values, set: model.set, issues, readOnly })}
    </SpecItemSheet>
  );
}

/** Rend le focus à l'élément d'où le formulaire a été ouvert, sinon au bouton d'ajout. */
function restoreFocus(opener: Element | null, specId: string | undefined): void {
  const target =
    opener instanceof HTMLElement && opener.isConnected && opener !== document.body
      ? opener
      : (document.querySelector<HTMLElement>("[data-new-feature]") ??
        document.querySelector<HTMLElement>(`[data-spec-id="${specId}"] button`));
  target?.focus();
}

/**
 * Formulaire de création ou de modification d'une règle, d'un rôle ou d'un parcours dans `SpecItemSheet` (11 §3).
 * La modification attend la lecture de l'élément (`spec.item.get`) ; l'enregistrement est un `specBatch.submit`
 * d'une opération, sans relecture ni brouillon.
 */
export function DomainFormSheet<V, T extends Type, I extends Values>({
  props,
  config,
}: {
  props: DomainFormProps;
  config: DomainFormConfig<V, T, I>;
}) {
  const { projectId, mode, specId, role, onClose, keepFocus, statusText } = props;
  const [opener] = useState(() => document.activeElement);
  const owner = useRef(0);
  if (owner.current === 0) owner.current = ++lastOwner;
  const query = useQuery({
    ...orpc.spec.item.get.queryOptions({
      input: { projectId, type: config.type, id: specId ?? "" },
    }),
    select: (item: SpecItem) => item as unknown as Item<I>,
    enabled: mode === "edit",
  });
  useUnauthorizedRedirect(query.error);
  const ready =
    mode === "create" || (query.data !== undefined && errorCode(query.error) !== "NOT_FOUND");
  const onCloseAutoFocus = (event: Event): void => {
    event.preventDefault();
    if (!keepFocus.current) restoreFocus(opener, specId);
  };
  if (ready) {
    return (
      <Body
        props={props}
        config={config}
        item={query.data ?? null}
        owner={owner.current}
        onCloseAutoFocus={onCloseAutoFocus}
      />
    );
  }
  return (
    <SpecItemSheet
      open
      {...frameOf(config, props)}
      dirty={false}
      saveDisabled
      onSave={() => undefined}
      onClose={onClose}
      onCloseAutoFocus={onCloseAutoFocus}
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
        <p aria-busy="true" className="text-meta text-muted-foreground">
          {config.noun.loading}
        </p>
      )}
    </SpecItemSheet>
  );
}
