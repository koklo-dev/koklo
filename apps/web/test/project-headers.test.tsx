import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { FeaturesHeader } from "../src/components/features-header.tsx";
import { FramingHeader } from "../src/components/framing-header.tsx";
import { readFeaturesTab } from "../src/lib/features-tab.ts";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

/** TK-88 (C5, C10) : ProjectHeader sur Cahier fonctionnel et Assistant de cadrage ; plus de fil d'Ariane v1. */
const ID = "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01";
const HEAD = {
  commitSha: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
  indexedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
  counts: { features: 12 },
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("FeaturesHeader (Spec · Fonctionnel)", () => {
  const renderHeader = (over: Partial<Parameters<typeof FeaturesHeader>[0]> = {}) =>
    render(
      <FeaturesHeader
        projectId={ID}
        name="Portail"
        titleRef={createRef()}
        onCreate={() => undefined}
        tab="features"
        head={HEAD}
        team
        {...over}
      />,
    );

  it("ligne 1 : Portail / Spec / Fonctionnel, le nom du projet est un lien", () => {
    renderHeader();
    const location = screen.getByRole("navigation", { name: "Emplacement" });
    expect(within(location).getByRole("link", { name: "Portail" })).toHaveAttribute(
      "href",
      `/projects/${ID}`,
    );
    expect(location).toHaveTextContent("Spec");
    expect(within(location).getByText("Fonctionnel")).toHaveAttribute("aria-current", "page");
  });

  it("h1 « Cahier fonctionnel » et résumé « 12 fonctionnalités » pour l'équipe", () => {
    renderHeader();
    expect(
      screen.getByRole("heading", { level: 1, name: "Cahier fonctionnel" }),
    ).toBeInTheDocument();
    expect(screen.getByText("12 fonctionnalités")).toBeInTheDocument();
  });

  it("équipe : SHA de 7 caractères et âge de la spec", () => {
    renderHeader();
    expect(screen.getByText("a1b2c3d")).toHaveClass("font-mono");
    expect(screen.getByText(/spec à jour il y a 3 minutes/)).toBeInTheDocument();
  });

  it("client : ni SHA ni résumé", () => {
    renderHeader({ team: false });
    expect(screen.queryByText("a1b2c3d")).toBeNull();
    expect(screen.queryByText(/fonctionnalités$/)).toBeNull();
    expect(screen.queryByText(/spec à jour/)).toBeNull();
  });

  it("sans lecture de la spec : ni SHA ni résumé, sans trou", () => {
    renderHeader({ head: undefined });
    expect(screen.queryByText(/spec à jour/)).toBeNull();
    expect(screen.queryByText(/fonctionnalités$/)).toBeNull();
  });

  it("onglets en liens : Fonctionnalités (avec compteur), Règles métier, Rôles et permissions, Parcours", () => {
    renderHeader();
    const tabs = screen.getByRole("navigation", { name: "Onglets du cahier fonctionnel" });
    const links = within(tabs).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Fonctionnalités12",
      "Règles métier",
      "Rôles et permissions",
      "Parcours",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      `/projects/${ID}/spec/functional?tab=features`,
      `/projects/${ID}/spec/functional?tab=rules`,
      `/projects/${ID}/spec/functional?tab=roles`,
      `/projects/${ID}/spec/functional?tab=flows`,
    ]);
    expect(links[0]).toHaveAttribute("aria-current", "page");
  });

  it("l'onglet actif suit la prop tab", () => {
    renderHeader({ tab: "roles" });
    const tabs = screen.getByRole("navigation", { name: "Onglets du cahier fonctionnel" });
    expect(within(tabs).getByRole("link", { name: "Rôles et permissions" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(tabs).getByRole("link", { name: /Fonctionnalités/ })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("actions de l'équipe : « Cadrer avec l'IA » (secondaire) puis « Nouvelle fonctionnalité » (principale)", () => {
    renderHeader();
    expect(screen.getByRole("link", { name: /Cadrer avec l'IA/ })).toHaveAttribute(
      "href",
      `/projects/${ID}/framing`,
    );
    expect(screen.getByRole("button", { name: /Nouvelle fonctionnalité/ })).toBeInTheDocument();
  });

  it("sans droit d'écriture : aucune action", () => {
    renderHeader({ onCreate: undefined });
    expect(screen.queryByRole("button", { name: /Nouvelle fonctionnalité/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Cadrer/ })).toBeNull();
  });

  it("le titre reçoit la référence de focus", () => {
    const ref = createRef<HTMLHeadingElement>();
    renderHeader({ titleRef: ref });
    expect(ref.current).toBe(screen.getByRole("heading", { level: 1 }));
  });

  it("aucun fil d'Ariane v1", () => {
    renderHeader();
    expect(screen.queryByRole("navigation", { name: /fil d'ariane|breadcrumb/i })).toBeNull();
    expect(screen.queryByText("Koklo")).toBeNull();
  });
});

describe("readFeaturesTab", () => {
  it.each([
    ["", "features"],
    ["?tab=features", "features"],
    ["?tab=rules", "rules"],
    ["?tab=roles&q=x", "roles"],
    ["?tab=flows", "flows"],
    ["?tab=inconnu", "features"],
    ["?tab=", "features"],
    ["?tab=Rules", "features"],
  ])("%s → %s", (search, expected) => {
    expect(readFeaturesTab(search)).toBe(expected);
  });
});

describe("FramingHeader (Assistant de cadrage)", () => {
  it("ProjectHeader : Portail / Assistant de cadrage, h1 sans onglets ni action", () => {
    render(<FramingHeader projectId={ID} name="Portail" />);
    const location = screen.getByRole("navigation", { name: "Emplacement" });
    expect(within(location).getByRole("link", { name: "Portail" })).toHaveAttribute(
      "href",
      `/projects/${ID}`,
    );
    expect(within(location).getByText("Assistant de cadrage")).toHaveAttribute(
      "aria-current",
      "page",
    );
    const title = screen.getByRole("heading", { level: 1, name: "Assistant de cadrage" });
    expect(title).toHaveAttribute("id");
    expect(screen.queryByRole("navigation", { name: /onglets/i })).toBeNull();
  });

  it("garde la phrase d'aide et plus de fil d'Ariane v1", () => {
    render(<FramingHeader projectId={ID} name="Portail" />);
    expect(screen.queryByRole("navigation", { name: /fil d'ariane|breadcrumb/i })).toBeNull();
    expect(screen.queryByText("Cadrage")).toBeNull();
  });
});

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

describe("retraits v1 (C10)", () => {
  const SRC = resolve(import.meta.dirname, "../src");

  it("aucun fil d'Ariane v1 dans apps/web/src", () => {
    const offenders = sources(SRC).filter((file) =>
      /Breadcrumb(?:List|Item|Link|Page|Separator)?\b/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it.each([
    "components/app-frame.tsx",
    "components/nav-main.tsx",
    "components/nav-projects.tsx",
    "components/projects-frame.tsx",
    "components/team-switcher.tsx",
  ])("%s n'existe plus", (file) => {
    expect(() => statSync(join(SRC, file))).toThrow();
  });

  it("aucune entrée de navigation Kanban, Membres, GitHub ou IA dans la barre", () => {
    const sidebar = sources(join(SRC, "components"))
      .filter((file) => /sidebar/.test(file))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(sidebar).not.toMatch(/url: "\/(kanban|members|github)"|"\/settings\/ai"/);
    expect(sidebar).not.toMatch(/useSidebar|SidebarProvider/);
  });

  it("plus aucun lien interne vers les anciens chemins /github, /members, /projects/<id>/features", () => {
    const offenders = sources(SRC)
      .filter((file) => !/proxy\.ts$|legacy-routes\.ts$|auth-guard\.ts$/.test(file))
      .filter((file) =>
        /href="\/github"|href="\/members"|`\/projects\/\$\{[^}]+\}\/features/.test(
          readFileSync(file, "utf8"),
        ),
      );
    expect(offenders).toEqual([]);
  });
});
