import { installationCallbackOutcomeSchema } from "@koklo/contract";
import type { Metadata } from "next";
import { GithubPage } from "../../components/github-page.tsx";

export const metadata: Metadata = { title: "GitHub · Koklo" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Retour de GitHub : seule une des valeurs du contrat est transmise, tout le reste est ignoré.
  const parsed = installationCallbackOutcomeSchema.safeParse((await searchParams).result);
  return <GithubPage result={parsed.success ? parsed.data : undefined} />;
}
