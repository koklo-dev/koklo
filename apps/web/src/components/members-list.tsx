"use client";

import type { Role } from "@koklo/contract";
import { Pagination } from "@koklo/ui";
import { useQuery } from "@tanstack/react-query";
import { GENERIC_ERROR } from "../lib/form-errors.ts";
import { orpc } from "../lib/orpc.ts";
import { useMemberChanges } from "../lib/use-member-changes.ts";
import { useMembersPage } from "../lib/use-members-page.ts";
import { useUnauthorizedRedirect } from "../lib/use-unauthorized-redirect.ts";
import { ErrorNotice } from "./error-notice.tsx";
import { LoadingStatus } from "./loading-status.tsx";
import { MemberRemoval } from "./member-removal.tsx";
import { MembersTable } from "./members-table.tsx";

interface MembersListProps {
  enabled: boolean;
  role: Role | undefined;
  manage: boolean;
  onNotice: (text: string | undefined) => void;
}

/** Tableau paginé des membres (`member.page`), menus d'actions et confirmation du retrait. */
export function MembersList({ enabled, role, manage, onNotice }: MembersListProps) {
  const { page, size, query, setPage, setSize } = useMembersPage(enabled);
  const me = useQuery({ ...orpc.me.get.queryOptions(), enabled: manage });
  const changes = useMemberChanges(onNotice);
  const redirecting = useUnauthorizedRedirect(query.error);

  if (query.isError && !query.data && !query.isFetching && !redirecting) {
    return (
      <ErrorNotice title="Impossible de charger les membres" onRetry={() => void query.refetch()}>
        {GENERIC_ERROR}
      </ErrorNotice>
    );
  }
  if (!query.data) return <LoadingStatus label="Chargement des membres…" />;
  const { items, total, totalIsEstimate } = query.data;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-meta text-muted-foreground">
        {total === 1 ? "1 membre" : `${total} membres`}
      </p>
      {changes.failure ? (
        <ErrorNotice title={changes.failure.title}>{changes.failure.text}</ErrorNotice>
      ) : null}
      {changes.removing ? (
        <MemberRemoval
          name={changes.removing.name}
          busy={changes.removePending}
          onConfirm={changes.confirmRemoval}
          onKeep={changes.keep}
        />
      ) : null}
      <MembersTable
        rows={items}
        actorRole={role}
        manage={manage}
        selfId={me.data?.id}
        onRole={changes.changeRole}
        onRemove={changes.askRemoval}
      />
      <Pagination
        page={page}
        size={size}
        total={total}
        totalIsEstimate={totalIsEstimate}
        onPageChange={setPage}
        onSizeChange={setSize}
      />
    </div>
  );
}
