import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { SprintImportService } from "../../src/sprint-import/sprint-import.service.ts";
import { count } from "./organizations.ts";
import type { World } from "./tickets.ts";

/** Copie figée (date du ticket TK-34) des 17 fichiers sprint-NNN.md du vault : la CI ne lit jamais le vault. */
export const FIXTURE_DIR = join(import.meta.dirname, "..", "fixtures", "sprints");

export interface SprintSourceLike {
  fileName: string;
  text: string;
}

export function fixtureSources(): SprintSourceLike[] {
  return readdirSync(FIXTURE_DIR)
    .filter((name) => /^sprint-[0-9]{3}\.md$/.test(name))
    .sort()
    .map((fileName) => ({ fileName, text: readFileSync(join(FIXTURE_DIR, fileName), "utf8") }));
}

export const IMPORT_OPTIONS = { dryRun: false, startsOn: "2026-11-02", endsOn: "2026-11-13" };

export function scopeOf(world: World, role: "owner" | "admin" | "dev" = "owner") {
  return {
    organizationId: world.organizationId,
    projectId: world.projectId,
    userId: world.actors[role].userId,
  };
}

export function importerOf(app: INestApplication): SprintImportService {
  return app.get(SprintImportService);
}

/** Un ticket au format Shipyard (têtes et champs de `## ✅ Tasks`). */
export function ticketBlock(spec: {
  key: string;
  title: string;
  labels?: string;
  dependsOn?: string;
  checked?: boolean;
}): string {
  return [
    `- [${spec.checked ? "x" : " "}] **[${spec.key}]** ${spec.title}`,
    `  - Labels : ${spec.labels ?? "pkg:api, safe"}`,
    "  - Agent: orchestrateur",
    "  - Workflow: koklo-delivery",
    `  - Dépend de : ${spec.dependsOn ?? "aucune"}`,
    "  - Source : CDC §7.7",
    "  - À faire :",
    "    - Une chose",
    "  - Critères d'acceptation :",
    "    - [ ] Un critère",
  ].join("\n");
}

/** Un fichier de sprint minimal et valide autour des blocs de tickets donnés. */
export function sprintMarkdown(number: number, tasks: string[], goal = "Objectif de test"): string {
  return [
    "---",
    `tags: [sprint/${number}]`,
    "---",
    `# Sprint ${number} — Test`,
    "",
    "## 🎯 Sprint Goal",
    goal,
    "",
    "## ✅ Tasks",
    ...tasks,
    "",
    "## 📊 Sprint DoD",
    "- [ ] DoD globale",
    "",
  ].join("\n");
}

export const sprintFile = (number: number): string =>
  `sprint-${String(number).padStart(3, "0")}.md`;

export async function tableCounts(database: TestDatabase, organizationId: string) {
  const where = "organization_id = $1";
  const params = [organizationId];
  return {
    tickets: await count(database, "tickets", where, params),
    sprints: await count(database, "sprints", where, params),
    dependencies: await count(database, "ticket_dependencies", where, params),
    criteria: await count(database, "acceptance_criteria", where, params),
    audit: await count(database, "audit_log", where, params),
  };
}
