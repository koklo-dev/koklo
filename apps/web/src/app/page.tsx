import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { lastProjectPath } from "../lib/last-project.ts";
import { readRuntimeConfig } from "../lib/runtime-config.ts";

/** `/` ouvre le dernier projet ouvert (`project.recent`), sinon la liste des projets. */
export default async function Home(): Promise<never> {
  // `headers()` d'abord : la page est dynamique (jamais préparée au build, où la configuration d'exécution n'existe pas).
  const cookie = (await headers()).get("cookie");
  const { apiUrl } = readRuntimeConfig(process.env);
  redirect(await lastProjectPath(apiUrl, cookie));
}
