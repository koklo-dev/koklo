"use client";

import { Button, Icon, type IconName, Pill, Skeleton, useToast } from "@koklo/ui";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { orpc } from "../lib/orpc.ts";

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
  note: string;
  action?: ReactNode;
}

/** Fichier source d'une table (maquette 11 l.507-531) : chemin et pastille, code en texte brut, note. */
function SourceBlock({ icon, path, tag, label, code, note, action }: SourceBlockProps) {
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
        className="max-h-[560px] overflow-auto rounded-[10px] border bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <pre className="m-0 w-max min-w-full whitespace-pre px-3.5 py-3 font-mono text-code leading-[1.6]">
          {code}
        </pre>
      </section>
      <p className="m-0 text-caption text-muted-foreground">{note}</p>
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
      <p className="m-0 text-body text-destructive">Le fichier de la table n'a pas pu être lu.</p>
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

/** Vue Mermaid : `data/model.mmd` entier (une seule lecture, partagée avec le diagramme), « Généré », « Copier ». */
export function ModelMermaid({ text }: { text: string }) {
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
      action={
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
          <Icon name="content_copy" size={16} />
          Copier
        </Button>
      }
    />
  );
}
