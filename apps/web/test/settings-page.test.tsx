import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "../src/components/settings-page.tsx";
import type { SettingsSection } from "../src/lib/shell-routes.ts";
import { asRole } from "./support/github-fixtures.ts";
import { renderWithQuery } from "./support/render.tsx";
import {
  navigations,
  orgSummary,
  polyfillRadix,
  procedures,
  resetWebMocks,
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

/** TK-97 lot B : cadre de Réglages (h1, pastille, résumé, navigation par rôle, bandeau de lecture seule). */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  procedures.installationList.mockResolvedValue([]);
  procedures.aiProviderList.mockResolvedValue({ items: [] });
});

const nav = () => screen.getByRole("navigation", { name: "Sections des réglages" });
const linkNames = () =>
  within(nav())
    .getAllByRole("link")
    .map((link) => link.textContent?.replace(/\d+$/, "").trim());
const LOCK =
  "Lecture seule : seuls les propriétaires et les administrateurs modifient cette section.";

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Réglages : cadre", () => {
  it.each([
    ["general", "Général"],
    ["members", "Membres"],
    ["account", "Mon compte"],
  ] as const)("%s : un seul h1, lien actif, h2 de la section", async (section, label) => {
    asRole("owner");
    renderWithQuery(<SettingsPage section={section} />);
    expect(screen.getByRole("heading", { level: 1, name: "Réglages" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(await screen.findByRole("heading", { level: 2, name: label })).toBeInTheDocument();
    const current = within(nav()).getByRole("link", { current: "page" });
    expect(current).toHaveTextContent(label);
  });

  it("propriétaire : cinq liens vers /settings/<section>, en deux groupes", async () => {
    asRole("owner");
    renderWithQuery(<SettingsPage section="members" />);
    await within(nav()).findByRole("link", { name: "GitHub" });
    expect(linkNames()).toEqual([
      "Général",
      "Membres",
      "Fournisseurs d'IA",
      "GitHub",
      "Mon compte",
    ]);
    expect(within(nav()).getByRole("link", { name: "Général" })).toHaveAttribute(
      "href",
      "/settings/general",
    );
    expect(within(nav()).getByRole("link", { name: "Mon compte" })).toHaveAttribute(
      "href",
      "/settings/account",
    );
    expect(within(nav()).getByText("Organisation")).toBeInTheDocument();
    expect(within(nav()).getByText("Vous")).toBeInTheDocument();
    expect(nav().className).toContain("md:w-60");
  });

  it("Membres porte le nombre de membres de org.get", async () => {
    asRole("owner");
    procedures.orgGet.mockResolvedValue(orgSummary({ memberCount: 7 }));
    renderWithQuery(<SettingsPage section="members" />);
    expect(await within(nav()).findByRole("link", { name: /^Membres\s*7$/ })).toBeInTheDocument();
  });

  it.each([
    ["admin", ["Général", "Membres", "Fournisseurs d'IA", "GitHub", "Mon compte"]],
    ["dev", ["Membres", "Mon compte"]],
    ["designer", ["Membres", "Mon compte"]],
    ["business", ["Membres", "Mon compte"]],
    ["client", ["Mon compte"]],
  ])("%s : liens %j", async (role, expected) => {
    asRole(role);
    renderWithQuery(<SettingsPage section={role === "client" ? "account" : "members"} />);
    await screen.findByRole("heading", {
      level: 2,
      name: role === "client" ? "Mon compte" : "Membres",
    });
    await waitFor(() => expect(linkNames()).toEqual(expected));
  });

  it("résumé : organisation, projets et membres ; pastille du rôle", async () => {
    asRole("owner");
    renderWithQuery(<SettingsPage section="members" />);
    expect(await screen.findByText("Atelier Lumière · 3 projets · 5 membres")).toBeInTheDocument();
    expect(screen.getByTestId("settings-role")).toHaveTextContent("Propriétaire");
  });

  it("résumé au singulier", async () => {
    asRole("owner");
    procedures.orgGet.mockResolvedValue(orgSummary({ projectCount: 1, memberCount: 1 }));
    renderWithQuery(<SettingsPage section="members" />);
    expect(await screen.findByText("Atelier Lumière · 1 projet · 1 membre")).toBeInTheDocument();
  });

  it("client : phrase dédiée, org.get jamais appelé", async () => {
    asRole("client");
    renderWithQuery(<SettingsPage section="account" />);
    expect(
      await screen.findByText("Vous voyez seulement les réglages de votre compte."),
    ).toBeInTheDocument();
    expect(procedures.orgGet).not.toHaveBeenCalled();
    expect(screen.getByTestId("settings-role")).toHaveTextContent("Client");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Réglages : section interdite et lecture seule", () => {
  it.each([
    ["dev", "github", "/settings/members"],
    ["designer", "ai", "/settings/members"],
    ["business", "general", "/settings/members"],
    ["client", "members", "/settings/account"],
    ["client", "github", "/settings/account"],
  ] as const)("%s sur /settings/%s : redirigé vers %s", async (role, section, target) => {
    asRole(role);
    renderWithQuery(<SettingsPage section={section} />);
    await waitFor(() => expect(navigations()).toContain(target));
    expect(procedures.installationList).not.toHaveBeenCalled();
    expect(procedures.aiProviderList).not.toHaveBeenCalled();
  });

  it("rôle inconnu : aucune redirection tant que organization.list n'a pas répondu", async () => {
    procedures.organizationList.mockReturnValue(new Promise(() => undefined));
    renderWithQuery(<SettingsPage section={"github" as SettingsSection} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(navigations()).toEqual([]);
    expect(procedures.installationList).not.toHaveBeenCalled();
  });

  it("une section permise n'est jamais redirigée", async () => {
    asRole("owner");
    renderWithQuery(<SettingsPage section="github" />);
    expect(await screen.findByRole("heading", { level: 2, name: "GitHub" })).toBeInTheDocument();
    expect(navigations()).toEqual([]);
  });

  it.each(["dev", "designer", "business"])(
    "%s sur Membres : bandeau de lecture seule et aucune action",
    async (role) => {
      asRole(role);
      renderWithQuery(<SettingsPage section="members" />);
      expect(await screen.findByText(LOCK)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Inviter/ })).toBeNull();
    },
  );

  it.each(["owner", "admin"])("%s : pas de bandeau de lecture seule", async (role) => {
    asRole(role);
    renderWithQuery(<SettingsPage section="members" />);
    await screen.findByRole("heading", { level: 2, name: "Membres" });
    expect(screen.queryByText(LOCK)).toBeNull();
  });

  it("transmet le résultat du retour GitHub à l'écran GitHub", async () => {
    asRole("owner");
    renderWithQuery(<SettingsPage section="github" githubResult="installed" />);
    expect(await screen.findByText("Application GitHub installée")).toBeInTheDocument();
  });
});
