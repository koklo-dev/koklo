import type { Metadata } from "next";
import type { ReactNode } from "react";
import { OverviewPage } from "../../../../components/overview-page.tsx";

export const metadata: Metadata = { title: "Vue d'ensemble · Koklo" };

/** Vue d'ensemble du projet (lot 3, S-overview) : remplace la redirection provisoire vers le cahier fonctionnel. */
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  return <OverviewPage projectId={projectId} />;
}
