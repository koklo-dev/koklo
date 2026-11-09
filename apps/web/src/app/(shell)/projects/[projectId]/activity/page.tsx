import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ActivityPage } from "../../../../../components/activity-page.tsx";

export const metadata: Metadata = { title: "Activité · Koklo" };

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  return <ActivityPage projectId={projectId} />;
}
