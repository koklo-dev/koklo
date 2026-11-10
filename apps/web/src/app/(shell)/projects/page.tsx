import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ProjectsPage } from "../../../components/projects-page.tsx";
import { readRuntimeConfig } from "../../../lib/runtime-config.ts";
import { singleClientProjectPath } from "../../../lib/single-client-project.ts";

export const metadata: Metadata = { title: "Projets · Koklo" };

/**
 * Un client qui n'a qu'un projet n'a pas de liste à parcourir (B305) : la page serveur l'envoie sur ce projet, sauf
 * si une recherche ou un filtre est posé dans l'adresse.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  if (!params.q && !params.phase) {
    // `headers()` : la page est dynamique (jamais préparée au build, où la configuration d'exécution n'existe pas).
    const cookie = (await headers()).get("cookie");
    const { apiUrl } = readRuntimeConfig(process.env);
    const single = await singleClientProjectPath(apiUrl, cookie);
    if (single) redirect(single);
  }
  return <ProjectsPage />;
}
