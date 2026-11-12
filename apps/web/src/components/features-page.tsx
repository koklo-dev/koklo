"use client";

import { Skeleton } from "@koklo/ui";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { purgeFramingDrafts } from "../lib/feature-draft.ts";
import { readFeaturesTab } from "../lib/features-tab.ts";
import { canManage } from "../lib/roles.ts";
import { useActiveOrganization } from "../lib/use-active-organization.ts";
import { ClientValidationPage } from "./client-validation-page.tsx";
import { DomainTab } from "./domain-tab.tsx";
import { FeaturesListTab } from "./features-list-tab.tsx";
import { PageBody } from "./page-body.tsx";

/**
 * Cahier fonctionnel d'un projet (`/projects/<id>/spec/functional?tab=`) : un onglet par type d'élément, chacun
 * en lecture et en écriture. Un `tab` inconnu ouvre les fonctionnalités.
 *
 * Aiguillage (TK-104) : le client et le business lisent la vue client (le business sans action) ; le propriétaire et
 * l'administrateur y accèdent par `?vue=client` pour valider un projet sans client (D1) ; les autres rôles ont la vue
 * équipe. Le serveur reste l'autorité : la vue ne propose que ce qu'il accepterait.
 */
export function FeaturesPage({ projectId }: { projectId: string }) {
  // Les brouillons de l'ancien Assistant de cadrage (retiré en TK-102) ne servent plus.
  useEffect(purgeFramingDrafts, []);
  const search = useSearchParams();
  const { role, organizations, session } = useActiveOrganization();
  const tab = readFeaturesTab(search.toString());
  if (organizations.isPending || session.isPending) {
    return (
      <PageBody>
        <Skeleton aria-busy="true" className="h-64 rounded-xl" />
      </PageBody>
    );
  }
  const clientView =
    role === "client" || role === "business" || (canManage(role) && search.get("vue") === "client");
  if (clientView) return <ClientValidationPage projectId={projectId} />;
  return tab === "features" ? (
    <FeaturesListTab projectId={projectId} />
  ) : (
    <DomainTab projectId={projectId} tab={tab} />
  );
}
