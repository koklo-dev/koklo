import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SecurityPage } from "../../../../../../components/security-page.tsx";

export const metadata: Metadata = { title: "Sécurité · Koklo" };

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  return <SecurityPage projectId={projectId} />;
}
