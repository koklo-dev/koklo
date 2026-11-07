import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { GENERIC_ERROR } from "../lib/form-errors.ts";
import { ErrorNotice } from "./error-notice.tsx";
import { LoadingStatus } from "./loading-status.tsx";

interface Props<T> {
  query: UseQueryResult<T>;
  loading: string;
  failed: string;
  children: (data: T) => ReactNode;
}

/** Chargement annoncé, erreur avec « Réessayer », sinon le contenu : le gabarit de chaque lecture de l'écran. */
export function AiQueryBoundary<T>({ query, loading, failed, children }: Props<T>) {
  if (query.data !== undefined) return <>{children(query.data)}</>;
  if (query.isError && !query.isFetching) {
    return (
      <ErrorNotice title={failed} onRetry={() => void query.refetch()}>
        {GENERIC_ERROR}
      </ErrorNotice>
    );
  }
  return <LoadingStatus label={loading} rows={1} rowClassName="h-24" />;
}
