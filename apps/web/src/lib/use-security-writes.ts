"use client";

import type { SpecBatchOutput } from "@koklo/contract";
import { useToast } from "@koklo/ui";
import { useEffect, useRef } from "react";
import { orpc } from "./orpc.ts";
import { IN_PLACE_SAVED, type SecurityPageModel } from "./use-security-page.ts";

const OWNER = 4_500;

interface InPlace {
  /** Cible de l'écriture : « asvs-level » ou « summary ». */
  target: string;
  title: string;
  snapshot: string;
  send: (envelope: {
    projectId: string;
    idempotencyKey: string;
    branch: string;
    baseSha: string;
  }) => Promise<SpecBatchOutput>;
}

/** Écriture sur place (un lot d'une opération, B807) : suivie comme tout enregistrement, le focus ne bouge pas. */
function useInPlaceWrite({ projectId, head, write }: SecurityPageModel) {
  return ({ target, title, snapshot, send }: InPlace): void => {
    if (!head || write.busy || write.behind) return;
    const base = { projectId, branch: head.branch, baseSha: head.commitSha };
    write.submit({
      send: (idempotencyKey) => send({ ...base, idempotencyKey }),
      snapshot: JSON.stringify([target, snapshot, head.commitSha]),
      meta: {
        owner: OWNER,
        kind: "update",
        title,
        status: "",
        priority: "",
        target,
        inPlace: true,
      },
    });
  };
}

/** Toast d'une écriture sur place (« Niveau enregistré »), une fois par commit. */
export function useInPlaceToast({ write }: SecurityPageModel): void {
  const { toast } = useToast();
  const done = useRef<string | null>(null);
  const { saved } = write;
  useEffect(() => {
    const title = saved ? IN_PLACE_SAVED[saved.meta.target] : undefined;
    if (!saved?.commitSha || !title) return;
    const key = `${saved.meta.target}:${saved.commitSha}`;
    if (done.current === key) return;
    done.current = key;
    toast({ tone: "success", title, action: { label: "OK", onClick: () => undefined } });
  }, [saved, toast]);
}

/** « Niveau d'exigence » : choix immédiat par qui écrit ; la valeur choisie reste affichée pendant l'écriture. */
export function useSecurityLevel(page: SecurityPageModel, current: 1 | 2 | 3) {
  const submit = useInPlaceWrite(page);
  const { write, form } = page;
  const chosen = useRef<1 | 2 | 3>(current);
  const pending = write.busy && write.meta?.target === "asvs-level";
  return {
    value: pending ? chosen.current : current,
    choose: (level: 1 | 2 | 3) => {
      if (!form.canWrite || level === current) return;
      chosen.current = level;
      submit({
        target: "asvs-level",
        title: `Niveau ${level}`,
        snapshot: String(level),
        send: (envelope) => orpc.security.asvs.setLevel.call({ ...envelope, level }),
      });
    },
  };
}

/** « Accepter » la proposition de résumé (`security.summary.accept`). */
export function useAcceptSummary(page: SecurityPageModel) {
  const submit = useInPlaceWrite(page);
  return (proposalId: string): void =>
    submit({
      target: "summary",
      title: "Résumé client",
      snapshot: proposalId,
      send: (envelope) => orpc.security.summary.accept.call({ ...envelope, proposalId }),
    });
}
