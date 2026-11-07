import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  AXE_TAGS,
  type KanbanBoard,
  type KanbanRole,
  releaseHeld,
  setScenario,
  switchToDark,
} from "./support/helpers.ts";
import { FEATURE_PROJECT_ID } from "./support/stub-features.ts";
import type { LlmScenario } from "./support/stub-llm-credential.ts";

type Page = {
  name: string;
  path: string;
  session: boolean;
  projects: "loading" | "empty" | "data" | "internal";
  organizations?: "none" | "one" | "many";
  activeOrganization?: boolean;
  board?: KanbanBoard;
  role?: KanbanRole;
  installations?: "loading" | "empty" | "data" | "internal";
  llm?: LlmScenario["llm"];
};

const PAGES: readonly Page[] = [
  { name: "login", path: "/login", session: false, projects: "data" },
  {
    name: "idea soon",
    path: `/projects/${FEATURE_PROJECT_ID}/idea`,
    session: true,
    projects: "data",
  },
  {
    name: "data soon",
    path: `/projects/${FEATURE_PROJECT_ID}/spec/data`,
    session: true,
    projects: "data",
  },
  {
    name: "functional rules soon",
    path: `/projects/${FEATURE_PROJECT_ID}/spec/functional?tab=rules`,
    session: true,
    projects: "data",
  },
  { name: "projects loading", path: "/projects", session: true, projects: "loading" },
  { name: "projects empty", path: "/projects", session: true, projects: "empty" },
  { name: "projects data", path: "/projects", session: true, projects: "data" },
  { name: "projects error", path: "/projects", session: true, projects: "internal" },
  {
    name: "kanban loading",
    path: `/projects/${FEATURE_PROJECT_ID}/tickets`,
    session: true,
    projects: "data",
    board: "loading",
  },
  {
    name: "kanban no sprint",
    path: `/projects/${FEATURE_PROJECT_ID}/tickets`,
    session: true,
    projects: "data",
    board: "noSprint",
  },
  {
    name: "kanban empty",
    path: `/projects/${FEATURE_PROJECT_ID}/tickets`,
    session: true,
    projects: "data",
    board: "empty",
  },
  {
    name: "kanban data",
    path: `/projects/${FEATURE_PROJECT_ID}/tickets`,
    session: true,
    projects: "data",
    board: "data",
  },
  {
    name: "kanban data read-only",
    path: `/projects/${FEATURE_PROJECT_ID}/tickets`,
    session: true,
    projects: "data",
    board: "data",
    role: "client",
  },
  {
    name: "kanban error",
    path: `/projects/${FEATURE_PROJECT_ID}/tickets`,
    session: true,
    projects: "data",
    board: "internal",
  },
  { name: "members", path: "/settings/members", session: true, projects: "data" },
  {
    name: "github loading",
    path: "/settings/github",
    session: true,
    projects: "data",
    installations: "loading",
  },
  {
    name: "github empty",
    path: "/settings/github",
    session: true,
    projects: "data",
    installations: "empty",
  },
  {
    name: "github data",
    path: "/settings/github",
    session: true,
    projects: "data",
    installations: "data",
  },
  {
    name: "github error",
    path: "/settings/github",
    session: true,
    projects: "data",
    installations: "internal",
  },
  {
    name: "github result installed",
    path: "/settings/github?result=installed",
    session: true,
    projects: "data",
    installations: "data",
  },
  {
    name: "github result denied",
    path: "/settings/github?result=denied",
    session: true,
    projects: "data",
    installations: "data",
  },
  {
    name: "github non-manager",
    path: "/settings/github",
    session: true,
    projects: "data",
    role: "dev",
  },
  // Réglages de l'IA (S-ai-settings §7) : axe sans violation sur chaque état, clair et sombre
  {
    name: "ai-settings loading",
    path: "/settings/ai",
    session: true,
    projects: "data",
    llm: { list: "loading" },
  },
  {
    name: "ai-settings absent",
    path: "/settings/ai",
    session: true,
    projects: "data",
    llm: { list: "absent" },
  },
  {
    name: "ai-settings configured",
    path: "/settings/ai",
    session: true,
    projects: "data",
    llm: { list: "configured" },
  },
  {
    name: "ai-settings invalid",
    path: "/settings/ai",
    session: true,
    projects: "data",
    llm: { list: "invalid" },
  },
  {
    name: "ai-settings error",
    path: "/settings/ai",
    session: true,
    projects: "data",
    llm: { list: "internal" },
  },
  {
    name: "ai-settings non-admin",
    path: "/settings/ai",
    session: true,
    projects: "data",
    role: "dev",
  },
  {
    name: "organizations create",
    path: "/organizations",
    session: true,
    projects: "data",
    organizations: "none",
    activeOrganization: false,
  },
  {
    name: "organizations choose",
    path: "/organizations",
    session: true,
    projects: "data",
    organizations: "many",
    activeOrganization: false,
  },
  {
    name: "organizations choose active",
    path: "/organizations",
    session: true,
    projects: "data",
    organizations: "many",
    activeOrganization: true,
  },
];

for (const theme of ["light", "dark"] as const) {
  for (const {
    name,
    path,
    session,
    projects,
    organizations,
    activeOrganization,
    board,
    role,
    installations,
    llm,
  } of PAGES) {
    test(`axe WCAG AA sans violation : ${name} (${theme})`, async ({ page }) => {
      await setScenario({
        session,
        projects,
        ...(organizations ? { organizations } : {}),
        ...(activeOrganization === undefined ? {} : { activeOrganization }),
        ...(board ? { board } : {}),
        ...(role ? { role } : {}),
        ...(installations ? { installations } : {}),
        ...(llm ? { llm } : {}),
      });
      await page.goto(path);
      if (theme === "dark") await switchToDark(page);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(results.violations).toEqual([]);
      await releaseHeld();
    });
  }
}
