"use client";

import { projectCreateInputSchema } from "@koklo/contract";
import { type RefObject, useRef, useState } from "react";
import type { FieldErrorMap, PendingResume } from "./creation-types.ts";
import { fieldErrors, NAME_TOO_LONG } from "./form-errors.ts";
import { isValidSpecRepoName, SPEC_REPO_NAME_ERROR } from "./spec-repo-name.ts";
import type { GithubAccount } from "./use-github-accounts.ts";

export const CHOOSE_ACCOUNT = "Choisissez le compte GitHub du dépôt.";
const NAME_MESSAGES = {
  name: {
    too_small: "Saisissez le nom du projet.",
    too_big: NAME_TOO_LONG,
    default: NAME_TOO_LONG,
  },
};

interface Fields {
  name: string;
  repoName: string;
  accountId: string;
}

interface Check {
  values: Fields;
  hasProject: boolean;
  accounts: GithubAccount[];
  selected: GithubAccount | undefined;
}

/** Erreurs de saisie, avant tout appel : rien n'est créé tant qu'un champ est invalide. */
function collectErrors({ values, hasProject, accounts, selected }: Check): FieldErrorMap {
  const errors: FieldErrorMap = {};
  if (!hasProject) {
    const parsed = projectCreateInputSchema.safeParse({ name: values.name.trim() });
    if (!parsed.success) errors.name = fieldErrors(parsed.error.issues, NAME_MESSAGES).name;
  }
  if (accounts.length > 1 && !selected) errors.account = CHOOSE_ACCOUNT;
  const repoName = values.repoName.trim();
  if (accounts.length > 0 && repoName && !isValidSpecRepoName(repoName)) {
    errors.repo = SPEC_REPO_NAME_ERROR;
  }
  return errors;
}

const ERROR_KEY = { name: "name", repoName: "repo", accountId: "account" } as const;

/** Champs du panneau, leurs erreurs et leurs références (focus sur le premier champ en erreur). */
export function useCreationFields(accounts: GithubAccount[], resume: PendingResume | null) {
  const [values, setValues] = useState<Fields>({
    name: "",
    repoName: resume?.marker.repoName ?? "",
    accountId: resume?.marker.installationId ?? "",
  });
  const [errors, setErrors] = useState<FieldErrorMap>({});
  const refs = {
    name: useRef<HTMLInputElement>(null),
    account: useRef<HTMLButtonElement>(null),
    repo: useRef<HTMLInputElement>(null),
  };
  const only = accounts.length === 1 ? accounts[0] : undefined;
  const selected = only ?? accounts.find((account) => account.id === values.accountId);

  function validate(hasProject: boolean): boolean {
    const next = collectErrors({ values, hasProject, accounts, selected });
    setErrors(next);
    const order: [string | undefined, RefObject<HTMLElement | null>][] = [
      [next.name, refs.name],
      [next.account, refs.account],
      [next.repo, refs.repo],
    ];
    const first = order.find(([message]) => message);
    first?.[1].current?.focus();
    return !first;
  }

  function setField(field: keyof Fields, value: string): void {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [ERROR_KEY[field]]: undefined }));
  }

  return {
    values,
    errors,
    setErrors,
    refs,
    selected,
    repoName: values.repoName.trim(),
    setField,
    validate,
  };
}

export type CreationFields = ReturnType<typeof useCreationFields>;
