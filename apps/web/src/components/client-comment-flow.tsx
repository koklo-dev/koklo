"use client";

import { useRef, useState } from "react";
import { CLIENT_COMMENT_SENT } from "../lib/architecture-client-labels.ts";
import {
  type ClientCommentTarget,
  useArchitectureComment,
} from "../lib/use-client-architecture.ts";
import { DataCommentDialog } from "./data-comment-dialog.tsx";

/**
 * Flux « Commenter » de la vue client (Architecture, Technique) : cible nommée, ouverture (le bouton d'origine reprend
 * le focus à la fermeture), envoi, annonce « Commentaire envoyé ».
 */
export function useCommentFlow<T extends ClientCommentTarget>(
  projectId: string,
  titleOf: (target: T) => string,
) {
  const comment = useArchitectureComment(projectId);
  const [target, setTarget] = useState<T | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const opener = useRef<HTMLElement | null>(null);
  return {
    announcement,
    title: target ? titleOf(target) : null,
    pending: comment.pending,
    failed: comment.failed,
    open: (next: T) => {
      opener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      comment.reset();
      setAnnouncement("");
      setTarget(next);
    },
    close: () => setTarget(null),
    restoreFocus: () => opener.current?.focus(),
    submit: async (body: string) => {
      if (target && (await comment.send({ kind: target.kind, ref: target.ref }, body))) {
        setTarget(null);
        setAnnouncement(CLIENT_COMMENT_SENT);
      }
    },
  };
}

export type CommentFlow = ReturnType<typeof useCommentFlow<ClientCommentTarget>>;

export function CommentDialog({
  flow,
}: {
  flow: Pick<CommentFlow, "title" | "pending" | "failed" | "close" | "submit" | "restoreFocus">;
}) {
  if (flow.title === null) return null;
  return (
    <DataCommentDialog
      open
      title={flow.title}
      pending={flow.pending}
      failed={flow.failed}
      onOpenChange={(next) => next || flow.close()}
      onSubmit={(body) => void flow.submit(body)}
      restoreFocus={flow.restoreFocus}
    />
  );
}
