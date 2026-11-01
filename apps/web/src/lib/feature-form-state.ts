import type { FeatureDetail, Role } from "@koklo/contract";
import type { Dispatch, SetStateAction } from "react";
import { readDraft } from "./feature-draft.ts";
import type { SaveErrorView } from "./feature-errors.ts";
import {
  checkDesignerScreens,
  EMPTY_VALUES,
  type FeatureFormValues,
  type FieldKey,
  type FormIssue,
  LINK_FIELDS,
  parseLinks,
  validateFeatureForm,
} from "./feature-form.ts";
import { FIELD_LABELS } from "./feature-form-ids.ts";
import { fieldOfIssue } from "./spec-issues.ts";
import type { FeatureWrite } from "./use-feature-submit.ts";

/** Clé d'idempotence gardée avec un brouillon, valable tant que la saisie est celle du brouillon. */
export interface ResumeKey {
  key: string;
  snapshot: string;
}

/** Mise à jour de l'état du formulaire, partagée par les hooks qui le pilotent. */
export type SetFormState = Dispatch<SetStateAction<FormState>>;

export type Banner = { kind: "resumed"; savedAt: string } | { kind: "changed"; savedAt: string };

export interface FormState {
  values: FeatureFormValues;
  baseline: FeatureFormValues | null;
  baseCommitSha: string | null;
  /** Version de la spec lue à l'ouverture ou au dernier rechargement ; absente à la création. */
  baseSha: string | undefined;
  /** Dernière version lue pendant un rechargement, pour « Valeur actuelle dans la spec ». */
  current: FeatureFormValues | null;
  conflicts: FieldKey[];
  banner: Banner | null;
  confirming: boolean;
  linksOpen: boolean;
  touched: string[];
  submitted: number;
  serverFields: FieldKey[];
  /** Rechargements consécutifs qui n'ont pas changé la version lue. */
  unchangedReloads: number;
}

export interface FormArgs {
  projectId: string;
  mode: "create" | "edit";
  specId?: string | undefined;
  role: Role | undefined;
  /** Fonctionnalité lue (modification). */
  detail: FeatureDetail | null;
  head: { branch: string; commitSha: string };
  write: FeatureWrite;
  owner: number;
  announce: (text: string) => void;
}

const hasLinks = (values: FeatureFormValues): boolean =>
  LINK_FIELDS.some((field) => parseLinks(values[field]).length > 0);

/** Brouillon repris ou valeurs lues : l'état du formulaire à son ouverture (S-feature-form §5.5). */
export function initialState(
  args: FormArgs,
  current: FeatureFormValues | null,
): { state: FormState; resume: ResumeKey | undefined } {
  const { projectId, mode, specId, detail, head, role } = args;
  const draft = readDraft(projectId, specId ?? "new");
  const opensLinks = (values: FeatureFormValues) => role === "designer" || hasLinks(values);
  const base: FormState = {
    values: current ?? EMPTY_VALUES,
    baseline: current,
    baseCommitSha: detail?.commitSha ?? null,
    baseSha: mode === "edit" ? head.commitSha : undefined,
    current: null,
    conflicts: [],
    banner: null,
    confirming: false,
    linksOpen: false,
    touched: [],
    submitted: 0,
    serverFields: [],
    unchangedReloads: 0,
  };
  if (!draft) return { state: { ...base, linksOpen: opensLinks(base.values) }, resume: undefined };
  const values = { ...EMPTY_VALUES, ...draft.values };
  const changed = mode === "edit" && draft.baseCommitSha !== (detail?.commitSha ?? null);
  const state: FormState = {
    ...base,
    values,
    baseline: changed ? (draft.baseline ?? current) : current,
    baseCommitSha: changed ? draft.baseCommitSha : base.baseCommitSha,
    banner: { kind: changed ? "changed" : "resumed", savedAt: draft.savedAt },
    linksOpen: opensLinks(values),
  };
  const resume = draft.idempotencyKey
    ? { key: draft.idempotencyKey, snapshot: JSON.stringify([values, base.baseSha]) }
    : undefined;
  return { state, resume };
}

/** Erreurs de validation, plus le contrôle préalable du designer une fois un envoi tenté (§5.4). */
export function collectIssues(state: FormState, args: FormArgs): FormIssue[] {
  const issues = validateFeatureForm(state.values);
  if (args.role !== "designer" || state.submitted === 0) return issues;
  const mode = args.mode === "create" ? "create" : "update";
  const designer = checkDesignerScreens(mode, state.baseline, state.values);
  return designer ? [...issues, designer] : issues;
}

/** Champs que le serveur désigne : diagnostics `SPEC_INVALID` rattachés à un champ, champ de `VALIDATION`. */
export function serverFields(view: SaveErrorView): FieldKey[] {
  const fields = (view.report?.issues ?? []).map(fieldOfIssue);
  if (view.field && view.field in FIELD_LABELS) fields.push(view.field as FieldKey);
  return [...new Set(fields.filter((field): field is FieldKey => field !== null))];
}
