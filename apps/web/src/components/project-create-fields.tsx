import { Icon, RadioCard, RadioCardGroup, SwitchRow } from "@koklo/ui";
import { useState } from "react";
import { suggestedRepoName } from "../lib/spec-repo-name.ts";
import type { CreateErrors, IdeaTemplate, ProjectCreate } from "../lib/use-project-create.ts";
import { FormField } from "./form-field.tsx";

type RefOf<T> = { current: T | null };

/** Nom du projet et client facultatif (maquette 08 l.133-139). */
export function IdentityFields({
  create,
  nameRef,
  emailRef,
}: {
  create: ProjectCreate;
  nameRef: RefOf<HTMLInputElement>;
  emailRef: RefOf<HTMLInputElement>;
}) {
  const { values, errors, setField, pending } = create;
  return (
    <>
      <FormField
        ref={nameRef}
        label="Nom du projet"
        value={values.name}
        onChange={(event) => setField("name", event.target.value)}
        readOnly={pending}
        error={errors.name}
        autoComplete="off"
      />
      <FormField
        ref={emailRef}
        type="email"
        label="Client"
        optional
        placeholder="nom@entreprise.fr"
        hint="Il recevra une invitation pour écrire l'idée avec vous."
        value={values.clientEmail}
        onChange={(event) => setField("clientEmail", event.target.value)}
        readOnly={pending}
        error={errors.clientEmail}
        autoComplete="off"
      />
    </>
  );
}

/** Structure du dossier d'idée : deux cartes à choix, « Cadrage par défaut » d'abord (B308). */
export function TemplateField({ create }: { create: ProjectCreate }) {
  const { values, setField, pending } = create;
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="pb-1.5 text-meta font-semibold">Structure du dossier d'idée</legend>
      <RadioCardGroup
        className="grid-cols-1"
        value={values.template}
        onValueChange={(next) => setField("template", next as IdeaTemplate)}
        disabled={pending}
        aria-label="Structure du dossier d'idée"
      >
        <RadioCard
          value="default"
          title="Cadrage par défaut"
          description="10 pages : vision, problème, utilisateurs, périmètre… Modifiable ensuite."
        />
        <RadioCard
          value="empty"
          title="Dossier vide"
          description="Vous créez vos pages vous-même."
        />
      </RadioCardGroup>
    </fieldset>
  );
}

/** Repli « Nom du dépôt : <slug>-spec · modifier » : le champ n'apparaît qu'à la demande (ou s'il est en erreur). */
export function RepoNameField({
  create,
  repoRef,
}: {
  create: ProjectCreate;
  repoRef: RefOf<HTMLInputElement>;
}) {
  const { values, errors, setField, pending } = create;
  const [open, setOpen] = useState(false);
  const shown = open || Boolean(errors.repoName);
  if (shown) {
    return (
      <FormField
        ref={repoRef}
        label="Nom du dépôt"
        hint="Laissez vide pour utiliser le nom du projet suivi de « -spec »."
        value={values.repoName}
        onChange={(event) => setField("repoName", event.target.value)}
        readOnly={pending}
        error={errors.repoName}
        autoComplete="off"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-expanded={false}
      className="inline-flex min-h-11 items-center gap-1 self-start rounded-md text-caption font-normal text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-[26px]"
    >
      <Icon name="chevron_right" size={16} />
      Nom du dépôt :{" "}
      <span className="font-mono text-foreground">
        {values.repoName.trim() || suggestedRepoName(values.name.trim())}
      </span>{" "}
      · modifier
    </button>
  );
}

/** Données en UE : réservé aux propriétaires et administrateurs, éteint par défaut (B304). */
export function EuField({ create }: { create: ProjectCreate }) {
  return (
    <SwitchRow
      title="Les données de ce projet restent dans l'UE"
      checked={create.values.euOnly}
      onCheckedChange={(checked) => create.setField("euOnly", checked)}
      disabled={create.pending}
    />
  );
}

/** Résumé en tête de boîte quand plusieurs champs sont invalides. */
export function errorSummary(errors: CreateErrors): string[] {
  return Object.values(errors).filter((message): message is string => Boolean(message));
}
