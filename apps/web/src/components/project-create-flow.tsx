import { Alert, AlertDescription, Icon } from "@koklo/ui";
import { useEffect, useId, useRef } from "react";
import type { PendingResume } from "../lib/creation-types.ts";
import { RETRY_LATER } from "../lib/form-errors.ts";
import type { CreationPanel } from "../lib/use-creation-panel.ts";
import { ErrorNotice } from "./error-notice.tsx";
import { FormField } from "./form-field.tsx";
import { GithubAccountField } from "./github-account-field.tsx";
import { ProjectCreateActions } from "./project-create-actions.tsx";
import { ProjectCreateSteps } from "./project-create-steps.tsx";
import { SpecRepoFailure } from "./spec-repo-failure.tsx";
import { SpecRepoLinkForm } from "./spec-repo-link-form.tsx";

const EXPLANATION =
  "Koklo crée pour ce projet un dépôt privé sur GitHub, qui contient la spécification (écrans, fonctionnalités, règles). Vous pourrez la consulter et la modifier depuis Koklo.";
const REPO_HINT =
  "Laissez vide pour utiliser le nom du projet suivi de « -spec ». Lettres, chiffres, points, tirets et tirets bas, 100 caractères maximum.";

function StatusLine({ children }: { children: string }) {
  return (
    <p role="status" className="text-[13px] text-muted-foreground">
      {children}
    </p>
  );
}

function NoRepoNotice({ name }: { name: string }) {
  const title = useRef<HTMLParagraphElement>(null);
  useEffect(() => title.current?.focus(), []);
  return (
    <Alert>
      <Icon name="link" size={20} />
      <AlertDescription className="flex flex-col items-start gap-2">
        <p ref={title} tabIndex={-1} className="outline-none">
          Projet « {name} » créé, sans dépôt de spec. Reliez GitHub pour que Koklo puisse en créer
          un.
        </p>
        <a href="/github" className="font-medium underline underline-offset-4">
          Relier GitHub
        </a>
      </AlertDescription>
    </Alert>
  );
}

/** Message de progression ou d'échec en tête du panneau : une seule région à la fois. */
function Banner({ panel }: { panel: CreationPanel }) {
  const { phase, project } = panel.creation;
  switch (phase.name) {
    case "form":
      if (!phase.stepOneFailure) return null;
      return phase.stepOneFailure === "forbidden" ? (
        <ErrorNotice icon="lock">
          Vous n'avez pas le droit de créer un projet. Demandez à un propriétaire ou à un
          administrateur.
        </ErrorNotice>
      ) : (
        <ErrorNotice title="Le projet n'a pas pu être créé">{RETRY_LATER}</ErrorNotice>
      );
    case "creating-project":
      return <StatusLine>Création du projet…</StatusLine>;
    case "creating-repo":
      return <StatusLine>Projet créé. Création du dépôt de spec…</StatusLine>;
    case "failed":
      return <SpecRepoFailure view={phase.view} authFailure={panel.authFailure} />;
    case "existing":
      return <StatusLine>Ce projet a déjà son dépôt de spec.</StatusLine>;
    case "no-account":
      return <NoRepoNotice name={project?.name ?? ""} />;
    case "ready":
      return null;
  }
}

function ProjectField({ panel }: { panel: CreationPanel }) {
  const { project, values, errors, refs, busy, setField } = panel.creation;
  if (project) {
    return (
      <p className="text-sm">
        Projet « <span className="font-medium">{project.name}</span> »
      </p>
    );
  }
  return (
    <FormField
      ref={refs.name}
      label="Nom du projet"
      value={values.name}
      onChange={(event) => setField("name", event.target.value)}
      readOnly={busy}
      error={errors.name}
      autoComplete="off"
    />
  );
}

function RepoSection({ panel, loadingId }: { panel: CreationPanel; loadingId: string }) {
  const { creation, accounts } = panel;
  const { phase, values, errors, refs, selected, busy, setField } = creation;
  return (
    <section className="flex flex-col gap-3" aria-label="Dépôt de spec">
      <p className="text-[13px] text-muted-foreground">{EXPLANATION}</p>
      <GithubAccountField
        accounts={accounts.accounts}
        status={accounts.status}
        selected={selected}
        onSelect={(id) => setField("accountId", id)}
        onReload={accounts.reload}
        error={errors.account}
        disabled={busy}
        loadingId={loadingId}
        selectRef={refs.account}
      />
      {accounts.status === "ready" && accounts.accounts.length > 0 ? (
        <FormField
          ref={refs.repo}
          label="Nom du dépôt (facultatif)"
          hint={REPO_HINT}
          value={values.repoName}
          onChange={(event) => setField("repoName", event.target.value)}
          readOnly={busy}
          error={errors.repo}
          announceError={phase.name !== "failed"}
          autoComplete="off"
        />
      ) : null}
    </section>
  );
}

/** Corps du panneau de création : étapes, message, champs, repli « relier » et boutons. */
export function ProjectCreateFlow({
  panel,
  resume,
}: {
  panel: CreationPanel;
  resume: PendingResume | null;
}) {
  const loadingId = useId();
  const { creation } = panel;
  const { phase, selected } = creation;
  const offerLink =
    phase.name === "failed"
      ? Boolean(phase.view.offerLink)
      : phase.name === "ready" && Boolean(resume?.offerLink);
  const showRepo = phase.name !== "existing" && phase.name !== "no-account";
  return (
    <form onSubmit={panel.submit} noValidate className="flex flex-1 flex-col gap-4 overflow-y-auto">
      <ProjectCreateSteps phase={phase} />
      <Banner panel={panel} />
      {offerLink && selected ? (
        <SpecRepoLinkForm
          ownerLogin={selected.ownerLogin}
          initialName={creation.repoName}
          pending={panel.link.pending}
          error={panel.link.error}
          defaultOpen={resume?.openLink ?? false}
          onSubmit={(name) => void panel.link.submit(name)}
        />
      ) : null}
      <ProjectField panel={panel} />
      {showRepo ? <RepoSection panel={panel} loadingId={loadingId} /> : null}
      <ProjectCreateActions panel={panel} loadingId={loadingId} />
    </form>
  );
}
