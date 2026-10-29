"use client";

import { organizationCreateInputSchema } from "@koklo/contract";
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger, Icon } from "@koklo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { conflictReason } from "../lib/api-error.ts";
import { fieldErrors, GENERIC_ERROR, NAME_TOO_LONG } from "../lib/form-errors.ts";
import { orpc } from "../lib/orpc.ts";
import { ErrorNotice } from "./error-notice.tsx";
import { FormField } from "./form-field.tsx";

const SLUG_INVALID = "Utilisez 2 à 48 lettres minuscules, chiffres ou tirets.";
const SLUG_TAKEN = "Cet identifiant est déjà utilisé. Choisissez-en un autre.";
const MESSAGES = {
  name: {
    too_small: "Saisissez le nom de l'organisation.",
    too_big: NAME_TOO_LONG,
    default: NAME_TOO_LONG,
  },
  slug: { default: SLUG_INVALID },
};

function parseOrganization(name: string, slug: string) {
  const trimmedSlug = slug.trim();
  const parsed = organizationCreateInputSchema.safeParse({
    name: name.trim(),
    ...(trimmedSlug ? { slug: trimmedSlug } : {}),
  });
  return parsed.success
    ? { data: parsed.data, errors: {} as Record<string, string> }
    : { data: undefined, errors: fieldErrors(parsed.error.issues, MESSAGES) };
}

function useOrganizationForm(autoFocus: boolean) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useMutation(orpc.organization.create.mutationOptions());
  const nameInput = useRef<HTMLInputElement>(null);
  const slugInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugOpen, setSlugOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [slugFocusRequest, requestSlugFocus] = useState(0);

  useEffect(() => {
    if (autoFocus) nameInput.current?.focus();
  }, [autoFocus]);
  // Le champ « Identifiant » n'existe qu'une fois le volet ouvert : on attend ce rendu pour le focaliser.
  useEffect(() => {
    if (slugFocusRequest > 0) slugInput.current?.focus();
  }, [slugFocusRequest]);

  function submit(event: FormEvent): void {
    event.preventDefault();
    const { data, errors: found } = parseOrganization(name, slug);
    setErrors(found);
    if (!data) {
      (found.name ? nameInput : slugInput).current?.focus();
      return;
    }
    create.mutate(data, {
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        router.push("/projects");
      },
      onError: (error) => {
        if (conflictReason(error) !== "slug_taken") return;
        setErrors({ slug: SLUG_TAKEN });
        setSlugOpen(true);
        requestSlugFocus((count) => count + 1);
      },
    });
  }

  return {
    submit,
    nameInput,
    slugInput,
    name,
    setName,
    slug,
    setSlug,
    slugOpen,
    setSlugOpen,
    errors,
    busy: create.isPending,
    failed: create.isError && conflictReason(create.error) !== "slug_taken",
  };
}

/** Création d'une organisation : nom, identifiant repliable (déduit du nom s'il reste vide). */
export function OrganizationForm({ autoFocus }: { autoFocus: boolean }) {
  const form = useOrganizationForm(autoFocus);
  return (
    <form onSubmit={form.submit} noValidate className="flex flex-col gap-4">
      {form.failed ? (
        <ErrorNotice title="Impossible de continuer">{GENERIC_ERROR}</ErrorNotice>
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
      <Collapsible
        open={form.slugOpen}
        onOpenChange={form.setSlugOpen}
        className="flex flex-col gap-3"
      >
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="h-11 w-fit md:h-9">
            Personnaliser l'identifiant
            <Icon
              name="chevron_right"
              size={16}
              className="motion-safe:transition-transform motion-safe:duration-150 [[data-state=open]_&]:rotate-90"
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <FormField
            ref={form.slugInput}
            label="Identifiant"
            hint="Laissé vide, il est déduit du nom."
            value={form.slug}
            onChange={(event) => form.setSlug(event.target.value)}
            readOnly={form.busy}
            error={form.errors.slug}
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
          />
        </CollapsibleContent>
      </Collapsible>
      <Button
        type="submit"
        className="h-11 w-full md:h-9"
        disabled={form.busy}
        aria-busy={form.busy}
      >
        {form.busy ? "Création…" : "Créer l'organisation"}
      </Button>
    </form>
  );
}
