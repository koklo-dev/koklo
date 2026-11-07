"use client";

import { type MeOutput, meUpdateInputSchema } from "@koklo/contract";
import { Alert, AlertDescription, Button, Icon } from "@koklo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useRef, useState } from "react";
import { fieldErrors, GENERIC_ERROR } from "../lib/form-errors.ts";
import { orpc } from "../lib/orpc.ts";
import { AccountNotifications } from "./account-notifications.tsx";
import { ErrorNotice } from "./error-notice.tsx";
import { FormField } from "./form-field.tsx";
import { LoadingStatus } from "./loading-status.tsx";
import { ThemeChoice } from "./theme-choice.tsx";

const MESSAGES = {
  name: {
    too_small: "Saisissez votre nom.",
    too_big: "Le nom ne peut pas dépasser 80 caractères.",
    default: "Le nom ne peut pas dépasser 80 caractères.",
  },
};

function useNameForm(me: MeOutput) {
  const queryClient = useQueryClient();
  const update = useMutation(orpc.me.update.mutationOptions());
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(me.name);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  function submit(event: FormEvent): void {
    event.preventDefault();
    setSaved(false);
    const parsed = meUpdateInputSchema.safeParse({ name });
    if (!parsed.success) {
      setError(fieldErrors(parsed.error.issues, MESSAGES).name);
      input.current?.focus();
      return;
    }
    setError(undefined);
    update.mutate(parsed.data, {
      onSuccess: async () => {
        setSaved(true);
        await queryClient.invalidateQueries();
      },
    });
  }
  return {
    submit,
    name,
    setName,
    input,
    error,
    saved,
    busy: update.isPending,
    failed: update.isError,
  };
}

function NameForm({ me }: { me: MeOutput }) {
  const form = useNameForm(me);
  return (
    <form onSubmit={form.submit} noValidate className="flex max-w-xl flex-col gap-4">
      {form.failed ? (
        <ErrorNotice title="Impossible d'enregistrer">{GENERIC_ERROR}</ErrorNotice>
      ) : null}
      <FormField
        ref={form.input}
        label="Nom"
        value={form.name}
        onChange={(event) => form.setName(event.target.value)}
        readOnly={form.busy}
        error={form.error}
        autoComplete="name"
      />
      <FormField
        label="Adresse e-mail"
        hint="Cette adresse sert à vous connecter"
        value={me.email}
        readOnly
        autoComplete="email"
      />
      <Button
        type="submit"
        className="h-11 w-full md:h-9 md:w-fit"
        disabled={form.busy}
        aria-busy={form.busy}
      >
        {form.busy ? "Enregistrement…" : "Enregistrer"}
      </Button>
      {form.saved ? (
        <Alert role="status">
          <Icon name="check_circle" size={20} />
          <AlertDescription>Nom enregistré</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}

/** Mon compte : nom, e-mail en lecture seule, thème, préférences d'e-mail ; ouvert à tous les rôles. */
export function AccountPage() {
  const me = useQuery(orpc.me.get.queryOptions());
  let body = <LoadingStatus label="Chargement de votre compte…" />;
  if (me.data) {
    body = (
      <>
        <NameForm me={me.data} />
        <ThemeChoice />
        <AccountNotifications role={me.data.role} />
      </>
    );
  } else if (me.isError && !me.isFetching) {
    body = (
      <ErrorNotice title="Impossible de charger votre compte" onRetry={() => void me.refetch()}>
        {GENERIC_ERROR}
      </ErrorNotice>
    );
  }
  return (
    <div data-testid="account-page" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-section-title">Mon compte</h2>
        <p className="text-meta text-muted-foreground">
          Votre nom, votre thème et les e-mails que vous recevez.
        </p>
      </div>
      {body}
    </div>
  );
}
