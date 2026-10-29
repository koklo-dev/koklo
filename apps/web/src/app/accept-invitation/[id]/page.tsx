import type { Metadata } from "next";
import { AcceptInvitationPage } from "../../../components/accept-invitation-page.tsx";

/** Titre fixe et page non indexable : l'identifiant d'invitation ne doit apparaître nulle part. */
export const metadata: Metadata = {
  title: "Invitation – Koklo",
  robots: { index: false, follow: false },
};

export default async function AcceptInvitationRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AcceptInvitationPage invitationId={id} />;
}
