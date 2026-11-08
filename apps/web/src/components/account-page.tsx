"use client";

import { type MeOutput, meUpdateInputSchema } from "@koklo/contract";
import { Button, Card, InlineAlert, SegmentedControl } from "@koklo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useRef, useState } from "react";
import { THEME_CHOICES } from "../lib/account-labels.ts";
import { fieldErrors, GENERIC_ERROR } from "../lib/form-errors.ts";
import { orpc } from "../lib/orpc.ts";
import type { ThemePreference } from "../lib/theme.ts";
import { AccountNotifications } from "./account-notifications.tsx";
import { ErrorNotice } from "./error-notice.tsx";
import { FormField } from "./form-field.tsx";
import { LoadingStatus } from "./loading-status.tsx";
import { SectionHeading } from "./section-heading.tsx";
import { useTheme } from "./theme-toggle.tsx";

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

/** Thème Clair / Sombre / Système : contrôle segmenté en radios (flèches, Tab), appliqué à l'action. */
function ThemeField() {
  const { preference, select } = useTheme();
  return (
    <div className="flex basis-full flex-wrap items-center gap-2.5">
      <span className="text-meta font-semibold">Thème</span>
      <SegmentedControl
        mode="radio"
        aria-label="Thème"
        options={THEME_CHOICES}
        value={preference}
        onValueChange={(value) => select(value as ThemePreference)}
      />
    </div>
  );
}

function NameForm({ me }: { me: MeOutput }) {
  const form = useNameForm(me);
  return (
    <Card asChild>
      <form onSubmit={form.submit} noValidate className="flex flex-wrap items-end gap-3.5">
        {form.failed ? (
          <div className="basis-full">
            <ErrorNotice title="Impossible d'enregistrer">{GENERIC_ERROR}</ErrorNotice>
          </div>
        ) : null}
        <div className="min-w-0 flex-[1_1_16rem]">
          <FormField
            ref={form.input}
            label="Nom"
            value={form.name}
            onChange={(event) => form.setName(event.target.value)}
            readOnly={form.busy}
            error={form.error}
            autoComplete="name"
          />
        </div>
        <div className="min-w-0 flex-[1_1_16rem]">
          <FormField label="Adresse e-mail" value={me.email} readOnly autoComplete="email" />
        </div>
        <ThemeField />
        <Button
          type="submit"
          className="max-md:h-11 max-md:w-full"
          disabled={form.busy}
          aria-busy={form.busy}
        >
          {form.busy ? "Enregistrement…" : "Enregistrer"}
        </Button>
        {form.saved ? (
          <InlineAlert variant="success" icon="check_circle" className="basis-full">
            Nom enregistré
          </InlineAlert>
        ) : null}
      </form>
    </Card>
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
    <div data-testid="account-page" className="flex flex-col gap-5">
      <SectionHeading
        title="Mon compte"
        description="Votre profil, votre thème et les e-mails que vous recevez."
      />
      {body}
    </div>
  );
}
