"use client";

import type { IdeaProposal } from "@koklo/contract";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorCode } from "./api-error.ts";
import { GENERIC_ERROR } from "./form-errors.ts";
import { rescueNoticeFocus } from "./idea-focus.ts";
import { orpc } from "./orpc.ts";

/** Délai pendant lequel une décision peut être annulée (B224). */
export const UNDO_WINDOW_MS = 10_000;

export interface DecisionNotice {
  proposalId: string;
  pageId: string | null;
  /** Titre de la page proposée (pour retrouver sa carte après « Annuler »). */
  title: string | null;
  text: string;
  undoable: boolean;
}

const STALE_ERROR = "La page a changé depuis cette proposition : elle est périmée.";

function noticeText(proposal: IdeaProposal, decision: "accept" | "reject"): string {
  if (decision === "reject") return "Proposition rejetée.";
  if (proposal.op === "create_page") return `Page « ${proposal.title ?? ""} » ajoutée.`;
  if (proposal.op === "replace") return "Passage remplacé par l'agent, accepté par vous.";
  return "Section ajoutée par l'agent, acceptée par vous.";
}

/** Relit la liste et la page touchée : ses propositions, son contenu et sa version viennent du serveur. */
function useRefreshAfterDecision(projectId: string) {
  const client = useQueryClient();
  return useCallback(
    async (pageId: string | null) => {
      await client.invalidateQueries({
        queryKey: orpc.idea.list.queryOptions({ input: { projectId } }).queryKey,
      });
      if (pageId)
        await client.invalidateQueries({
          queryKey: orpc.idea.get.queryOptions({ input: { projectId, pageId } }).queryKey,
        });
    },
    [client, projectId],
  );
}

/** Traces de décision : chacune disparaît au bout de 10 s (fin du délai pour annuler). */
function useNotices() {
  const [notices, setNotices] = useState<DecisionNotice[]>([]);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const drop = useCallback(
    (proposalId: string) =>
      setNotices((current) => current.filter((n) => n.proposalId !== proposalId)),
    [],
  );
  const add = useCallback(
    (notice: DecisionNotice) => {
      setNotices((current) => [
        ...current.filter((n) => n.proposalId !== notice.proposalId),
        notice,
      ]);
      timers.current.push(
        setTimeout(() => {
          rescueNoticeFocus(notice.proposalId, notice.pageId);
          drop(notice.proposalId);
        }, UNDO_WINDOW_MS),
      );
    },
    [drop],
  );
  return { notices, add, drop };
}

/**
 * Décisions humaines sur les propositions de l'agent (l'agent ne modifie jamais une page). Chaque succès relit la
 * liste et la page ; une trace « acceptée par vous » reste 10 s avec « Annuler » (sauf page ajoutée : corbeille de 30 jours).
 */
export function useIdeaProposals(projectId: string) {
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const refresh = useRefreshAfterDecision(projectId);
  const { notices, add, drop } = useNotices();
  const decide = useCallback(
    async (
      proposal: IdeaProposal,
      decision: "accept" | "reject",
      contentMd?: string,
    ): Promise<boolean> => {
      let done = false;
      setError(null);
      setBusyId(proposal.id);
      try {
        const body = { projectId, proposalId: proposal.id, decision };
        await orpc.idea.proposal.decide.call(
          contentMd === undefined ? body : { ...body, contentMd },
        );
        add({
          proposalId: proposal.id,
          pageId: proposal.pageId,
          title: proposal.title,
          text: noticeText(proposal, decision),
          undoable: proposal.op !== "create_page" || decision === "reject",
        });
        done = true;
      } catch (cause) {
        setError(errorCode(cause) === "CONFLICT" ? STALE_ERROR : GENERIC_ERROR);
      } finally {
        setBusyId(null);
        await refresh(proposal.pageId).catch(() => undefined);
      }
      return done;
    },
    [projectId, refresh, add],
  );
  const undo = useCallback(
    async (notice: DecisionNotice): Promise<void> => {
      drop(notice.proposalId);
      try {
        await orpc.idea.proposal.undo.call({ projectId, proposalId: notice.proposalId });
      } catch {
        setError(GENERIC_ERROR);
      }
      await refresh(notice.pageId).catch(() => undefined);
    },
    [projectId, refresh, drop],
  );
  return { decide, undo, notices, error, busyId, clearError: () => setError(null) };
}

export type IdeaProposalDecisions = ReturnType<typeof useIdeaProposals>;
