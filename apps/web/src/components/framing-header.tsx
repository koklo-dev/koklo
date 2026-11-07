import { ProjectHeader } from "@koklo/ui";
import { IDS } from "../lib/framing-ids.ts";
import { HELP_TEXT } from "../lib/framing-labels.ts";
import { projectPath } from "../lib/shell-routes.ts";
import { ShellLink } from "./shell-link.tsx";

/** En-tête de l'Assistant de cadrage : emplacement, h1 (cible du focus) et phrase d'aide (S-framing §3.1). */
export function FramingHeader({
  projectId,
  name,
}: {
  projectId: string;
  name: string | undefined;
}) {
  return (
    <ProjectHeader
      project={{ name: name ?? "Projet", href: projectPath(projectId) }}
      page="Assistant de cadrage"
      title="Assistant de cadrage"
      titleId={IDS.title}
      summary={HELP_TEXT}
      LinkComponent={ShellLink}
    />
  );
}
