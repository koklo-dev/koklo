import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TechnicalPage } from "../../../../../../components/technical-page.tsx";

export const metadata: Metadata = { title: "Technique · Koklo" };

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  return <TechnicalPage projectId={projectId} />;
}
