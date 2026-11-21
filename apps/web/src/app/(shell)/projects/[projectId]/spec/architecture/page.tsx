import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ArchitecturePage } from "../../../../../../components/architecture-page.tsx";

export const metadata: Metadata = { title: "Architecture · Koklo" };

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  return <ArchitecturePage projectId={projectId} />;
}
