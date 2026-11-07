"use client";

import type { PageSize } from "@koklo/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { orpc } from "./orpc.ts";

/** Page courante et taille du tableau des membres ; changer la taille revient à la première page. */
export function useMembersPage(enabled: boolean) {
  const [page, setPage] = useState(1);
  const [size, setSizeState] = useState<PageSize>(25);
  const query = useQuery({
    ...orpc.member.page.queryOptions({ input: { page, size } }),
    enabled,
    placeholderData: keepPreviousData,
  });
  const setSize = (next: PageSize) => {
    setSizeState(next);
    setPage(1);
  };
  return { page, size, query, setPage, setSize };
}
