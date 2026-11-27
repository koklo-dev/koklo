"use client";

import { COMMENT_BODY_MAX } from "@koklo/contract";
import { Icon, IconButton, Skeleton, Textarea } from "@koklo/ui";
import { type FormEvent, useState } from "react";
import { CLIENT_COMMENT_SENT } from "../lib/architecture-client-labels.ts";
import { COMMENT_FAILED } from "../lib/data-client-labels.ts";
import { shortDate } from "../lib/overview-labels.ts";
import { CLIENT_QUESTION_HELP } from "../lib/technical-labels.ts";
import { useArchitectureComment } from "../lib/use-client-architecture.ts";
import { useSectionComments } from "../lib/use-client-technical.ts";
import { ErrorNotice } from "./error-notice.tsx";

function Thread({ projectId, specId }: { projectId: string; specId: string }) {
  const query = useSectionComments(projectId, specId);
  if (query.isError) {
    return (
      <ErrorNotice onRetry={() => void query.refetch()}>
        Les commentaires n'ont pas pu être chargés.
      </ErrorNotice>
    );
  }
  if (query.isPending) return <Skeleton aria-busy="true" className="h-10 rounded-[10px]" />;
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {query.data.items.map((item) => (
        <li
          key={item.id}
          className="flex flex-col gap-1 rounded-[10px] border border-border bg-background px-3 py-2.5 text-meta"
        >
          <span className="font-semibold">
            {`${item.authorKind === "client" ? "Client" : "Équipe"} · ${shortDate(item.createdAt)}`}
          </span>
          <p className="m-0 whitespace-pre-wrap break-words">{item.body}</p>
        </li>
      ))}
    </ul>
  );
}

/** Saisie d'une question sur la section ouverte : envoyée par `comment.create`, le texte reste en cas d'échec. */
function Question({ projectId, specId }: { projectId: string; specId: string }) {
  const comment = useArchitectureComment(projectId);
  const [body, setBody] = useState("");
  const [sent, setSent] = useState("");
  const text = body.trim();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text || comment.pending) return;
    setSent("");
    if (await comment.send({ kind: "tech_section", ref: specId }, text)) {
      setBody("");
      setSent(CLIENT_COMMENT_SENT);
    }
  };
  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-2 border-t border-border px-4 pt-3 pb-4"
    >
      {comment.failed ? <p className="m-0 text-meta text-destructive">{COMMENT_FAILED}</p> : null}
      <div className="flex items-end gap-2 rounded-[10px] border border-border bg-background py-2 pr-2 pl-3 focus-within:ring-2 focus-within:ring-ring">
        <Textarea
          rows={2}
          aria-label="Votre question"
          placeholder="Poser une question à l'équipe"
          maxLength={COMMENT_BODY_MAX}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="min-h-0 flex-1 resize-none border-0 bg-transparent px-0 py-0 focus-visible:ring-0"
        />
        <IconButton
          type="submit"
          tone="primary"
          icon="arrow_upward"
          aria-label="Envoyer"
          className="max-md:size-11"
          disabled={!text || comment.pending}
        />
      </div>
      <span role="status" className="text-caption text-muted-foreground">
        {sent}
      </span>
    </form>
  );
}

/** Colonne « Questions et commentaires » du document, pour le client (maquette 14 l.383-420). */
export function TechnicalClientComments({
  projectId,
  specId,
}: {
  projectId: string;
  specId: string;
}) {
  return (
    <aside
      aria-label="Questions et commentaires"
      className="flex flex-col border-border bg-surface max-lg:border-t lg:w-[340px] lg:shrink-0 lg:border-l"
    >
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
        <span
          aria-hidden="true"
          className="flex size-7 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"
        >
          <Icon name="forum" size={18} />
        </span>
        <span className="font-semibold">Questions et commentaires</span>
      </div>
      <div className="flex flex-1 flex-col gap-3.5 p-4">
        <span className="text-meta text-muted-foreground">{CLIENT_QUESTION_HELP}</span>
        <Thread projectId={projectId} specId={specId} />
      </div>
      <Question key={specId} projectId={projectId} specId={specId} />
    </aside>
  );
}
