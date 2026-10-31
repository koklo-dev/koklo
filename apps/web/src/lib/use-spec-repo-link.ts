"use client";

import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { conflictReason, errorCode } from "./api-error.ts";
import { orpc } from "./orpc.ts";
import { describeSpecRepoError } from "./spec-repo-errors.ts";
import { isValidSpecRepoName, SPEC_REPO_NAME_ERROR } from "./spec-repo-name.ts";
import type { GithubAccount } from "./use-github-accounts.ts";
import { useUnauthorizedRedirect } from "./use-unauthorized-redirect.ts";

export const LINK_NAME_REQUIRED = "Indiquez le nom du dépôt à relier.";

interface LinkOptions {
  projectId: string | undefined;
  account: GithubAccount | undefined;
  /** Le dépôt est relié. */
  onLinked: () => void;
  /** Le projet avait déjà son dépôt de spec : traité comme un succès. */
  onExisting: () => void;
}

/** Texte d'une erreur de `repo.link` (design/screens/S-projects.md §5.3). */
function describeLinkError(error: unknown, ownerLogin: string): string {
  if (errorCode(error) === "NOT_FOUND") {
    return `Koklo ne trouve pas ce dépôt sur ${ownerLogin}. Vérifiez le nom, et que l'application GitHub a accès à ce dépôt.`;
  }
  if (conflictReason(error) === "repo_already_linked")
    return "Ce dépôt est déjà relié à un projet.";
  return describeSpecRepoError(error, { ownerLogin, repoName: "" }).text;
}

/** Repli « Relier un dépôt existant » : un seul appel en vol, jamais de modification du dépôt. */
export function useSpecRepoLink({ projectId, account, onLinked, onExisting }: LinkOptions) {
  const link = useMutation(orpc.repo.link.mutationOptions());
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [lastError, setLastError] = useState<unknown>();
  useUnauthorizedRedirect(lastError);

  async function submit(rawName: string): Promise<void> {
    const name = rawName.trim();
    if (lock.current || !projectId || !account) return;
    if (!name) return setError(LINK_NAME_REQUIRED);
    if (!isValidSpecRepoName(name)) return setError(SPEC_REPO_NAME_ERROR);
    lock.current = true;
    setPending(true);
    setError(undefined);
    try {
      await link.mutateAsync({
        projectId,
        installationId: account.id,
        role: "spec",
        ownerLogin: account.ownerLogin,
        name,
      });
      onLinked();
    } catch (failure) {
      setLastError(failure);
      if (
        describeSpecRepoError(failure, { ownerLogin: account.ownerLogin, repoName: "" })
          .alreadyExists
      ) {
        onExisting();
      } else {
        setError(describeLinkError(failure, account.ownerLogin));
      }
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  return { submit, pending, error };
}
