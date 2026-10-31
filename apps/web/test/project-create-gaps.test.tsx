import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProject,
  openReadySheet,
  rejectWith,
  renderProjects,
  setupCreation,
} from "./support/project-create.tsx";
import {
  getSession,
  navigations,
  polyfillRadix,
  procedures,
  resetWebMocks,
  sessionWith,
} from "./support/web-mocks.ts";

vi.mock("next/navigation", async () => {
  const m = await import("./support/web-mocks.ts");
  return { useRouter: () => m.router, usePathname: () => m.pathname.current };
});
vi.mock("../src/lib/auth-client.ts", async () => ({
  authClient: (await import("./support/web-mocks.ts")).authClient,
}));
vi.mock("../src/lib/orpc.ts", async () => ({
  orpc: (await import("./support/web-mocks.ts")).orpc,
}));

const src = join(import.meta.dirname, "../src");

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  setupCreation();
});

describe("Panneau de création — UNAUTHORIZED à l'étape 2", () => {
  it("session perdue : redirige vers /login", async () => {
    procedures.repoCreateSpec.mockImplementation(rejectWith("UNAUTHORIZED"));
    renderProjects();
    const sheet = await openReadySheet();
    getSession.mockResolvedValue({ data: null, error: null });
    await createProject(sheet, "Alpha");
    await waitFor(() => expect(navigations()).toContain("/login"));
  });

  it("session présente : jamais /login (G1)", async () => {
    procedures.repoCreateSpec.mockImplementation(rejectWith("UNAUTHORIZED"));
    renderProjects();
    const sheet = await openReadySheet();
    getSession.mockResolvedValue(sessionWith(null));
    await createProject(sheet, "Alpha");
    await waitFor(() => expect(getSession).toHaveBeenCalled());
    expect(navigations()).not.toContain("/login");
  });
});

describe("Panneau de création — clic hors panneau", () => {
  it("avant tout envoi : ferme le panneau sans appel", async () => {
    renderProjects();
    const sheet = await openReadySheet();
    await userEvent.click(sheet.previousElementSibling as HTMLElement);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(procedures.projectCreate).not.toHaveBeenCalled();
  });

  it("pendant un appel en vol : sans effet", async () => {
    procedures.repoCreateSpec.mockReturnValue(new Promise(() => undefined));
    renderProjects();
    const sheet = await openReadySheet();
    await createProject(sheet, "Alpha");
    await waitFor(() => expect(procedures.repoCreateSpec).toHaveBeenCalled());
    await userEvent.click(sheet.previousElementSibling as HTMLElement);
    expect(within(document.body).getByRole("dialog")).toBeInTheDocument();
  });
});

describe("Panneau de création — mouvement réduit (DESIGN.md règle 12)", () => {
  const FLOW = [
    "components/project-create-sheet.tsx",
    "components/project-create-flow.tsx",
    "components/project-create-steps.tsx",
    "components/project-create-actions.tsx",
    "components/github-account-field.tsx",
    "components/spec-repo-failure.tsx",
    "components/spec-repo-link-form.tsx",
    "components/spec-repo-resume-notice.tsx",
  ];

  it.each(FLOW)("%s : aucune animation ni transition hors motion-safe:", (file) => {
    const code = readFileSync(join(src, file), "utf8");
    expect(code).not.toMatch(/(?<!motion-safe:)\banimate-[a-z]/);
    expect(code).not.toMatch(/(?<!motion-safe:)\btransition(?:-[a-z]+)?\b/);
  });

  it("le panneau et le chargement des comptes ne s'animent que sous motion-safe:", () => {
    const sheet = readFileSync(join(src, "../../../packages/ui/src/components/sheet.tsx"), "utf8");
    expect(sheet).toContain("motion-safe:animate-content-in");
    expect(sheet).toContain("motion-reduce:transition-none");
    expect(readFileSync(join(src, "components/loading-status.tsx"), "utf8")).toContain(
      "motion-safe:animate-pulse",
    );
  });

  it("la feuille de style neutralise animations et transitions sous prefers-reduced-motion", () => {
    const css = readFileSync(join(src, "app/globals.css"), "utf8");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toMatch(/animation:\s*none/);
    expect(css).toMatch(/transition:\s*none/);
  });
});
