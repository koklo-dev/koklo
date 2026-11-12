"use client";

import type { Role } from "@koklo/contract";
import { InlineAlert } from "@koklo/ui";
import type { ReactNode } from "react";
import type { FeatureWrite } from "../lib/use-feature-submit.ts";
import { WriteFailure, WriteNotice } from "./saved-notice.tsx";

export interface StatusBlockProps {
  formOpen: boolean;
  region: { countBar: boolean; busy: boolean; text: string };
  write: FeatureWrite;
  role: Role | undefined;
  hrefFor: (specId: string) => string;
  onOpen: (specId: string) => void;
  onReopen: () => void;
  /** Avis du lancement de l'agent (« Un autre lancement est en cours »). */
  proposeNotice?: ReactNode;
}

/** Région d'état et avis d'écriture : sous le formulaire modal, c'est celle du panneau qui parle. */
export function StatusBlock(props: StatusBlockProps) {
  const { formOpen, region, write, role } = props;
  return (
    <>
      <div
        // Une seule région d'état dans le document : sous le formulaire modal, c'est celle du panneau ; avec la
        // barre de compte, c'est la sienne (elle annonce aussi les avis d'écriture que ce bloc affiche).
        role={formOpen || region.countBar ? undefined : "status"}
        aria-busy={region.busy || undefined}
        className="text-meta text-muted-foreground empty:hidden"
      >
        {formOpen ? null : (
          <>
            {region.countBar ? null : region.text}
            <WriteNotice write={write} role={role} hrefFor={props.hrefFor} onOpen={props.onOpen} />
          </>
        )}
      </div>
      {formOpen ? null : <WriteFailure write={write} role={role} onReopen={props.onReopen} />}
      {props.proposeNotice ? (
        <InlineAlert variant="neutral" icon="schedule">
          {props.proposeNotice}
        </InlineAlert>
      ) : null}
    </>
  );
}
