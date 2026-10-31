"use client";

import { type FormEvent, useRef, useState } from "react";
import type { CreationResume } from "./creation-resume.ts";
import type { CreatedProject, CreationOutcome, PendingResume, Phase } from "./creation-types.ts";
import { useCreationFields } from "./use-creation-fields.ts";
import { useCreateProjectStep, useCreateRepoStep } from "./use-creation-steps.ts";
import type { AccountsStatus, GithubAccount } from "./use-github-accounts.ts";
import { useUnauthorizedRedirect } from "./use-unauthorized-redirect.ts";

interface Options {
  accounts: GithubAccount[];
  accountsStatus: AccountsStatus;
  resume: PendingResume | null;
  onFinish: (outcome: CreationOutcome) => void;
  onReloadAccounts: () => void;
}

/** Marqueur de reprise : projet créé, compte choisi, nom de dépôt saisi. Aucun secret. */
function buildMarker(
  project: CreatedProject | null,
  account: GithubAccount | undefined,
  repoName: string,
): CreationResume | null {
  if (!project || !account) return null;
  return {
    projectId: project.id,
    projectName: project.name,
    installationId: account.id,
    ...(repoName ? { repoName } : {}),
    savedAt: Date.now(),
  };
}

/** Issue de la fermeture du panneau, d'après ce qui existe à cet instant. */
function outcomeOnClose(
  project: CreatedProject | null,
  phase: Phase,
  marker: CreationResume | null,
  resume: PendingResume | null,
): CreationOutcome {
  if (!project) return { kind: "cancelled" };
  if (phase.name === "existing") return { kind: "existing-repo", name: project.name };
  if (!marker || phase.name === "no-account") return { kind: "created", name: project.name };
  const offerLink = phase.name === "failed" ? phase.view.offerLink : resume?.offerLink;
  return { kind: "unresolved", marker, offerLink: Boolean(offerLink) };
}

/** Machine d'états de la création : `project.create` une seule fois, puis `repo.createSpec` (relançable seul). */
export function useProjectCreation(options: Options) {
  const { accounts, accountsStatus, resume, onFinish } = options;
  const fields = useCreationFields(accounts, resume);
  const [project, setProject] = useState<CreatedProject | null>(
    resume ? { id: resume.marker.projectId, name: resume.marker.projectName } : null,
  );
  const [phase, setPhase] = useState<Phase>(resume ? { name: "ready" } : { name: "form" });
  const [lastError, setLastError] = useState<unknown>();
  const lock = useRef(false);
  useUnauthorizedRedirect(lastError);
  const context = {
    fields,
    setPhase,
    setProject,
    setLastError,
    onFinish,
    onReloadAccounts: options.onReloadAccounts,
  };
  const makeProject = useCreateProjectStep(context);
  const makeRepo = useCreateRepoStep(context);

  async function run(): Promise<void> {
    lock.current = true;
    try {
      const current = project ?? (await makeProject());
      if (!current) return;
      if (fields.selected) await makeRepo(current, fields.selected);
      else setPhase({ name: "no-account" });
    } finally {
      lock.current = false;
    }
  }

  function submit(event?: FormEvent): void {
    event?.preventDefault();
    if (lock.current || accountsStatus !== "ready") return;
    if (phase.name === "failed" && phase.view.action !== "retry") return;
    if (phase.name === "existing" || phase.name === "no-account") return;
    if (fields.validate(project !== null)) void run();
  }

  const marker = () => buildMarker(project, fields.selected, fields.repoName);
  return {
    ...fields,
    project,
    phase,
    busy: phase.name === "creating-project" || phase.name === "creating-repo",
    submit,
    marker,
    closeOutcome: () => outcomeOnClose(project, phase, marker(), resume),
    /** Le dépôt existe (lié ou déjà présent) : fin de l'étape 2. */
    markExisting: () => setPhase({ name: "existing" }),
    finish: onFinish,
  };
}

export type ProjectCreation = ReturnType<typeof useProjectCreation>;
