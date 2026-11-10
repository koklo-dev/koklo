"use client";

import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useRef, useState } from "react";
import { errorCode } from "./api-error.ts";
import { orpc } from "./orpc.ts";
import { describeSpecRepoError, type SpecRepoErrorView } from "./spec-repo-errors.ts";
import { isValidSpecRepoName, SPEC_REPO_NAME_ERROR } from "./spec-repo-name.ts";
import { type GithubAccount, useGithubAccounts } from "./use-github-accounts.ts";
import { CHOOSE_ACCOUNT, selectedAccount } from "./use-project-create.ts";
import { useStartInstallation } from "./use-start-installation.ts";
import { useUnauthorizedRedirect } from "./use-unauthorized-redirect.ts";

export type RepoOutcome = "created-with-repo" | "existing-repo";

interface Attempt {
  projectId: string;
  onDone: (outcome: RepoOutcome) => void;
  reloadAccounts: () => void;
}

/** Un appel à `repo.createSpec` : `spec_repo_exists` est un succès, toute autre erreur devient une vue d'échec. */
function useRepoAttempt({ projectId, onDone, reloadAccounts }: Attempt) {
  const create = useMutation(orpc.repo.createSpec.mutationOptions());
  const [view, setView] = useState<SpecRepoErrorView>();
  const [lastError, setLastError] = useState<unknown>();
  const lock = useRef(false);
  useUnauthorizedRedirect(lastError);

  function fail(error: unknown, target: GithubAccount, name: string): string | undefined {
    setLastError(error);
    if (errorCode(error) === "UNAUTHORIZED") return undefined;
    const next = describeSpecRepoError(error, { ownerLogin: target.ownerLogin, repoName: name });
    if (next.reloadAccounts) reloadAccounts();
    if (next.alreadyExists) onDone("existing-repo");
    else setView(next);
    return next.fieldError;
  }

  async function attempt(target: GithubAccount, name: string): Promise<string | undefined> {
    lock.current = true;
    try {
      const input = { projectId, installationId: target.id, ...(name ? { name } : {}) };
      await create.mutateAsync(input);
      onDone("created-with-repo");
      return undefined;
    } catch (error) {
      return fail(error, target, name);
    } finally {
      lock.current = false;
    }
  }

  return { attempt, view, pending: create.isPending, busy: () => lock.current };
}

/**
 * Création du dépôt de spec d'un projet qui n'en a pas (page Fonctionnalités) : `repo.createSpec` seul, jamais
 * `project.create`.
 */
export function useSpecRepoCreate(projectId: string, onDone: (outcome: RepoOutcome) => void) {
  const accounts = useGithubAccounts(true);
  const run = useRepoAttempt({ projectId, onDone, reloadAccounts: accounts.reload });
  const [accountId, setAccountId] = useState("");
  const [repoName, setRepoName] = useState("");
  const [errors, setErrors] = useState<{ account?: string; repoName?: string }>({});
  const [authFailure, setAuthFailure] = useState<string>();
  const start = useStartInstallation((failure) => setAuthFailure(failure.text));
  const account = selectedAccount(accounts.accounts, accountId);

  function submit(event?: FormEvent): void {
    event?.preventDefault();
    if (run.busy() || accounts.status !== "ready") return;
    if (run.view && run.view.action !== "retry") return;
    const name = repoName.trim();
    const next = {
      ...(accounts.accounts.length > 1 && !account ? { account: CHOOSE_ACCOUNT } : {}),
      ...(name && !isValidSpecRepoName(name) ? { repoName: SPEC_REPO_NAME_ERROR } : {}),
    };
    setErrors(next);
    if (!account || Object.keys(next).length > 0) return;
    void run.attempt(account, name).then((fieldError) => {
      if (fieldError) setErrors({ repoName: fieldError });
    });
  }

  return {
    accounts,
    account,
    repoName,
    errors,
    view: run.view,
    authFailure,
    pending: run.pending,
    authorizing: start.active !== undefined,
    setRepoName: (value: string) => {
      setRepoName(value);
      setErrors((current) => ({ ...current, repoName: undefined }));
    },
    setAccount: (id: string) => {
      setAccountId(id);
      setErrors((current) => ({ ...current, account: undefined }));
    },
    submit,
    authorize: () => {
      setAuthFailure(undefined);
      if (account) start.run(account.id);
    },
  };
}
