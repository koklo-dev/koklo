"use client";

import type { FeaturesTab } from "../lib/features-tab.ts";
import type { useProposals } from "../lib/use-proposals.ts";
import { ProposeDialog } from "./features-propose.tsx";
import { FeaturesReview } from "./features-review.tsx";

/** Relecture : en bandes pleine largeur sous les onglets (maquette 10 l.114-134), sans le cadre de page. */
export function ReviewView({
  projectId,
  branch,
  tab,
  propose,
  onLeave,
}: {
  projectId: string;
  branch: string | undefined;
  tab: FeaturesTab;
  propose: ReturnType<typeof useProposals>;
  onLeave: () => void;
}) {
  return (
    <>
      <FeaturesReview projectId={projectId} branch={branch} tab={tab} onLeave={onLeave} />
      {propose.enabled ? <ProposeDialog launch={propose.launch} /> : null}
    </>
  );
}
