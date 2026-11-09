"use client";

import { Button, EmptyState, InlineAlert, Pill, Prose, ProsePath, Skeleton } from "@koklo/ui";
import { SYNTHESIS_FILE, synthesisDate } from "../lib/idea-labels.ts";
import type { IdeaModel } from "../lib/use-idea-page.ts";
import type { IdeaSynthesisModel } from "../lib/use-idea-synthesis.ts";
import { ProposalText } from "./idea-proposal-text.tsx";

function SourceLine({ source, generatedAt }: { source: string | null; generatedAt: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 text-meta text-muted-foreground">
      <Pill tone="soft" icon="wand_stars">
        générée
      </Pill>
      <span>
        {source ? `Générée depuis ${source} · ${synthesisDate(generatedAt)}` : "Aperçu, non publié"}
      </span>
    </div>
  );
}

function RegenerateButton({
  synthesis,
  label = "Régénérer",
}: {
  synthesis: IdeaSynthesisModel;
  label?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      icon="sync"
      loading={synthesis.busy}
      className="max-md:h-11"
      onClick={synthesis.regenerate}
    >
      {label}
    </Button>
  );
}

/** Avant la première version : une phrase, et « Générer un aperçu » pour l'équipe. */
function SynthesisEmpty({ model, synthesis }: { model: IdeaModel; synthesis: IdeaSynthesisModel }) {
  return (
    <EmptyState
      icon="wand_stars"
      title="Pas encore de synthèse"
      description="La synthèse sera générée quand vous passerez au cadrage."
      action={
        model.canFreeze ? (
          <RegenerateButton synthesis={synthesis} label="Générer un aperçu" />
        ) : undefined
      }
    />
  );
}

/**
 * Page Synthèse (B262) : lecture seule, rendue en TEXTE inerte (aucun lien actif, aucune balise), chemin du fichier
 * publié, source et date ; « Régénérer » pour l'équipe, aperçu avant la première version.
 */
export function IdeaSynthesis({
  model,
  synthesis,
}: {
  model: IdeaModel;
  synthesis: IdeaSynthesisModel;
}) {
  const { data } = synthesis;
  if (synthesis.gate === "loading") return <Skeleton className="h-40 w-full max-w-[680px]" />;
  if (synthesis.gate === "error") {
    return (
      <InlineAlert
        variant="error"
        icon="error"
        action={{ label: "Réessayer", onClick: synthesis.refetch }}
      >
        La synthèse ne s'est pas chargée.
      </InlineAlert>
    );
  }
  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-4">
      <p aria-live="polite" className="sr-only">
        {synthesis.announcement}
      </p>
      {synthesis.failed ? (
        <InlineAlert variant="error" icon="error">
          La synthèse n'a pas pu être régénérée. Le texte précédent est gardé.
        </InlineAlert>
      ) : null}
      {data === null && model.version.latest ? (
        <InlineAlert
          variant="warning"
          icon="warning"
          action={
            model.canFreeze ? { label: "Régénérer", onClick: synthesis.regenerate } : undefined
          }
        >
          La synthèse n'a pas été générée avec {model.version.latest.tag}.
        </InlineAlert>
      ) : null}
      {data === null ? (
        model.version.latest ? null : (
          <SynthesisEmpty model={model} synthesis={synthesis} />
        )
      ) : (
        <Prose>
          <div className="flex flex-col gap-2">
            <ProsePath>{SYNTHESIS_FILE}</ProsePath>
            <h2 className="text-settings-title">Synthèse</h2>
            <SourceLine source={data.source} generatedAt={data.generatedAt} />
            {model.canFreeze ? (
              <div className="flex">
                <RegenerateButton synthesis={synthesis} />
              </div>
            ) : null}
          </div>
          <ProposalText markdown={data.contentMd} />
        </Prose>
      )}
    </div>
  );
}
