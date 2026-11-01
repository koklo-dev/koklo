"use client";

import type { SpecBatchOutput, SpecBatchSubmitInput } from "@koklo/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useRef,
  useState,
} from "react";
import { errorCode } from "./api-error.ts";
import { authClient } from "./auth-client.ts";
import { clearDraft, clearPending, type PendingSave, savePending } from "./feature-draft.ts";
import { describeSaveError, type SaveFailure } from "./feature-errors.ts";
import { orpc } from "./orpc.ts";
import { useBatchTracking } from "./use-batch-tracking.ts";
import { type Placement, reloadList, useIndexWait } from "./use-index-wait.ts";

/** Ce qu'une écriture sait d'elle-même : sert à l'étape d'envoi, au bloc de la page et au retour à la liste. */
export interface WriteMeta {
  /** Numéro du formulaire qui a lancé l'écriture (un formulaire rouvert ne reprend pas l'indicateur d'un autre). */
  owner: number;
  kind: "create" | "update";
  specId?: string | undefined;
  title: string;
  status: string;
  priority: string;
  /** `new` ou `F-nnn` : cible du brouillon. */
  target: string;
}
export type WritePhase = "idle" | "sending" | "tracking" | "indexing" | "late" | "failed" | "saved";
export interface SavedInfo {
  meta: WriteMeta;
  commitSha: string | null;
  /** L'index a rattrapé l'écriture mais n'est plus lisible. */
  indexFailed: boolean;
  placement: Placement | null;
}
export interface WriteState {
  phase: WritePhase;
  meta: WriteMeta | null;
  batchId: string | null;
  batch: SpecBatchOutput | null;
  /** Le suivi a dépassé 60 s : il continue sans la page (voir « Vérifier maintenant »). */
  slow: boolean;
  /** Première relecture immédiate : reprise au rechargement. */
  eager: boolean;
  failure: SaveFailure | null;
  saved: SavedInfo | null;
}

const IDLE: WriteState = {
  phase: "idle",
  meta: null,
  batchId: null,
  batch: null,
  slow: false,
  eager: false,
  failure: null,
  saved: null,
};
const ACTIVE: WritePhase[] = ["sending", "tracking", "indexing"];

export interface SubmitRequest {
  build: (idempotencyKey: string) => SpecBatchSubmitInput;
  /** Empreinte de la saisie : une clé n'est reprise que pour une saisie identique. */
  snapshot: string;
  meta: WriteMeta;
  /** Clé gardée avec un brouillon repris. */
  resume?: { key: string; snapshot: string } | undefined;
}
interface KeyRecord {
  key: string;
  snapshot: string;
  reusable: boolean;
}
export interface WriteOptions {
  projectId: string;
  /** Filtres de la liste, pour dire où la ligne enregistrée apparaîtra. */
  filters: () => { status?: string | undefined; priority?: string | undefined };
}

const newKey = (): string => `feature-${crypto.randomUUID()}`;

interface Core {
  projectId: string;
  update: (next: Partial<WriteState>) => void;
  busy: MutableRefObject<boolean>;
  keyRecord: MutableRefObject<KeyRecord | null>;
  metaRef: MutableRefObject<WriteMeta | null>;
}

/** État de l'écriture, drapeau « occupé » lisible tout de suite (double clic) et mémoire de la clé d'idempotence. */
function useWriteCore(projectId: string) {
  const [state, setState] = useState<WriteState>(IDLE);
  const busy = useRef(false);
  const keyRecord = useRef<KeyRecord | null>(null);
  const metaRef = useRef<WriteMeta | null>(null);
  const update = useCallback((next: Partial<WriteState>) => {
    if (next.phase) busy.current = ACTIVE.includes(next.phase);
    setState((current) => ({ ...current, ...next }));
  }, []);
  return { state, setState, core: { projectId, update, busy, keyRecord, metaRef } as Core };
}

/** Issues d'un lot : échec (la clé est reprise seulement après une absence de réponse), écrit, en cours. */
function useBatchOutcomes({ projectId, update, keyRecord, metaRef }: Core) {
  const fail = useCallback(
    (failure: SaveFailure) => {
      clearPending(projectId);
      const { freshKey } = describeSaveError(failure, { role: undefined, mode: "create" });
      if (freshKey) keyRecord.current = null;
      else if (keyRecord.current) keyRecord.current.reusable = true;
      update({ phase: "failed", failure });
    },
    [projectId, update, keyRecord],
  );

  const onBatch = useCallback(
    (batch: SpecBatchOutput) => {
      const meta = metaRef.current;
      if (batch.status === "committed" && meta) {
        const specId = meta.specId ?? batch.results[0]?.specId ?? undefined;
        metaRef.current = { ...meta, specId };
        clearDraft(projectId, meta.target);
        clearPending(projectId);
        keyRecord.current = null;
        update({ phase: "indexing", meta: metaRef.current, batch, batchId: batch.id, slow: false });
      } else if (batch.status === "failed" || batch.status === "conflict") {
        fail({ source: "batch", batch });
      } else update({ batch });
    },
    [fail, keyRecord, metaRef, projectId, update],
  );

  /** Réponse de `submit` : un lot non terminal est suivi (marqueur local), un lot terminal est traité tout de suite. */
  const onReply = useCallback(
    (meta: WriteMeta, batch: SpecBatchOutput) => {
      const specId = meta.specId ?? batch.results[0]?.specId ?? undefined;
      metaRef.current = { ...meta, specId };
      if (batch.status !== "queued" && batch.status !== "committing") {
        update({ meta: metaRef.current, batch, batchId: batch.id });
        return onBatch(batch);
      }
      const pending: PendingSave = {
        batchId: batch.id,
        kind: meta.kind,
        title: meta.title,
        savedAt: new Date().toISOString(),
        ...(specId ? { specId } : {}),
      };
      savePending(projectId, pending);
      update({ phase: "tracking", meta: metaRef.current, batch, batchId: batch.id, slow: false });
    },
    [metaRef, onBatch, projectId, update],
  );
  return { fail, onBatch, onReply };
}

/** `UNAUTHORIZED` : session perdue -> /login, session sans organisation -> /organizations, sans texte d'erreur. */
function useUnauthorizedExit() {
  const router = useRouter();
  return useCallback(async () => {
    const { data } = await authClient.getSession();
    router.replace(data && !data.session.activeOrganizationId ? "/organizations" : "/login");
  }, [router]);
}

function useSubmit(
  core: Core,
  outcomes: ReturnType<typeof useBatchOutcomes>,
  exit: () => Promise<void>,
) {
  const { busy, keyRecord, metaRef, update } = core;
  const mutation = useMutation(orpc.specBatch.submit.mutationOptions());
  return useCallback(
    (request: SubmitRequest) => {
      if (busy.current) return;
      const { meta, snapshot } = request;
      const known: KeyRecord | null =
        keyRecord.current ?? (request.resume ? { ...request.resume, reusable: true } : null);
      const key = known?.reusable && known.snapshot === snapshot ? known.key : newKey();
      keyRecord.current = { key, snapshot, reusable: false };
      metaRef.current = meta;
      busy.current = true;
      update({ ...IDLE, phase: "sending", meta });
      mutation.mutateAsync(request.build(key)).then(
        (batch) => outcomes.onReply(meta, batch),
        (error: unknown) => {
          if (errorCode(error) !== "UNAUTHORIZED")
            return outcomes.fail({ source: "submit", error });
          update({ ...IDLE });
          void exit();
        },
      );
    },
    [busy, exit, keyRecord, metaRef, mutation, outcomes, update],
  );
}

/** Suivi du lot (60 s) puis attente de l'index (30 s) : chaque fin rend la main à l'état de l'écriture. */
function useFollowUp(
  core: Core,
  setState: Dispatch<SetStateAction<WriteState>>,
  state: WriteState,
  outcomes: ReturnType<typeof useBatchOutcomes>,
  options: { exit: () => Promise<void>; filters: WriteOptions["filters"] },
) {
  const { projectId, update, metaRef } = core;
  const queryClient = useQueryClient();
  const tracking = useBatchTracking({
    projectId,
    active: state.phase === "tracking",
    batchId: state.batchId,
    eager: state.eager,
    onBatch: outcomes.onBatch,
    onSlow: () => update({ slow: true }),
    onError: (error) => {
      if (errorCode(error) === "UNAUTHORIZED") void options.exit();
      else if (errorCode(error) === "NOT_FOUND") outcomes.fail({ source: "submit", error });
    },
  });
  useIndexWait({
    projectId,
    active: state.phase === "indexing",
    commitSha: state.batch?.commitSha ?? null,
    onCaughtUp: (head) => {
      const meta = metaRef.current;
      if (!meta) return;
      const indexFailed = head.status === "failed";
      const commitSha = state.batch?.commitSha ?? null;
      update({ phase: "saved", saved: { meta, commitSha, indexFailed, placement: null } });
      void reloadList(queryClient, meta, options.filters(), indexFailed).then((placement) =>
        setState((current) =>
          current.saved ? { ...current, saved: { ...current.saved, placement } } : current,
        ),
      );
    },
    onLate: () => update({ phase: "late" }),
  });
  return tracking;
}

/** Reprise au rechargement : l'écriture repart du marqueur local, sans nouvel envoi. */
function useResume({ busy, metaRef, update }: Core) {
  return useCallback(
    (pending: PendingSave) => {
      if (busy.current) return;
      const meta: WriteMeta = {
        owner: -1,
        kind: pending.kind,
        specId: pending.specId,
        title: pending.title,
        status: "",
        priority: "",
        target: pending.specId ?? "new",
      };
      metaRef.current = meta;
      update({ ...IDLE, phase: "tracking", meta, batchId: pending.batchId, eager: true });
    },
    [busy, metaRef, update],
  );
}

/**
 * Écriture d'une fonctionnalité au niveau de la page (elle survit à la fermeture du formulaire) : envoi par
 * `specBatch.submit`, suivi du lot, attente de l'index puis retour à la liste (S-feature-form §4.4 à §5.7).
 */
export function useFeatureWrite({ projectId, filters }: WriteOptions) {
  const { state, setState, core } = useWriteCore(projectId);
  const { update, busy, keyRecord } = core;
  const outcomes = useBatchOutcomes(core);
  const exit = useUnauthorizedExit();
  const tracking = useFollowUp(core, setState, state, outcomes, { exit, filters });
  return {
    ...state,
    busy: ACTIVE.includes(state.phase),
    submit: useSubmit(core, outcomes, exit),
    resume: useResume(core),
    /** Clé d'idempotence de l'envoi en cours ou réutilisable, gardée avec le brouillon. */
    currentKey: (): string | null => keyRecord.current?.key ?? null,
    /** « Vérifier maintenant » : relit tout de suite et ouvre une nouvelle fenêtre de suivi. */
    restart: () => {
      update({ slow: false });
      tracking.restart();
    },
    /** « Actualiser la liste » : rouvre une fenêtre d'attente de l'index. */
    refreshIndex: () => update({ phase: "indexing" }),
    /** Efface l'échec, la confirmation ou l'état d'attente de l'index (sans effet pendant une écriture). */
    dismiss: () => {
      if (!busy.current) update({ ...IDLE });
    },
  };
}

export type FeatureWrite = ReturnType<typeof useFeatureWrite>;
