"use client";

import { COMMENT_BODY_MAX } from "@koklo/contract";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InlineAlert,
  Label,
  Textarea,
} from "@koklo/ui";
import { useEffect, useRef, useState } from "react";
import {
  COMMENT_FAILED,
  COMMENT_HELP,
  COMMENT_LABEL,
  commentTitleOf,
} from "../lib/data-client-labels.ts";

interface Props {
  open: boolean;
  tableName: string;
  pending: boolean;
  /** Le dernier envoi a échoué : l'alerte s'affiche et le champ reprend le focus, le texte reste. */
  failed: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: string) => void;
  /** Rend le focus au bouton « Commenter » qui a ouvert le dialogue (Radix ne le fait que depuis un `Trigger`). */
  restoreFocus?: (() => void) | undefined;
}

/**
 * Dialogue « Commenter » d'une table (B448), même motif que les décisions du client : titre nommant la table, champ
 * libre, « Envoyer » et « Annuler ». Échap ferme et rend le focus au bouton « Commenter » ; un échec s'annonce dans le
 * dialogue et remet le focus au champ.
 */
export function DataCommentDialog({
  open,
  tableName,
  pending,
  failed,
  onOpenChange,
  onSubmit,
  restoreFocus,
}: Props) {
  const [body, setBody] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (failed) field.current?.focus();
  }, [failed]);
  const text = body.trim();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[520px]"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus?.();
        }}
      >
        <DialogHeader icon="add_comment">
          <DialogTitle>{commentTitleOf(tableName)}</DialogTitle>
          <DialogDescription>{COMMENT_HELP}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {failed ? (
            <InlineAlert variant="error" icon="error">
              {COMMENT_FAILED}
            </InlineAlert>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="data-comment-body">{COMMENT_LABEL}</Label>
            <Textarea
              id="data-comment-body"
              ref={field}
              rows={5}
              maxLength={COMMENT_BODY_MAX}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" disabled={text === "" || pending} onClick={() => onSubmit(text)}>
            Envoyer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
