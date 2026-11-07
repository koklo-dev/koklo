import { installationCallbackOutcomeSchema } from "@koklo/contract";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { SettingsPage } from "../../../../components/settings-page.tsx";
import { SETTINGS_LABELS } from "../../../../lib/settings-sections.ts";
import { isSettingsSection } from "../../../../lib/shell-routes.ts";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section } = await params;
  return {
    title: `${isSettingsSection(section) ? SETTINGS_LABELS[section] : "Réglages"} · Réglages · Koklo`,
  };
}

/** `/settings/members|github|ai` dans un même cadre ; toute autre section : 404. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const { section } = await params;
  if (!isSettingsSection(section)) notFound();
  // Retour de GitHub : seule une des valeurs du contrat est transmise, tout le reste est ignoré.
  const parsed = installationCallbackOutcomeSchema.safeParse((await searchParams).result);
  return (
    <SettingsPage section={section} {...(parsed.success ? { githubResult: parsed.data } : {})} />
  );
}
