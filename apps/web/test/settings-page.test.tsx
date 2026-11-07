import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "../src/components/settings-page.tsx";
import { asRole } from "./support/github-fixtures.ts";
import { renderWithQuery } from "./support/render.tsx";
import { polyfillRadix, procedures, resetWebMocks } from "./support/web-mocks.ts";

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

/** TK-88 (C7) : Réglages — h1 « Réglages », onglets en liens selon le rôle, l'écran de la section dessous. */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  procedures.installationList.mockResolvedValue([]);
  procedures.llmCredentialList.mockResolvedValue({ items: [] });
});

const tabs = () => screen.getByRole("navigation", { name: "Sections des réglages" });
const tabNames = () =>
  within(tabs())
    .getAllByRole("link")
    .map((link) => link.textContent);

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Réglages", () => {
  it.each(["members", "github", "ai"] as const)(
    "%s : un seul h1 « Réglages », l'onglet de la section est actif",
    async (section) => {
      asRole("owner");
      renderWithQuery(<SettingsPage section={section} />);
      expect(screen.getByRole("heading", { level: 1, name: "Réglages" })).toBeInTheDocument();
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      const label = { members: "Membres", github: "GitHub", ai: "IA" }[section];
      expect(within(tabs()).getByRole("link", { name: label })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(await screen.findByRole("heading", { level: 2, name: label })).toBeInTheDocument();
    },
  );

  it("les onglets sont des liens vers /settings/<section>", async () => {
    asRole("owner");
    renderWithQuery(<SettingsPage section="members" />);
    await within(tabs()).findByRole("link", { name: "IA" });
    expect(tabNames()).toEqual(["Membres", "GitHub", "IA"]);
    expect(within(tabs()).getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "/settings/github",
    );
    expect(within(tabs()).getByRole("link", { name: "IA" })).toHaveAttribute(
      "href",
      "/settings/ai",
    );
  });

  it.each(["owner", "admin"])("%s : Membres, GitHub et IA", async (role) => {
    asRole(role);
    renderWithQuery(<SettingsPage section="members" />);
    await within(tabs()).findByRole("link", { name: "GitHub" });
    expect(tabNames()).toEqual(["Membres", "GitHub", "IA"]);
  });

  it.each(["dev", "designer", "business"])(
    "%s : Membres seulement (plus la section courante)",
    async (role) => {
      asRole(role);
      renderWithQuery(<SettingsPage section="members" />);
      await screen.findByText("Membres", { selector: "h2" });
      expect(tabNames()).toEqual(["Membres"]);
    },
  );

  it("rôle inconnu : seule la section courante est proposée (fermé par défaut)", () => {
    procedures.organizationList.mockReturnValue(new Promise(() => undefined));
    renderWithQuery(<SettingsPage section="github" />);
    expect(tabNames()).toEqual(["GitHub"]);
  });

  it("un développeur sur /settings/github garde son onglet courant et lit le refus de l'écran", async () => {
    asRole("dev");
    renderWithQuery(<SettingsPage section="github" />);
    expect(
      await screen.findByText(/Cette page est réservée aux propriétaires/),
    ).toBeInTheDocument();
    expect(tabNames()).toEqual(["Membres", "GitHub"]);
    expect(procedures.installationList).not.toHaveBeenCalled();
  });

  it("transmet le résultat du retour GitHub à l'écran GitHub", async () => {
    asRole("owner");
    renderWithQuery(<SettingsPage section="github" githubResult="installed" />);
    expect(await screen.findByText("Application GitHub installée")).toBeInTheDocument();
  });
});
