"use client";

import { useToast } from "@koklo/ui";
import { useEffect, useRef } from "react";
import { feminineId } from "./features-region.ts";
import type { FeatureWrite } from "./use-feature-submit.ts";

/**
 * Toast de fin d'écriture (maquette 16 l.106-108, l.221) : « F-249 enregistrée dans la spec · commit e4c90a1 »,
 * une seule fois par commit. Une suppression a sa propre confirmation sur la page.
 */
export function useSavedToast(write: FeatureWrite): void {
  const { toast } = useToast();
  const done = useRef<string | null>(null);
  const { saved } = write;
  useEffect(() => {
    if (!saved?.commitSha || !saved.meta.specId || saved.meta.kind === "delete") return;
    const key = `${saved.meta.target}:${saved.commitSha}`;
    if (done.current === key) return;
    done.current = key;
    const e = feminineId(saved.meta.specId) ? "e" : "";
    const verb = saved.meta.kind === "create" ? `enregistré${e}` : `modifié${e}`;
    toast({
      tone: "success",
      title: `${saved.meta.specId} ${verb} dans la spec · commit ${saved.commitSha.slice(0, 7)}`,
      action: { label: "OK", onClick: () => undefined },
    });
  }, [saved, toast]);
}
