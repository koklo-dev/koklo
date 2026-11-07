"use client";

import { type OrgGetOutput, orgUpdateInputSchema } from "@koklo/contract";
import { Alert, AlertDescription, Avatar, AvatarFallback, Button, Icon } from "@koklo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useRef, useState } from "react";
import { conflictReason } from "../lib/api-error.ts";
import { fieldErrors, GENERIC_ERROR, NAME_TOO_LONG } from "../lib/form-errors.ts";
import { orpc } from "../lib/orpc.ts";
import { ErrorNotice } from "./error-notice.tsx";
import { FormField } from "./form-field.tsx";
import { LoadingStatus } from "./loading-status.tsx";

const SLUG_INVALID = "Utilisez 2 à 48 lettres minuscules, chiffres ou tirets.";
const SLUG_TAKEN = "Cette adresse est déjà utilisée.";
const MESSAGES = {
  name: {
    too_small: "Saisissez le nom de l'organisation.",
    too_big: NAME_TOO_LONG,
    default: NAME_TOO_LONG,
  },
  slug: { default: SLUG_INVALID },
};

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

function Figures({ org }: { org: OrgGetOutput }) {
  const figures = [
    ["Projets", org.projectCount],
    ["Membres", org.memberCount],
    ["Fournisseurs d'IA", org.aiProviderCount],
  ] as const;
  return (
    <ul aria-label="Chiffres de l'organisation" className="grid gap-3 md:grid-cols-3">
      {figures.map(([label, value]) => (
        <li key={label} className="flex flex-col gap-1 rounded-lg border bg-card p-4">
          <span className="text-meta text-muted-foreground">{label}</span>
          <span className="text-section-title">{value}</span>
        </li>
      ))}
    </ul>
  );
}

function useOrganizationSettings(org: OrgGetOutput) {
  const queryClient = useQueryClient();
  const update = useMutation(orpc.org.update.mutationOptions());
  const slugInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(org.name);
  const [slug, setSlug] = useState(org.slug);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  function submit(event: FormEvent): void {
    event.preventDefault();
    setSaved(false);
    const parsed = orgUpdateInputSchema.safeParse({ name: name.trim(), slug: slug.trim() });
    if (!parsed.success) {
      const found = fieldErrors(parsed.error.issues, MESSAGES);
      setErrors(found);
      (found.name ? nameInput : slugInput).current?.focus();
      return;
    }
    setErrors({});
    update.mutate(parsed.data, {
      onSuccess: async () => {
        setSaved(true);
        await queryClient.invalidateQueries();
      },
      onError: (error) => {
        if (conflictReason(error) !== "slug_taken") return;
        setErrors({ slug: SLUG_TAKEN });
        slugInput.current?.focus();
      },
    });
  }

  return {
    submit,
    name,
    setName,
    slug,
    setSlug,
    nameInput,
    slugInput,
    errors,
    saved,
    busy: update.isPending,
    failed: update.isError && conflictReason(update.error) !== "slug_taken",
  };
}

function OrganizationForm({ org }: { org: OrgGetOutput }) {
  const form = useOrganizationSettings(org);
  return (
    <form onSubmit={form.submit} noValidate className="flex max-w-xl flex-col gap-4">
      <Avatar className="size-14" aria-hidden="true">
        <AvatarFallback className="text-base">{initials(form.name || org.name)}</AvatarFallback>
      </Avatar>
      {form.failed ? (
        <ErrorNotice title="Impossible d'enregistrer">{GENERIC_ERROR}</ErrorNotice>
      ) : null}
      <FormField
        ref={form.nameInput}
        label="Nom de l'organisation"
        value={form.name}
        onChange={(event) => form.setName(event.target.value)}
        readOnly={form.busy}
        error={form.errors.name}
        autoComplete="organization"
      />
      <FormField
        ref={form.slugInput}
        label="Adresse"
        hint="Lettres minuscules, chiffres et tirets."
        value={form.slug}
        onChange={(event) => form.setSlug(event.target.value)}
        readOnly={form.busy}
        error={form.errors.slug}
        className="font-mono"
        autoComplete="off"
        spellCheck={false}
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
          <AlertDescription>Modifications enregistrées</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}

/** Général : nom et adresse de l'organisation, trois chiffres (projets, membres, nombre de clés d'IA). */
export function GeneralPage() {
  const org = useQuery(orpc.org.get.queryOptions());
  let body = <LoadingStatus label="Chargement de l'organisation…" />;
  if (org.data) {
    body = (
      <>
        <Figures org={org.data} />
        <OrganizationForm org={org.data} />
      </>
    );
  } else if (org.isError && !org.isFetching) {
    body = (
      <ErrorNotice title="Impossible de charger l'organisation" onRetry={() => void org.refetch()}>
        {GENERIC_ERROR}
      </ErrorNotice>
    );
  }
  return (
    <div data-testid="general-page" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-section-title">Général</h2>
        <p className="text-meta text-muted-foreground">
          Le nom et l'adresse de votre organisation.
        </p>
      </div>
      {body}
    </div>
  );
}
