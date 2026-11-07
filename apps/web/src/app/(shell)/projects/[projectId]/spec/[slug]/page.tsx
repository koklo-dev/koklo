import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { SoonPage } from "../../../../../../components/soon-page.tsx";
import { isSpecSlug } from "../../../../../../lib/shell-routes.ts";

export const metadata: Metadata = { title: "Spec · Koklo" };

/** Les livrables sans écran (tous sauf `functional`, qui a sa page) : « Bientôt ». Un livrable inconnu : 404. */
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string; slug: string }>;
}): Promise<ReactNode> {
  const { projectId, slug } = await params;
  if (!isSpecSlug(slug)) notFound();
  return <SoonPage projectId={projectId} slug={slug} />;
}
