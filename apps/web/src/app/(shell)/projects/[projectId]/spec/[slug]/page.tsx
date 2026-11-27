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
  // L'architecture, le technique et la sécurité ont leur route dédiée, qui passe avant `[slug]`.
  if (!isSpecSlug(slug) || slug === "architecture" || slug === "technical" || slug === "security") {
    notFound();
  }
  return <SoonPage projectId={projectId} slug={slug} />;
}
