import type { Metadata } from "next";
import type { ReactNode } from "react";
import { FeaturesPage } from "../../../../components/features-page.tsx";

export const metadata: Metadata = { title: "Fonctionnalités · Koklo" };

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  return <FeaturesPage projectId={projectId} />;
}
