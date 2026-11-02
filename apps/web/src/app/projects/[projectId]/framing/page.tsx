import type { Metadata } from "next";
import type { ReactNode } from "react";
import { FramingPage } from "../../../../components/framing-page.tsx";

export const metadata: Metadata = { title: "Cadrage · Koklo" };

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  return <FramingPage projectId={projectId} />;
}
