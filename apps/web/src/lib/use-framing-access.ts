"use client";

import type { Role } from "@koklo/contract";
import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { errorCode } from "./api-error.ts";
import { orpc } from "./orpc.ts";
import { canReadRepos, canWriteSpec } from "./roles.ts";
import { useActiveOrganization } from "./use-active-organization.ts";
import { useSpecHead } from "./use-spec-head.ts";
import { useUnauthorizedRedirect } from "./use-unauthorized-redirect.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accès à la page : un seul état principal (session / organisation, rôle, projet, puis page). */
export type Gate = "loading" | "not-found" | "forbidden" | "ready";

/** État de la spec du projet : seul l'enregistrement en dépend, jamais l'ouverture de la page (S-framing §4.10). */
export type SpecGate =
  | { kind: "ready"; branch: string }
  | { kind: "building" }
  | { kind: "failed" }
  | { kind: "missing" }
  | { kind: "unknown" };

interface HeadLike {
  status: string;
  branch: string;
}

function specGateOf(
  head: HeadLike | null | undefined,
  headError: unknown,
  repos: readonly { role: string }[] | undefined,
): SpecGate {
  if (errorCode(headError) === "SPEC_INDEX_FAILED") return { kind: "failed" };
  if (head === undefined) return { kind: "unknown" };
  if (head === null) {
    if (!repos) return { kind: "unknown" };
    return { kind: repos.some((repo) => repo.role === "spec") ? "building" : "missing" };
  }
  if (head.status === "ready") return { kind: "ready", branch: head.branch };
  return { kind: head.status === "failed" ? "failed" : "building" };
}

function gateOf(flags: {
  valid: boolean;
  roleKnown: boolean;
  role: Role | undefined;
  notFound: boolean;
  loading: boolean;
}): Gate {
  if (!flags.valid) return "not-found";
  if (flags.loading || !flags.roleKnown) return "loading";
  // Un rôle connu sans droit d'écriture (client, business, inconnu) n'a pas l'écran ; sans rôle lisible, l'API arbitre.
  if (flags.role !== undefined && !canWriteSpec(flags.role)) return "forbidden";
  return flags.notFound ? "not-found" : "ready";
}

/**
 * Rôle, nom du projet et état de la spec. Un rôle sans droit d'écriture n'atteint jamais les appels `ai.*` ni
 * l'enregistrement (aucun formulaire) ; il peut seulement lire la spec comme sur la liste des fonctionnalités.
 */
export function useFramingAccess(projectId: string) {
  const valid = UUID.test(projectId);
  const { role, organizations, session } = useActiveOrganization();
  const project = useQuery(orpc.project.list.queryOptions());
  const pollEmpty = useRef(true);
  const writes = role === undefined || canWriteSpec(role);
  const head = useSpecHead(projectId, { enabled: valid, pollEmpty });
  const headData = head.query.data;
  const repos = useQuery({
    ...orpc.repo.list.queryOptions({ input: { projectId } }),
    enabled: valid && writes && headData === null && canReadRepos(role),
  });
  pollEmpty.current = !(repos.data && !repos.data.some((repo) => repo.role === "spec"));
  const redirecting = useUnauthorizedRedirect(head.query.error ?? repos.error);
  const notFound = errorCode(head.query.error) === "NOT_FOUND";
  const headSettled = headData !== undefined || head.query.isError;

  return {
    gate: gateOf({
      valid,
      roleKnown: !organizations.isPending && !session.isPending,
      role,
      notFound,
      loading: !headSettled || redirecting,
    }),
    role,
    projectName: project.data?.find((candidate) => candidate.id === projectId)?.name,
    spec: specGateOf(headData, head.query.error, repos.data),
    /** « Actualiser » : relit `spec.head` et rouvre la fenêtre de suivi, sans rien perdre de la saisie. */
    refresh: () => {
      head.restart();
      void head.query.refetch();
    },
  };
}
