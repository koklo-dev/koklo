import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SoonPage } from "../../../../../components/soon-page.tsx";

export const metadata: Metadata = { title: "Idée · Koklo" };

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  return <SoonPage projectId={projectId} slug="idea" />;
}
