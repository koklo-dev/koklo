"use client";

import { Button, EmptyState } from "@koklo/ui";
import type { ReactElement } from "react";
import { TECHNICAL_READY_TEXT, TECHNICAL_READY_TITLE } from "../lib/technical-labels.ts";

/** Prêt (maquette 14 l.90-102) : l'agent peut proposer le cahier, ou l'équipe l'écrit à la main. */
export function TechnicalReady({ agent, onCreate }: { agent: ReactElement; onCreate: () => void }) {
  return (
    <div className="mx-auto mt-8 flex w-full max-w-[580px] flex-col gap-3 px-4 pb-8">
      <EmptyState
        icon="terminal"
        title={TECHNICAL_READY_TITLE}
        description={TECHNICAL_READY_TEXT}
        wideDescription
        action={agent}
        secondaryAction={
          <Button type="button" variant="outline" className="h-11 md:h-9" onClick={onCreate}>
            Écrire à la main
          </Button>
        }
      />
    </div>
  );
}
