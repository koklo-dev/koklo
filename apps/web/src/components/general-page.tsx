"use client";

import { type OrgGetOutput, orgUpdateInputSchema } from "@koklo/contract";
import { Avatar, AvatarFallback, Button, Card, InlineAlert, StatCard } from "@koklo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useRef, useState } from "react";
import { conflictReason } from "../lib/api-error.ts";
import { fieldErrors, GENERIC_ERROR, NAME_TOO_LONG } from "../lib/form-errors.ts";
import { initialsOf } from "../lib/initials.ts";
import { orpc } from "../lib/orpc.ts";
import { SETTINGS_TITLES } from "../lib/settings-sections.ts";
import { ErrorNotice } from "./error-notice.tsx";
import { FormField } from "./form-field.tsx";
import { LoadingStatus } from "./loading-status.tsx";
import { SectionHeading } from "./section-heading.tsx";

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

function Figures({ org }: { org: OrgGetOutput }) {
  const figures = [
    ["Projets", org.projectCount],
    ["Membres", org.memberCount],
    ["Fournisseurs d'IA", org.aiProviderCount],
  ] as const;
  return (
    <ul aria-label="Chiffres de l'organisation" className="grid gap-3 md:grid-cols-3">
      {figures.map(([label, value]) => (
        <li key={label}>
          <StatCard label={label} value={String(value)} />
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
    <Card asChild>
      <form onSubmit={form.submit} noValidate className="flex flex-wrap items-end gap-3.5">
        {form.failed ? (
          <div className="basis-full">
            <ErrorNotice title="Impossible d'enregistrer">{GENERIC_ERROR}</ErrorNotice>
          </div>
        ) : null}
        <Avatar size={56} shape="tile" tone="agent" aria-hidden="true">
          <AvatarFallback>{initialsOf(form.name || org.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-[1_1_16rem]">
          <FormField
            ref={form.nameInput}
            label="Nom de l'organisation"
            value={form.name}
            onChange={(event) => form.setName(event.target.value)}
            readOnly={form.busy}
            error={form.errors.name}
            autoComplete="organization"
          />
        </div>
        <div className="min-w-0 flex-[1_1_12rem]">
          <FormField
            ref={form.slugInput}
            label="Adresse"
            value={form.slug}
            onChange={(event) => form.setSlug(event.target.value)}
            readOnly={form.busy}
            error={form.errors.slug}
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <Button
          type="submit"
          className="max-md:h-11 max-md:w-full"
          disabled={form.busy}
          aria-busy={form.busy}
        >
          {form.busy ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <p className="basis-full text-caption text-muted-foreground">
          L'adresse : lettres minuscules, chiffres et tirets.
        </p>
        {form.saved ? (
          <InlineAlert variant="success" icon="check_circle" className="basis-full">
            Modifications enregistrées
          </InlineAlert>
        ) : null}
      </form>
    </Card>
  );
}

/** Général : nom et adresse de l'organisation, trois chiffres (projets, membres, nombre de clés d'IA). */
export function GeneralPage() {
  const org = useQuery(orpc.org.get.queryOptions());
  let body = <LoadingStatus label="Chargement de l'organisation…" />;
  if (org.data) {
    body = (
      <>
        <OrganizationForm org={org.data} />
        <Figures org={org.data} />
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
    <div data-testid="general-page" className="flex flex-col gap-5">
      <SectionHeading
        title={SETTINGS_TITLES.general}
        description="Le nom et l'adresse de votre espace. Un freelance a en général une organisation ; une agence peut en avoir plusieurs."
      />
      {body}
    </div>
  );
}
