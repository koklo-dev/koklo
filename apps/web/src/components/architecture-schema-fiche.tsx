"use client";

import type { SpecItem } from "@koklo/contract";
import {
  Button,
  EntityChip,
  IdTag,
  InlineAlert,
  Pill,
  SegmentedControl,
  Skeleton,
} from "@koklo/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { componentTypeLabel, staleNoteOf } from "../lib/architecture-labels.ts";
import { orpc } from "../lib/orpc.ts";
import { useArchitectureSource } from "../lib/use-architecture-flows.ts";
import { CopyAction, SourceBlock } from "./data-diagram-source.tsx";
import { SECTION } from "./data-fiche-parts.tsx";
import { GitReadError } from "./git-read-error.tsx";

type Detail = Extract<SpecItem, { type: "component" }>["values"];
type View = "fiche" | "yaml" | "mermaid";

const VIEWS = [
  { value: "fiche", label: "Fiche" },
  { value: "yaml", label: "YAML" },
  { value: "mermaid", label: "Mermaid" },
] as const;

const YAML_NOTE =
  "Un fichier par composant : c'est ce que l'agent lit et modifie. Le schéma et le Mermaid en sont dérivés.";
const MERMAID_NOTE =
  "Régénéré à chaque enregistrement depuis les fichiers des composants. GitHub l'affiche dans le dépôt de spec.";

interface Group {
  label: string;
  chips: ReadonlyArray<{
    id: string;
    kind: Parameters<typeof EntityChip>[0]["kind"];
    title?: string;
  }>;
}

/** Groupes de la fiche (maquette 13 l.226-229) : ce que le composant possède, sert, appelle, et les décisions qui le concernent. */
function groupsOf(detail: Detail): Group[] {
  return [
    {
      label: "Possède les données",
      chips: detail.owns.map((id) => ({ id, kind: "table" as const })),
    },
    {
      label: "Sert les fonctionnalités",
      chips: detail.serves.map((id) => ({ id, kind: "feature" as const })),
    },
    {
      label: "Dépend de",
      chips: detail.dependsOn.map((link) => ({
        id: link.to,
        kind: "component" as const,
        title: `${link.via}${link.async ? " · asynchrone" : ""}`,
      })),
    },
    {
      label: "Décisions",
      chips: detail.decisions.map((id) => ({ id, kind: "decision" as const })),
    },
  ].filter((group) => group.chips.length > 0);
}

function Groups({ groups }: { groups: readonly Group[] }) {
  return groups.map((group) => (
    <section key={group.label} aria-label={group.label} className="flex flex-col gap-1.5">
      <span className={SECTION}>{group.label}</span>
      <div className="flex flex-wrap gap-1.5">
        {group.chips.map((chip) => (
          <EntityChip
            key={`${chip.kind}-${chip.id}`}
            kind={chip.kind}
            id={chip.id}
            {...(chip.title ? { title: chip.title } : {})}
          />
        ))}
      </div>
    </section>
  ));
}

/** Vue Fiche d'un composant enregistré : responsabilité et liens, lus dans le dépôt (`spec.item.get`). */
function ComponentFiche({
  projectId,
  id,
  staleIds,
}: {
  projectId: string;
  id: string;
  staleIds: readonly string[] | undefined;
}) {
  const detail = useQuery(
    orpc.spec.item.get.queryOptions({ input: { projectId, type: "component", id } }),
  );
  if (detail.isPending) return <Skeleton aria-busy="true" className="h-40 rounded-[10px]" />;
  if (detail.data?.type !== "component") {
    return <p className="m-0 text-body text-destructive">Le composant n'a pas pu être lu.</p>;
  }
  const values = detail.data.values;
  return (
    <>
      <p className="m-0 text-body leading-[1.55]">{values.responsibility}</p>
      <Groups groups={groupsOf(values)} />
      {staleIds ? (
        <InlineAlert variant="warning" icon="sync_problem" role="note">
          {staleNoteOf(staleIds, [...values.owns, ...values.serves])}
        </InlineAlert>
      ) : null}
    </>
  );
}

/** Vue YAML : le fichier du dépôt (« Source de vérité ») ou le YAML généré depuis l'index (« Généré »). */
function ComponentYaml({ projectId, id }: { projectId: string; id: string }) {
  const source = useArchitectureSource(projectId, { kind: "component", id }, true);
  if (source.isPending) return <Skeleton aria-busy="true" className="h-40 rounded-[10px]" />;
  if (source.isError || !source.data) {
    return (
      <GitReadError
        error={source.error}
        onRetry={() => void source.refetch()}
        retrying={source.isFetching}
        fallback="Le fichier du composant n'a pas pu être lu."
      />
    );
  }
  const { path, text, generated } = source.data;
  return (
    <SourceBlock
      icon="description"
      path={path}
      maxHeight={600}
      label="YAML du composant"
      code={text}
      note={YAML_NOTE}
      tag={
        <Pill size="md" tone={generated ? "soft" : "success"}>
          {generated ? "Généré" : "Source de vérité"}
        </Pill>
      }
    />
  );
}

/** Vue Mermaid : le schéma entier (`architecture/schema.mmd`), « Généré », « Copier ». */
function SchemaMermaid({ projectId }: { projectId: string }) {
  const source = useArchitectureSource(projectId, { kind: "schema" }, true);
  if (source.isPending) return <Skeleton aria-busy="true" className="h-40 rounded-[10px]" />;
  if (source.isError || !source.data) {
    return (
      <GitReadError
        error={source.error}
        onRetry={() => void source.refetch()}
        retrying={source.isFetching}
        fallback="Le Mermaid du schéma n'a pas pu être lu."
      />
    );
  }
  return (
    <SourceBlock
      icon="schema"
      path={source.data.path}
      maxHeight={600}
      label="Mermaid du schéma"
      code={source.data.text}
      note={MERMAID_NOTE}
      tag={
        <Pill size="md" tone="soft">
          Généré
        </Pill>
      }
      action={<CopyAction text={source.data.text} />}
    />
  );
}

export interface SchemaFicheProps {
  projectId: string;
  id: string;
  name: string;
  /** Type du composant (`app`…) ; absent pour un acteur. */
  type: string | undefined;
  /** « Modifier » : équipe qui écrit, composant seulement. */
  onEdit: (() => void) | undefined;
  /** Amont modifié qui concerne ce composant (architecture à revoir) : l'encadré ambre de la fiche (B587). */
  staleIds?: readonly string[];
}

/**
 * Fiche ancrée d'un composant du schéma (maquette 13 l.218-238) : identifiant, type, « Modifier », titre, sélecteur
 * Fiche · YAML · Mermaid puis la vue choisie. Un acteur (rôle du fonctionnel) n'a que sa fiche : pas de fichier de
 * composant. Équipe et designer lisent les trois vues (B550) ; le client n'a pas cet onglet.
 */
export function SchemaFiche({ projectId, id, name, type, onEdit, staleIds }: SchemaFicheProps) {
  const [view, setView] = useState<View>("fiche");
  const actor = type === undefined;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <IdTag>{id}</IdTag>
        <Pill size="md" tone="soft">
          {actor ? "Acteur" : componentTypeLabel(type)}
        </Pill>
        <span className="flex-1" />
        {!actor && onEdit ? (
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            Modifier
          </Button>
        ) : null}
      </div>
      <h2 className="m-0 text-settings-title">{name}</h2>
      {actor ? (
        <p className="m-0 text-body leading-[1.55]">
          Rôle du cahier fonctionnel : il participe aux flux de cette architecture.
        </p>
      ) : (
        <>
          <SegmentedControl<View>
            aria-label="Affichage du composant"
            options={VIEWS}
            value={view}
            onValueChange={setView}
            className="self-start"
          />
          {view === "yaml" ? <ComponentYaml projectId={projectId} id={id} /> : null}
          {view === "mermaid" ? <SchemaMermaid projectId={projectId} /> : null}
          {view === "fiche" ? (
            <ComponentFiche projectId={projectId} id={id} staleIds={staleIds} />
          ) : null}
        </>
      )}
    </div>
  );
}
