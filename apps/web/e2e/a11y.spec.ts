import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  AXE_TAGS,
  type KanbanBoard,
  type KanbanRole,
  releaseHeld,
  setScenario,
  settle,
  switchToDark,
} from "./support/helpers.ts";
import type { ProvidersScenario } from "./support/stub-ai-providers.ts";
import { FEATURE_PROJECT_ID } from "./support/stub-features.ts";

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
  providers?: ProvidersScenario["providers"];
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
  // Fournisseurs d'IA (S-ai-settings §7) : axe sans violation sur chaque état, clair et sombre
  {
    name: "ai-settings empty",
    path: "/settings/ai",
    session: true,
    projects: "data",
    providers: { list: "empty" },
  },
  {
    name: "ai-settings two providers",
    path: "/settings/ai",
    session: true,
    projects: "data",
    providers: { list: "two" },
  },
  {
    name: "ai-settings three providers",
    path: "/settings/ai",
    session: true,
    projects: "data",
    providers: { list: "three" },
  },
  {
    name: "ai-settings invalid key",
    path: "/settings/ai",
    session: true,
    projects: "data",
    providers: { list: "invalid" },
  },
  {
    name: "ai-settings cap warning",
    path: "/settings/ai",
    session: true,
    projects: "data",
    providers: { list: "two", report: "warning" },
  },
  {
    name: "ai-settings cap suspended",
    path: "/settings/ai",
    session: true,
    projects: "data",
    providers: { list: "two", report: "suspended" },
  },
  {
    name: "ai-settings loading",
    path: "/settings/ai",
    session: true,
    projects: "data",
    providers: { list: "loading" },
  },
  {
    name: "ai-settings error",
    path: "/settings/ai",
    session: true,
    projects: "data",
    providers: { list: "internal" },
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
    providers,
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
        ...(providers ? { providers } : {}),
      });
      await page.goto(path);
      if (theme === "dark") await switchToDark(page);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      // Les transitions de couleur de la bascule de thème faussent le contraste : on attend leur fin.
      await settle(page);
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(results.violations).toEqual([]);
      await releaseHeld();
    });
  }
}
