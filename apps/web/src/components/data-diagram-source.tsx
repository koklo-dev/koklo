"use client";

import { Button, Icon, type IconName, Pill, Skeleton, useToast } from "@koklo/ui";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { orpc } from "../lib/orpc.ts";
import { GitReadError } from "./git-read-error.tsx";

const YAML_NOTE =
  "Un fichier par table : c'est ce que l'agent lit et modifie. Le diagramme, le Mermaid et le SQL en sont dérivés.";
const MERMAID_NOTE =
  "Régénéré à chaque enregistrement depuis les fichiers YAML. GitHub l'affiche directement dans le dépôt de spec. Le SQL de migration sera généré au lot Technique, une fois la base choisie.";

interface SourceBlockProps {
  icon: IconName;
  path: string;
  tag: ReactNode;
  label: string;
  code: string;
  /** Ligne sous le code ; absente de la maquette 14 (choix technique). */
  note?: string;
  action?: ReactNode;
  /** Hauteur maximale du bloc : 560 (Données), 600 (fiche composant), 640 (flux) ; maquettes 11 et 13. */
  maxHeight?: number;
}

/** Fichier source d'une table (maquette 11 l.507-531) : chemin et pastille, code en texte brut, note. */
export function SourceBlock({
  icon,
  path,
  tag,
  label,
  code,
  note,
  action,
  maxHeight = 560,
}: SourceBlockProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-caption text-muted-foreground">
        <Icon name={icon} size={16} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-mono" title={path}>
          {path}
        </span>
        {tag}
        {action}
      </div>
      {/* Texte brut (jamais du HTML) ; région défilante focusable et nommée. */}
      <section
        aria-label={label}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: région défilante, atteignable au clavier
        tabIndex={0}
        style={{ maxHeight }}
        className="overflow-auto rounded-[10px] border bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <pre className="m-0 w-max min-w-full whitespace-pre px-3.5 py-3 font-mono text-code leading-[1.6]">
          {code}
        </pre>
      </section>
      {note ? <p className="m-0 text-caption text-muted-foreground">{note}</p> : null}
    </div>
  );
}

/** Vue YAML : le fichier du dépôt (« Source de vérité »), ou le YAML généré depuis l'index (« Généré »). */
export function TableYaml({ projectId, tableId }: { projectId: string; tableId: string }) {
  const source = useQuery(
    orpc.spec.data.tables.source.queryOptions({ input: { projectId, tableId } }),
  );
  if (source.isPending) return <Skeleton aria-busy="true" className="h-40 rounded-[10px]" />;
  if (source.isError || !source.data) {
    return (
      <GitReadError
        error={source.error}
        onRetry={() => void source.refetch()}
        retrying={source.isFetching}
        fallback="Le fichier de la table n'a pas pu être lu."
      />
    );
  }
  const { path, text, generated } = source.data;
  return (
    <SourceBlock
      icon="description"
      path={path}
      label="YAML de la table"
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

/** « Copier » : le texte va au presse-papiers, un avis dit ce qui s'est passé. */
export function CopyAction({ text }: { text: string }) {
  const { toast } = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ tone: "success", title: "Copié" });
    } catch {
      toast({ tone: "error", title: "Copie impossible" });
    }
  };
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
      <Icon name="content_copy" size={16} />
      Copier
    </Button>
  );
}

/** Vue Mermaid : `data/model.mmd` entier (une seule lecture, partagée avec le diagramme), « Généré », « Copier ». */
export function ModelMermaid({ text }: { text: string }) {
  return (
    <SourceBlock
      icon="schema"
      path="data/model.mmd"
      label="Mermaid du modèle"
      code={text}
      note={MERMAID_NOTE}
      tag={
        <Pill size="md" tone="soft">
          Généré
        </Pill>
      }
      action={<CopyAction text={text} />}
    />
  );
}
