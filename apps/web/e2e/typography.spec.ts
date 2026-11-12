import { expect, test } from "@playwright/test";
import { setScenario } from "./support/helpers.ts";
import { FEATURE_PROJECT_ID } from "./support/stub-features.ts";

/**
 * TK-87 CA5 (cas 5.3 ; passation 01 §0.2, DESIGN.md v2 §3) : sur chaque écran existant, le h1 calculé vaut
 * 24 px, graisse 600, interlettrage −0,02 em. Plus aucun h1 à 30 px.
 */
type Screen = {
  name: string;
  path: string;
  session: boolean;
  activeOrganization?: boolean;
  organizations?: "none" | "one" | "many";
  invitation?: "ready";
};

const SCREENS: readonly Screen[] = [
  { name: "login", path: "/login", session: false },
  { name: "projects", path: "/projects", session: true },
  { name: "kanban", path: `/projects/${FEATURE_PROJECT_ID}/tickets`, session: true },
  { name: "members", path: "/settings/members", session: true },
  { name: "github", path: "/settings/github", session: true },
  { name: "settings/ai", path: "/settings/ai", session: true },
  {
    name: "organizations",
    path: "/organizations",
    session: true,
    organizations: "many",
    activeOrganization: false,
  },
  {
    name: "accept-invitation",
    path: "/accept-invitation/01900000-0000-7000-8000-0000000000d1",
    session: true,
    activeOrganization: false,
    invitation: "ready",
  },
  { name: "features", path: `/projects/${FEATURE_PROJECT_ID}/spec/functional`, session: true },
];

for (const { name, path, session, activeOrganization, organizations, invitation } of SCREENS) {
  test(`h1 de ${name} : 24 px, 600, −0,02 em (échelle v2)`, async ({ page }) => {
    await setScenario({
      session,
      projects: "data",
      ...(organizations ? { organizations } : {}),
      ...(activeOrganization === undefined ? {} : { activeOrganization }),
      ...(invitation ? { invitation } : {}),
    });
    await page.goto(path);
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    const style = await h1.evaluate((el) => {
      const s = getComputedStyle(el);
      return { size: s.fontSize, weight: s.fontWeight, tracking: s.letterSpacing };
    });
    expect(style.size).toBe("24px");
    expect(style.weight).toBe("600");
    // −0,02 em à 24 px = −0,48 px
    expect(Number.parseFloat(style.tracking)).toBeCloseTo(-0.48, 2);
  });
}
