"use client";

import { projectCreateInputSchema } from "@koklo/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useRef, useState } from "react";
import { errorCode, errorData } from "./api-error.ts";
import { fieldErrors, NAME_TOO_LONG } from "./form-errors.ts";
import { orpc } from "./orpc.ts";
import { isValidSpecRepoName, SPEC_REPO_NAME_ERROR } from "./spec-repo-name.ts";
import { type GithubAccount, useGithubAccounts } from "./use-github-accounts.ts";
import { useUnauthorizedRedirect } from "./use-unauthorized-redirect.ts";

export const CHOOSE_ACCOUNT = "Choisissez le compte GitHub du dépôt.";
export const EMAIL_INVALID = "Saisissez une adresse e-mail valide.";
export const EMAIL_ALREADY_MEMBER = "Cette adresse est déjà membre avec un autre rôle.";
export const NAME_REQUIRED = "Saisissez le nom du projet.";

export type IdeaTemplate = "default" | "empty";

export interface CreateValues {
  name: string;
  clientEmail: string;
  template: IdeaTemplate;
  accountId: string;
  repoName: string;
  euOnly: boolean;
}

export type CreateField = "name" | "clientEmail" | "account" | "repoName";
export type CreateErrors = Partial<Record<CreateField, string>>;

const EMPTY: CreateValues = {
  name: "",
  clientEmail: "",
  template: "default",
  accountId: "",
  repoName: "",
  euOnly: false,
};

const FIELD_OF = {
  name: "name",
  clientEmail: "clientEmail",
  accountId: "account",
  repoName: "repoName",
} as const;

const MESSAGES = {
  name: { too_small: NAME_REQUIRED, default: NAME_TOO_LONG },
  clientEmail: { default: EMAIL_INVALID },
};

/** Compte retenu : le seul actif, ou celui qui a été choisi (jamais de présélection parmi plusieurs). */
export function selectedAccount(accounts: GithubAccount[], accountId: string) {
  return accounts.length === 1 ? accounts[0] : accounts.find((account) => account.id === accountId);
}

/** Erreurs de saisie, avant tout appel : rien n'est créé tant qu'un champ est invalide. */
export function collectErrors(values: CreateValues, accounts: GithubAccount[]): CreateErrors {
  const email = values.clientEmail.trim();
  const parsed = projectCreateInputSchema.safeParse({
    name: values.name.trim(),
    ...(email ? { clientEmail: email } : {}),
  });
  const errors: CreateErrors = parsed.success
    ? {}
    : (fieldErrors(parsed.error.issues, MESSAGES) as CreateErrors);
  if (accounts.length > 1 && !selectedAccount(accounts, values.accountId)) {
    errors.account = CHOOSE_ACCOUNT;
  }
  const repoName = values.repoName.trim();
  if (accounts.length > 0 && repoName && !isValidSpecRepoName(repoName)) {
    errors.repoName = SPEC_REPO_NAME_ERROR;
  }
  return errors;
}

/** Entrée de `project.create` : les champs vides ne sont pas envoyés. */
export function createInput(
  values: CreateValues,
  accounts: GithubAccount[],
  idempotencyKey: string,
  canSetEu: boolean,
) {
  const email = values.clientEmail.trim();
  const repoName = values.repoName.trim();
  const account = selectedAccount(accounts, values.accountId);
  return {
    name: values.name.trim(),
    ...(email ? { clientEmail: email } : {}),
    ideaTemplate: values.template,
    ...(account ? { installationId: account.id } : {}),
    ...(account && repoName ? { repoName } : {}),
    ...(canSetEu && values.euOnly ? { euOnly: true } : {}),
    idempotencyKey,
  };
}

/** Erreur de `project.create` -> message de champ ou erreur globale. */
function failureOf(error: unknown): { field?: CreateErrors; form?: "forbidden" | "generic" } {
  const code = errorCode(error);
  if (code === "FORBIDDEN") return { form: "forbidden" };
  if (code === "VALIDATION") {
    const field = errorData(error)?.field;
    if (field === "clientEmail") return { field: { clientEmail: EMAIL_ALREADY_MEMBER } };
    if (field === "repoName") return { field: { repoName: SPEC_REPO_NAME_ERROR } };
    if (field === "installationId") return { field: { account: CHOOSE_ACCOUNT } };
  }
  return { form: "generic" };
}

export interface CreatedProject {
  id: string;
  name: string;
}

interface Options {
  /** Owner et admin seulement : la case « Données en UE » (B304). */
  canSetEu: boolean;
  onCreated: (project: CreatedProject) => void;
}

/** Valeurs, erreurs de champ et « modifié ? » de la boîte. */
function useCreateValues() {
  const [values, setValues] = useState<CreateValues>(EMPTY);
  const [errors, setErrors] = useState<CreateErrors>({});
  function setField<K extends keyof CreateValues>(field: K, value: CreateValues[K]): void {
    setValues((current) => ({ ...current, [field]: value }));
    const errorField = FIELD_OF[field as keyof typeof FIELD_OF];
    if (errorField) setErrors((current) => ({ ...current, [errorField]: undefined }));
  }
  return {
    values,
    errors,
    setErrors,
    setField,
    dirty: JSON.stringify(values) !== JSON.stringify(EMPTY),
  };
}

/**
 * Boîte « Nouveau projet » : champs, validation, comptes GitHub et un seul `project.create` par ouverture
 * (clé d'idempotence tirée à l'ouverture : un double envoi rend le même projet).
 */
export function useProjectCreate({ canSetEu, onCreated }: Options) {
  const queryClient = useQueryClient();
  const accounts = useGithubAccounts(true);
  const create = useMutation(orpc.project.create.mutationOptions());
  const { values, errors, setErrors, setField, dirty } = useCreateValues();
  const [formError, setFormError] = useState<"forbidden" | "generic">();
  const [lastError, setLastError] = useState<unknown>();
  const key = useRef(crypto.randomUUID());
  const lock = useRef(false);
  useUnauthorizedRedirect(lastError);

  async function send(): Promise<void> {
    lock.current = true;
    setFormError(undefined);
    try {
      const input = createInput(values, accounts.accounts, key.current, canSetEu);
      const created = await create.mutateAsync(input);
      void queryClient.invalidateQueries({ queryKey: orpc.project.cards.key() });
      void queryClient.invalidateQueries({ queryKey: orpc.project.list.key() });
      onCreated(created);
    } catch (error) {
      setLastError(error);
      const failure = failureOf(error);
      if (errorCode(error) !== "UNAUTHORIZED") {
        setErrors(failure.field ?? {});
        if (failure.form) setFormError(failure.form);
      }
    } finally {
      lock.current = false;
    }
  }

  function submit(event?: FormEvent): CreateErrors | undefined {
    event?.preventDefault();
    if (lock.current || accounts.status !== "ready") return undefined;
    const next = collectErrors(values, accounts.accounts);
    setErrors(next);
    if (Object.keys(next).length > 0) return next;
    void send();
    return undefined;
  }

  const account = selectedAccount(accounts.accounts, values.accountId);
  return {
    values,
    setField,
    errors,
    formError,
    accounts,
    account,
    dirty,
    pending: create.isPending,
    submit,
  };
}

export type ProjectCreate = ReturnType<typeof useProjectCreate>;
