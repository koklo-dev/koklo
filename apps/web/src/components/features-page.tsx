"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { purgeFramingDrafts } from "../lib/feature-draft.ts";
import { readFeaturesTab } from "../lib/features-tab.ts";
import { DomainTab } from "./domain-tab.tsx";
import { FeaturesListTab } from "./features-list-tab.tsx";

/**
 * Cahier fonctionnel d'un projet (`/projects/<id>/spec/functional?tab=`) : un onglet par type d'élément, chacun
 * en lecture et en écriture. Un `tab` inconnu ouvre les fonctionnalités.
 */
export function FeaturesPage({ projectId }: { projectId: string }) {
  // Les brouillons de l'ancien Assistant de cadrage (retiré en TK-102) ne servent plus.
  useEffect(purgeFramingDrafts, []);
  const tab = readFeaturesTab(useSearchParams().toString());
  return tab === "features" ? (
    <FeaturesListTab projectId={projectId} />
  ) : (
    <DomainTab projectId={projectId} tab={tab} />
  );
}
