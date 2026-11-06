import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevUiGallery } from "../../../components/dev-ui-gallery.tsx";
import { readRuntimeConfig } from "../../../lib/runtime-config.ts";

export const metadata: Metadata = { title: "Galerie des composants · Koklo" };

/**
 * Rendu à chaque requête : `APP_ENV` est lu à l'exécution, jamais figé au build. Segment de route plutôt
 * que `connection()`, qui exige une portée de requête et rendrait la page impossible à rendre en test.
 */
export const dynamic = "force-dynamic";

/** Environnements où la galerie est ouverte : liste blanche, toute autre valeur d'`APP_ENV` la ferme. */
const OPEN_ENVS: ReadonlySet<string> = new Set(["development", "test", "staging"]);

/**
 * Galerie `/dev/ui` (fiche S-dev-ui) : équipe et tests de captures, hors `AppShell`, sans session ni appel
 * d'API. Fermée hors de `OPEN_ENVS` (donc en production) par un 404 standard, sans indice de son existence.
 */
export default function DevUiPage() {
  if (!OPEN_ENVS.has(readRuntimeConfig(process.env).appEnv)) notFound();
  return <DevUiGallery />;
}
