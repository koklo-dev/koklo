"use client";

import type { InstallationOutput } from "@koklo/contract";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { orpc } from "./orpc.ts";
import { useUnauthorizedRedirect } from "./use-unauthorized-redirect.ts";

export type GithubAccount = InstallationOutput;
export type AccountsStatus = "loading" | "error" | "ready";

/** Comptes GitHub actifs (les installations suspendues ou désinstallées ne sont jamais proposées). */
export function useGithubAccounts(enabled: boolean) {
  const query = useQuery(orpc.installation.list.queryOptions({ enabled }));
  useUnauthorizedRedirect(query.error);
  const accounts = useMemo(
    () => query.data?.filter((installation) => installation.status === "active"),
    [query.data],
  );
  let status: AccountsStatus = "loading";
  if (accounts) status = "ready";
  else if (query.isError && !query.isFetching) status = "error";
  return { accounts: accounts ?? [], status, reload: () => void query.refetch() };
}
