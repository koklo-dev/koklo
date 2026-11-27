"use client";

import { Pill, Skeleton } from "@koklo/ui";
import { SourceBlock } from "./data-diagram-source.tsx";
import { GitReadError } from "./git-read-error.tsx";

interface SourceQuery {
  data: { path: string; text: string; generated: boolean } | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  refetch: () => unknown;
}

/**
 * Fichier YAML d'un élément du cahier technique (choix, opération) : le fichier du dépôt (« Source de vérité ») ou le
 * YAML généré depuis l'index (« Généré »), avec son attente et son échec de lecture.
 */
export function TechnicalYaml({
  query,
  label,
  note,
  fallback,
}: {
  query: SourceQuery;
  label: string;
  note?: string;
  fallback: string;
}) {
  if (query.isPending) return <Skeleton aria-busy="true" className="h-40 rounded-[10px]" />;
  if (query.isError || !query.data) {
    return (
      <GitReadError
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
        fallback={fallback}
      />
    );
  }
  const { path, text, generated } = query.data;
  return (
    <SourceBlock
      icon="description"
      path={path}
      maxHeight={600}
      label={label}
      code={text}
      {...(note ? { note } : {})}
      tag={
        <Pill size="md" tone={generated ? "soft" : "success"}>
          {generated ? "Généré" : "Source de vérité"}
        </Pill>
      }
    />
  );
}
