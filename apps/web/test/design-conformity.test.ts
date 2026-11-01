import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** TK-24 C5 : uniquement composants et tokens de @koklo/ui (DESIGN.md) dans les fichiers du ticket. */
const src = join(import.meta.dirname, "../src");
const FILES = [
  "components/organizations-page.tsx",
  "components/members-page.tsx",
  "components/projects-page.tsx",
  "components/projects-view.tsx",
  "components/team-switcher.tsx",
  "components/app-sidebar.tsx",
  "app/organizations/page.tsx",
  "app/members/page.tsx",
  "app/members/layout.tsx",
  "components/accept-invitation-page.tsx",
  "app/accept-invitation/[id]/page.tsx",
  // TK-35 : kanban
  "components/kanban-page.tsx",
  "components/kanban-view.tsx",
  "components/kanban-column.tsx",
  "components/kanban-card.tsx",
  "app/kanban/page.tsx",
  "app/kanban/layout.tsx",
  // TK-48b : écran /github
  "components/github-page.tsx",
  "components/github-installations.tsx",
  "components/github-status.tsx",
  "components/github-result-notice.tsx",
  "components/github-empty.tsx",
  "lib/github-labels.ts",
  "lib/github-redirect.ts",
  "app/github/page.tsx",
  "app/github/layout.tsx",
  // TK-48c : création de projet avec dépôt de spec (design/screens/S-projects.md section 11)
  "components/project-create-sheet.tsx",
  "components/project-create-flow.tsx",
  "components/project-create-steps.tsx",
  "components/github-account-field.tsx",
  "components/spec-repo-failure.tsx",
  "components/spec-repo-resume-notice.tsx",
  "lib/use-project-creation.ts",
  "lib/spec-repo-errors.ts",
  "lib/spec-repo-name.ts",
  "lib/creation-resume.ts",
  // TK-48c, repli repo.link (sous-lot détachable)
  "components/spec-repo-link-form.tsx",
  // TK-48d : liste des fonctionnalités d'un projet (design/screens/S-features.md section 11)
  "components/features-page.tsx",
  "components/features-list.tsx",
  "components/features-filters.tsx",
  "components/feature-sheet.tsx",
  "components/feature-detail.tsx",
  "components/features-empty.tsx",
  "components/spec-preparing.tsx",
  "components/spec-repo-missing.tsx",
  "components/spec-index-failed.tsx",
  "components/feature-error.tsx",
  "components/nav-projects.tsx",
  "lib/feature-labels.ts",
  "lib/features-url.ts",
  "lib/spec-errors.ts",
  "lib/use-features.ts",
  "lib/use-spec-head.ts",
  "app/projects/[projectId]/features/page.tsx",
  "app/projects/[projectId]/features/layout.tsx",
  // TK-48e : formulaire d'une fonctionnalité (design/screens/S-feature-form.md section 11)
  "components/feature-form-sheet.tsx",
  "components/feature-form-fields.tsx",
  "components/feature-criteria-editor.tsx",
  "components/criterion-item.tsx",
  "components/feature-links-fields.tsx",
  "components/feature-form-errors.tsx",
  "components/save-progress.tsx",
  "components/draft-banner.tsx",
  "components/saved-notice.tsx",
  // TK-48e-2 : suppression d'une fonctionnalité (S-feature-form §4.8)
  "components/feature-delete-confirm.tsx",
  "lib/feature-form.ts",
  "lib/feature-operation.ts",
  "lib/feature-draft.ts",
  "lib/feature-rebase.ts",
  "lib/feature-errors.ts",
  "lib/feature-tracking.ts",
  "lib/spec-issues.ts",
  "lib/use-feature-submit.ts",
  "lib/use-feature-draft.ts",
  "lib/use-pending-save.ts",
];

const RAW_COLOR_CLASS =
  /\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|decoration)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|white|black)(?:-\d{2,3})?\b/;

describe.each(FILES)("%s", (file) => {
  const path = join(src, file);

  it("existe", () => {
    expect(existsSync(path), `${file} absent`).toBe(true);
  });

  it("n'embarque ni couleur en dur ni classe de couleur Tailwind brute ni SVG inline", () => {
    if (!existsSync(path)) throw new Error(`${file} absent`);
    const code = readFileSync(path, "utf8");
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/\brgba?\(|\bhsla?\(|\boklch\(/);
    expect(code).not.toMatch(RAW_COLOR_CLASS);
    expect(code).not.toMatch(/<svg\b/);
  });
});
