"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type Dispatch, type SetStateAction, useRef } from "react";
import { errorCode } from "./api-error.ts";
import type { CreatedProject, CreationOutcome, Phase } from "./creation-types.ts";
import { orpc } from "./orpc.ts";
import { describeSpecRepoError } from "./spec-repo-errors.ts";
import type { CreationFields } from "./use-creation-fields.ts";
import type { GithubAccount } from "./use-github-accounts.ts";

interface StepContext {
  fields: CreationFields;
  setPhase: Dispatch<SetStateAction<Phase>>;
  setProject: (project: CreatedProject) => void;
  setLastError: (error: unknown) => void;
  onFinish: (outcome: CreationOutcome) => void;
  onReloadAccounts: () => void;
}

/** Étape 1 : `project.create`. Rend le projet créé, ou null (l'échec est déjà affiché, rien n'existe). */
export function useCreateProjectStep({ fields, setPhase, setProject, setLastError }: StepContext) {
  const queryClient = useQueryClient();
  const create = useMutation(orpc.project.create.mutationOptions());
  return async (): Promise<CreatedProject | null> => {
    setPhase({ name: "creating-project" });
    try {
      const created = await create.mutateAsync({ name: fields.values.name.trim() });
      setProject(created);
      // Le projet existe dès maintenant : la liste derrière le panneau le montre sans attendre l'étape 2.
      void queryClient.invalidateQueries({ queryKey: orpc.project.list.key() });
      return created;
    } catch (error) {
      setLastError(error);
      // UNAUTHORIZED : la redirection est en cours, aucun texte d'erreur pendant ce temps (48c, non bloquant 4).
      if (errorCode(error) === "UNAUTHORIZED") setPhase({ name: "form" });
      else
        setPhase({
          name: "form",
          stepOneFailure: errorCode(error) === "FORBIDDEN" ? "forbidden" : "generic",
        });
      return null;
    }
  };
}

/** Étape 2 : `repo.createSpec`, relançable seule. `spec_repo_exists` est un succès, jamais une erreur. */
export function useCreateRepoStep(context: StepContext) {
  const { fields, setPhase, setLastError, onFinish, onReloadAccounts } = context;
  const create = useMutation(orpc.repo.createSpec.mutationOptions());
  const attempts = useRef(0);

  function fail(error: unknown, account: GithubAccount): void {
    setLastError(error);
    if (errorCode(error) === "UNAUTHORIZED") {
      setPhase({ name: "ready" });
      return;
    }
    const context = { ownerLogin: account.ownerLogin, repoName: fields.repoName };
    const view = describeSpecRepoError(error, context);
    if (view.alreadyExists) {
      setPhase({ name: "existing" });
      return;
    }
    if (view.reloadAccounts) onReloadAccounts();
    fields.setErrors(view.fieldError ? { repo: view.fieldError } : {});
    setPhase({ name: "failed", view });
    if (view.focus) fields.refs.repo.current?.focus();
  }

  return async (project: CreatedProject, account: GithubAccount): Promise<void> => {
    setPhase({ name: "creating-repo", retry: attempts.current > 0 });
    attempts.current += 1;
    const name = fields.repoName;
    try {
      await create.mutateAsync({
        projectId: project.id,
        installationId: account.id,
        ...(name ? { name } : {}),
      });
      onFinish({ kind: "created-with-repo", name: project.name });
    } catch (error) {
      fail(error, account);
    }
  };
}
