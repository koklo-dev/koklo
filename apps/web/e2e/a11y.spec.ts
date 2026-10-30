import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  type KanbanBoard,
  type KanbanRole,
  releaseHeld,
  setScenario,
  switchToDark,
} from "./support/helpers.ts";

type Page = {
  name: string;
  path: string;
  session: boolean;
  projects: "loading" | "empty" | "data" | "internal";
  organizations?: "none" | "one" | "many";
  activeOrganization?: boolean;
  board?: KanbanBoard;
  role?: KanbanRole;
};

const PAGES: readonly Page[] = [
  { name: "login", path: "/login", session: false, projects: "data" },
  { name: "projects loading", path: "/projects", session: true, projects: "loading" },
  { name: "projects empty", path: "/projects", session: true, projects: "empty" },
  { name: "projects data", path: "/projects", session: true, projects: "data" },
  { name: "projects error", path: "/projects", session: true, projects: "internal" },
  { name: "kanban loading", path: "/kanban", session: true, projects: "data", board: "loading" },
  { name: "kanban no sprint", path: "/kanban", session: true, projects: "data", board: "noSprint" },
  { name: "kanban empty", path: "/kanban", session: true, projects: "data", board: "empty" },
  { name: "kanban data", path: "/kanban", session: true, projects: "data", board: "data" },
  {
    name: "kanban data read-only",
    path: "/kanban",
    session: true,
    projects: "data",
    board: "data",
    role: "client",
  },
  { name: "kanban error", path: "/kanban", session: true, projects: "data", board: "internal" },
  { name: "members", path: "/members", session: true, projects: "data" },
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
  } of PAGES) {
    test(`axe WCAG AA sans violation : ${name} (${theme})`, async ({ page }) => {
      await setScenario({
        session,
        projects,
        ...(organizations ? { organizations } : {}),
        ...(activeOrganization === undefined ? {} : { activeOrganization }),
        ...(board ? { board } : {}),
        ...(role ? { role } : {}),
      });
      await page.goto(path);
      if (theme === "dark") await switchToDark(page);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);
      await releaseHeld();
    });
  }
}
