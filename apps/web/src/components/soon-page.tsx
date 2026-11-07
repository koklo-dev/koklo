"use client";

import { EmptyState, ProjectHeader } from "@koklo/ui";
import { projectPath, type SpecSlug } from "../lib/shell-routes.ts";
import { useProjectShell } from "../lib/use-project-shell.ts";
import { PageBody } from "./page-body.tsx";
import { ShellLink } from "./shell-link.tsx";

type SoonSlug = "idea" | SpecSlug;

/** Titre du livrable et phrase de la page « Bientôt » (DESIGN.md §5.4) : aucune promesse de date, aucune action. */
const SOON: Record<SoonSlug, { title: string; sentence: string }> = {
  idea: { title: "Idée", sentence: "L'espace Idée arrive dans une prochaine version." },
  functional: {
    title: "Fonctionnel",
    sentence: "Le cahier fonctionnel arrive dans une prochaine version.",
  },
  data: { title: "Données", sentence: "Le cahier des données arrive dans une prochaine version." },
  architecture: {
    title: "Architecture",
    sentence: "Le cahier d'architecture arrive dans une prochaine version.",
  },
  technical: {
    title: "Technique",
    sentence: "Le cahier technique arrive dans une prochaine version.",
  },
  security: {
    title: "Sécurité",
    sentence: "Le cahier de sécurité arrive dans une prochaine version.",
  },
  design: { title: "Design", sentence: "Le cahier de design arrive dans une prochaine version." },
  quality: {
    title: "Qualité",
    sentence: "Le cahier de qualité arrive dans une prochaine version.",
  },
};

/** Page d'un livrable ou de l'espace Idée pas encore livré : en-tête de projet, puis `EmptyState` « Bientôt ». */
export function SoonPage({ projectId, slug }: { projectId: string; slug: SoonSlug }) {
  const shell = useProjectShell(projectId);
  const { title, sentence } = SOON[slug];
  return (
    <>
      <ProjectHeader
        project={{ name: shell.data?.name ?? "Projet", href: projectPath(projectId) }}
        {...(slug === "idea" ? {} : { section: "Spec" })}
        page={title}
        title={title}
        LinkComponent={ShellLink}
      />
      <PageBody>
        <EmptyState
          icon="schedule"
          title="Bientôt"
          description={sentence}
          className="mx-auto max-w-xl"
        />
      </PageBody>
    </>
  );
}
