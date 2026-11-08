"use client";

import { AvatarGroup, Button, Icon, InlineAlert, ProjectHeader } from "@koklo/ui";
import { SAVE_LABEL, type SaveState } from "../lib/idea-labels.ts";
import { projectPath } from "../lib/shell-routes.ts";
import { ageOf } from "../lib/spec-age.ts";
import type { IdeaModel } from "../lib/use-idea-page.ts";
import type { PublishState } from "../lib/use-idea-publish.ts";
import { ShellLink } from "./shell-link.tsx";

interface Person {
  name: string;
  initials: string;
  isClient: boolean;
}

function SaveIndicator({ state, model }: { state: SaveState; model: IdeaModel }) {
  const last = model.publication.last;
  const icon = state === "offline" || state === "error" ? "cloud_off" : "cloud_done";
  return (
    <p aria-live="polite" className="flex items-center gap-1.5 text-meta text-muted-foreground">
      <Icon name={icon} size={16} />
      <span>
        {SAVE_LABEL[state]}
        {last ? ` · dernière version publiée dans le dépôt ${ageOf(last.publishedAt)}` : ""}
      </span>
    </p>
  );
}

function PublishButton({ publish, onPublish }: { publish: PublishState; onPublish: () => void }) {
  const busy = publish.kind === "publishing";
  return (
    <Button
      type="button"
      variant="outline"
      icon="publish"
      loading={busy}
      disabled={busy}
      className="max-md:h-11"
      onClick={onPublish}
    >
      Enregistrer une version
    </Button>
  );
}

/** En-tête du dossier : emplacement et indicateur d'enregistrement, titre, présents, publication (équipe seulement). */
export function IdeaHeader({
  model,
  projectName,
  saveState,
  people,
  publish,
  onPublish,
}: {
  model: IdeaModel;
  projectName: string;
  saveState: SaveState;
  people: Person[];
  publish: PublishState;
  onPublish: () => void;
}) {
  const showPublish = model.canPublish && model.publication.available;
  return (
    <ProjectHeader
      project={{ name: projectName, href: projectPath(model.projectId) }}
      page="Idée"
      title="Dossier d'idée"
      LinkComponent={ShellLink}
      meta={<SaveIndicator state={saveState} model={model} />}
      status={
        people.length > 0 ? (
          <AvatarGroup label="Présents dans le dossier" people={people} />
        ) : undefined
      }
      primaryAction={
        showPublish ? <PublishButton publish={publish} onPublish={onPublish} /> : undefined
      }
    />
  );
}

/** Raison, retour de publication et échec : une ligne sous l'en-tête, jamais une fenêtre. */
export function IdeaPublishNotice({
  model,
  publish,
  onRetry,
}: {
  model: IdeaModel;
  publish: PublishState;
  onRetry: () => void;
}) {
  if (model.canPublish && !model.publication.available) {
    return (
      <InlineAlert variant="warning" icon="warning">
        Le dépôt de la spec n'est pas encore relié : le brouillon est gardé, la version pourra être
        publiée une fois le dépôt relié.
      </InlineAlert>
    );
  }
  if (publish.kind === "published") {
    return (
      <InlineAlert variant="success" icon="check_circle">
        Version publiée · {publish.sha}
      </InlineAlert>
    );
  }
  if (publish.kind === "slow") {
    return (
      <InlineAlert variant="neutral" icon="info">
        La publication continue en arrière-plan. Vous pouvez poursuivre.
      </InlineAlert>
    );
  }
  if (publish.kind === "failed") {
    return (
      <InlineAlert variant="error" icon="error" action={{ label: "Réessayer", onClick: onRetry }}>
        La version n'a pas pu être publiée. Vos pages sont gardées.
      </InlineAlert>
    );
  }
  return null;
}
