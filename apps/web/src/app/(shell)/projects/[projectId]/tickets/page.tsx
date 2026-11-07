import type { Metadata } from "next";
import type { ReactNode } from "react";
import { KanbanPage } from "../../../../../components/kanban-page.tsx";

export const metadata: Metadata = { title: "Tickets · Koklo" };

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  return <KanbanPage projectId={projectId} />;
}
