import type { Metadata } from "next";
import { type ReactNode, Suspense } from "react";
import { IdeaPage } from "../../../../../components/idea-page.tsx";

export const metadata: Metadata = { title: "Idée · Koklo" };

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  return (
    <Suspense>
      <IdeaPage projectId={projectId} />
    </Suspense>
  );
}
