"use client";

import type { ClientSpaceSecurity } from "@koklo/contract";
import { COMMENT_BODY_MAX } from "@koklo/contract";
import { Button, ContextBanner, EmptyState, Icon, QuestionCard, Skeleton } from "@koklo/ui";
import { type Ref, useState } from "react";
import { shortDate } from "../lib/overview-labels.ts";
import {
  ASK_BUTTON,
  BUSINESS_INTRO,
  CLIENT_INTRO,
  CLIENT_LEAD,
  CLIENT_STATUS,
  CLIENT_TAB,
  CONTACT_ADD,
  CONTACT_EDIT,
  CONTACT_SAVED,
  LIST_ERROR_TEXT,
  NOT_VALIDATED_TEXT,
  NOT_VALIDATED_TITLE,
  QUESTION_FAILED,
  QUESTION_PLACEHOLDER,
  QUESTION_SENT,
  QUESTION_TITLE,
  SECURITY_ERROR_TITLE,
  summaryFoot,
} from "../lib/security-labels.ts";
import { specPath } from "../lib/shell-routes.ts";
import { useArchitectureComment } from "../lib/use-client-architecture.ts";
import { useClientSecurity } from "../lib/use-security-summary.ts";
import { ErrorNotice } from "./error-notice.tsx";
import { SecurityContactForm } from "./security-contact-form.tsx";
import { SecurityHeader } from "./security-header.tsx";
import { ContactExpectation, SummaryCards } from "./security-summary-cards.tsx";

/** Question à l'équipe : un commentaire sur le résumé (`security_summary`, B802) ; le texte reste en cas d'échec. */
function Question({
  projectId,
  onClose,
  onSent,
}: {
  projectId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const comment = useArchitectureComment(projectId);
  const [body, setBody] = useState("");
  const send = async () => {
    if (comment.pending) return;
    const target = { kind: "security_summary" as const, ref: "summary" };
    if (await comment.send(target, body.trim())) onSent();
  };
  return (
    <QuestionCard
      title={QUESTION_TITLE}
      placeholder={QUESTION_PLACEHOLDER}
      value={body}
      maxLength={COMMENT_BODY_MAX}
      pending={comment.pending}
      error={comment.failed ? QUESTION_FAILED : undefined}
      onChange={setBody}
      onSend={() => void send()}
      onCancel={onClose}
    />
  );
}

/** Contact attendu du client : sa carte, puis la saisie. Le business n'en voit rien (B803). */
function Contact({
  projectId,
  data,
  announce,
}: {
  projectId: string;
  data: ClientSpaceSecurity;
  announce: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const { contact } = data;
  return (
    <>
      <ContactExpectation
        contact={contact}
        action={
          <Button
            type="button"
            variant={contact ? "outline" : "default"}
            className="h-8 max-md:h-11"
            aria-expanded={editing}
            onClick={() => setEditing(true)}
          >
            {contact ? CONTACT_EDIT : CONTACT_ADD}
          </Button>
        }
      />
      {editing ? (
        <SecurityContactForm
          projectId={projectId}
          initial={contact}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            announce(CONTACT_SAVED);
          }}
        />
      ) : null}
    </>
  );
}

interface BodyProps {
  projectId: string;
  data: ClientSpaceSecurity;
  /** Client lié : seul à agir. */
  acting: boolean;
  asking: boolean;
  closeQuestion: () => void;
  announce: (text: string) => void;
}

function Summary({ projectId, data, acting, asking, closeQuestion, announce }: BodyProps) {
  return (
    <div className="flex min-w-0 flex-col gap-4 px-4 pt-5 pb-8 md:px-7">
      <ContextBanner icon="info">{acting ? CLIENT_INTRO : BUSINESS_INTRO}</ContextBanner>
      <SummaryCards cards={data.cards} />
      {acting ? <Contact projectId={projectId} data={data} announce={announce} /> : null}
      {acting && asking ? (
        <Question
          projectId={projectId}
          onClose={closeQuestion}
          onSent={() => {
            closeQuestion();
            announce(QUESTION_SENT);
          }}
        />
      ) : null}
      <p className="m-0 text-caption font-normal text-muted-foreground">
        {summaryFoot(data.validatedAt ? shortDate(data.validatedAt) : undefined)}
      </p>
    </div>
  );
}

function Body(props: Omit<BodyProps, "data"> & { query: ReturnType<typeof useClientSecurity> }) {
  const { query, ...rest } = props;
  if (query.isError) {
    return (
      <div className="p-4 md:px-7">
        <ErrorNotice title={SECURITY_ERROR_TITLE} onRetry={() => void query.refetch()}>
          {LIST_ERROR_TEXT}
        </ErrorNotice>
      </div>
    );
  }
  const data = query.data as ClientSpaceSecurity | undefined;
  if (!data) {
    return (
      <div className="p-4 md:px-7">
        <Skeleton aria-busy="true" className="h-64 rounded-xl" />
      </div>
    );
  }
  if (!data.available) {
    return (
      <div className="mx-auto mt-8 w-full max-w-[580px] px-4 pb-8">
        <EmptyState
          icon="schedule"
          title={NOT_VALIDATED_TITLE}
          description={NOT_VALIDATED_TEXT}
          wideDescription
        />
      </div>
    );
  }
  return <Summary data={data} {...rest} />;
}

/** Vue client et business (maquette 15, état « Vue client ») : le résumé validé seul ; seul le client agit. */
export function SecurityClientView({
  projectId,
  name,
  titleRef,
  acting,
}: {
  projectId: string;
  name: string | undefined;
  titleRef: Ref<HTMLHeadingElement>;
  acting: boolean;
}) {
  const query = useClientSecurity(projectId);
  const [asking, setAsking] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const available = query.data?.available === true;
  return (
    <>
      <SecurityHeader
        projectId={projectId}
        name={name}
        titleRef={titleRef}
        status="ready"
        statusLabel={CLIENT_STATUS}
        statusIcon="visibility"
        summary={CLIENT_LEAD}
        actions={
          acting && available ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full md:h-9 md:w-auto"
              onClick={() => setAsking(true)}
            >
              <Icon name="add_comment" size={20} />
              {ASK_BUTTON}
            </Button>
          ) : null
        }
        tabs={[
          {
            label: CLIENT_TAB,
            icon: "summarize",
            href: `${specPath(projectId, "security")}?tab=summary`,
            active: true,
          },
        ]}
      />
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <Body
        projectId={projectId}
        query={query}
        acting={acting}
        asking={asking}
        closeQuestion={() => setAsking(false)}
        announce={setAnnouncement}
      />
    </>
  );
}
