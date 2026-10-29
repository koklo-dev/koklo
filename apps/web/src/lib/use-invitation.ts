"use client";

import type { Role } from "@koklo/contract";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { authClient } from "./auth-client.ts";
import { isInvitationId, loginPathFor } from "./next-path.ts";

export interface InvitationPreview {
  organizationId: string;
  organizationName: string;
  role: Role;
  inviterEmail: string | undefined;
}

export type InvitationState =
  | { kind: "loading" }
  | { kind: "ready"; preview: InvitationPreview; busy: boolean; failed: boolean }
  | { kind: "success"; preview: InvitationPreview }
  | { kind: "member"; organizationId: string; busy: boolean }
  | { kind: "wrong" }
  | { kind: "invalid" }
  | { kind: "error" };

type Failure = "invalid" | "wrong" | "technical";

/** Better Auth ne distingue pas inconnue / expirée / annulée / acceptée : un seul code `INVITATION_NOT_FOUND`. */
function classify(error: unknown): Failure {
  const read = (key: string): unknown =>
    typeof error === "object" && error !== null ? Reflect.get(error, key) : undefined;
  const code = read("code");
  const status = read("status");
  if (code === "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION" || status === 403) return "wrong";
  if (code === "INVITATION_NOT_FOUND" || status === 400 || status === 404) return "invalid";
  return "technical";
}

function toPreview(data: Record<string, unknown>): InvitationPreview {
  const inviter = data.inviterEmail;
  return {
    organizationId: String(data.organizationId),
    organizationName: String(data.organizationName),
    role: data.role as Role,
    inviterEmail: typeof inviter === "string" ? inviter : undefined,
  };
}

async function isMemberOf(organizationId: string): Promise<boolean> {
  try {
    const result = await authClient.organization.list();
    return Boolean(result?.data?.some((organization) => organization.id === organizationId));
  } catch {
    return false;
  }
}

async function attempt<T extends { error?: unknown }>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await call();
  } catch {
    return null;
  }
}

const FAILED_STATE: Record<Failure, InvitationState | null> = {
  invalid: { kind: "invalid" },
  wrong: { kind: "wrong" },
  technical: null,
};

type SetState = (state: InvitationState) => void;

/** Aperçu de l'invitation : session, puis `getInvitation` (jamais appelé sans session). */
function useLoad(invitationId: string, setState: SetState, setEmail: (email: string) => void) {
  const router = useRouter();
  const path = `/accept-invitation/${invitationId}`;
  const load = useCallback(async () => {
    setState({ kind: "loading" });
    const session = await attempt(() => authClient.getSession());
    if (!session) return setState({ kind: "error" });
    const user = session.data?.user;
    if (!user) return router.replace(loginPathFor(path));
    setEmail(user.email);
    if (!isInvitationId(invitationId)) return setState({ kind: "invalid" });
    const result = await attempt(() =>
      authClient.organization.getInvitation({ query: { id: invitationId } }),
    );
    if (!result) return setState({ kind: "error" });
    if (result.error || !result.data) {
      return setState(FAILED_STATE[classify(result.error)] ?? { kind: "error" });
    }
    const preview = toPreview(result.data);
    setState(
      (await isMemberOf(preview.organizationId))
        ? { kind: "member", organizationId: preview.organizationId, busy: false }
        : { kind: "ready", preview, busy: false, failed: false },
    );
  }, [invitationId, path, router, setState, setEmail]);
  useEffect(() => {
    void load();
  }, [load]);
  return load;
}

/** Acceptation, ouverture des projets (déjà membre) et déconnexion. */
function useActions(invitationId: string, setState: SetState) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const accept = useCallback(
    async (preview: InvitationPreview) => {
      setState({ kind: "ready", preview, busy: true, failed: false });
      const result = await attempt(() =>
        authClient.organization.acceptInvitation({ invitationId }),
      );
      if (result && !result.error) {
        void queryClient.invalidateQueries();
        setState({ kind: "success", preview });
        return router.replace("/projects");
      }
      const next = FAILED_STATE[result ? classify(result.error) : "technical"];
      if (next) return setState(next);
      // Better Auth répond 500 (contrainte unique) pour un membre déjà présent : on tranche côté client.
      if (await isMemberOf(preview.organizationId)) {
        return setState({ kind: "member", organizationId: preview.organizationId, busy: false });
      }
      setState({ kind: "ready", preview, busy: false, failed: true });
    },
    [invitationId, queryClient, router, setState],
  );
  const openProjects = useCallback(
    async (organizationId: string) => {
      setState({ kind: "member", organizationId, busy: true });
      const result = await attempt(() => authClient.organization.setActive({ organizationId }));
      if (!result || result.error) return setState({ kind: "error" });
      void queryClient.invalidateQueries();
      router.replace("/projects");
    },
    [queryClient, router, setState],
  );
  const signOut = useCallback(async () => {
    await attempt(() => authClient.signOut());
    router.replace(loginPathFor(`/accept-invitation/${invitationId}`));
  }, [invitationId, router]);
  return { accept, openProjects, signOut };
}

/** Machine d'états de l'écran d'acceptation (aperçu, acceptation, cas d'erreur). */
export function useInvitation(invitationId: string) {
  const [state, setState] = useState<InvitationState>({ kind: "loading" });
  const [email, setEmail] = useState<string | undefined>();
  const load = useLoad(invitationId, setState, setEmail);
  return { state, email, load, ...useActions(invitationId, setState) };
}
