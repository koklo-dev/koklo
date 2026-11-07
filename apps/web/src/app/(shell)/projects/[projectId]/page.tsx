import { redirect } from "next/navigation";
import { featuresPath } from "../../../../lib/shell-routes.ts";

/** Vue d'ensemble du projet (lot 3) : en attendant, le cahier fonctionnel, onglet Fonctionnalités. */
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<never> {
  const { projectId } = await params;
  redirect(featuresPath(projectId));
}
