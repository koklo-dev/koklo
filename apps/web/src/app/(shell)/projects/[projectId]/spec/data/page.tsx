import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DataPage } from "../../../../../../components/data-page.tsx";

export const metadata: Metadata = { title: "Modèle de données · Koklo" };

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  return <DataPage projectId={projectId} />;
}
