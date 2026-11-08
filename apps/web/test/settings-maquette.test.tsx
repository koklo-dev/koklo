import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountPage } from "../src/components/account-page.tsx";
import { GeneralPage } from "../src/components/general-page.tsx";
import { MembersPage } from "../src/components/members-page.tsx";
import { SettingsPage } from "../src/components/settings-page.tsx";
import { asRole } from "./support/github-fixtures.ts";
import { seedMembers } from "./support/members-fixtures.ts";
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

/** TK-141 lot B : Réglages repris sur la planche 24 (packages/ui, aucun style local). */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  seedMembers();
  procedures.installationList.mockResolvedValue([]);
  procedures.aiProviderList.mockResolvedValue({ items: [] });
});

const icon = (el: Element, name: string) => el.querySelector(`svg[data-icon="${name}"]`);

describe("B1 : SecondaryNav", () => {
  it("groupes Organisation / Vous, icônes par section, compteur des membres", async () => {
    asRole("owner");
    renderWithQuery(<SettingsPage section="members" />);
    const nav = screen.getByRole("navigation", { name: "Sections des réglages" });
    expect(await within(nav).findByRole("group", { name: "Organisation" })).toBeInTheDocument();
    expect(within(nav).getByRole("group", { name: "Vous" })).toBeInTheDocument();
    const icons = {
      Général: "apartment",
      Membres: "group",
      "Fournisseurs d'IA": "key",
      GitHub: "link",
      "Mon compte": "person",
    };
    for (const [name, glyph] of Object.entries(icons)) {
      const link = await within(nav).findByRole("link", { name: new RegExp(`^${name}`) });
      expect(icon(link, glyph), name).not.toBeNull();
    }
    const members = within(nav).getByRole("link", { name: /^Membres/ });
    expect(await within(members).findByText("5")).toHaveAttribute("data-slot", "count-badge");
  });
});

describe("B2 : en-tête, RolePill et fil", () => {
  it("fil organisation / Réglages / section ; RolePill avec icône badge dans l'en-tête", async () => {
    asRole("owner");
    renderWithQuery(<SettingsPage section="members" />);
    const crumbs = await screen.findByRole("navigation", { name: "Fil d'Ariane" });
    expect(
      within(crumbs)
        .getAllByRole("listitem")
        .map((li) => li.textContent?.replace("/", "")),
    ).toEqual(["Atelier Lumière", "Réglages", "Membres"]);
    const pill = screen.getByTestId("settings-role");
    expect(pill).toHaveAttribute("data-slot", "pill");
    expect(pill).toHaveAttribute("data-role", "owner");
    expect(icon(pill, "badge")).not.toBeNull();
  });

  it("client : icône person, fil sur son nom", async () => {
    asRole("client");
    renderWithQuery(<SettingsPage section="account" />);
    const pill = await screen.findByTestId("settings-role");
    expect(pill).toHaveAttribute("data-role", "client");
    expect(icon(pill, "person")).not.toBeNull();
    const crumbs = await screen.findByRole("navigation", { name: "Fil d'Ariane" });
    expect(await within(crumbs).findByText("Awa Koné")).toBeInTheDocument();
  });

  it("lecture seule : InlineAlert neutre à icône lock, sans max-w", async () => {
    asRole("dev");
    renderWithQuery(<SettingsPage section="members" />);
    const note = (await screen.findByText(/^Lecture seule/)).closest('[data-slot="inline-alert"]');
    expect(note).toHaveAttribute("data-variant", "neutral");
    expect(icon(note as Element, "lock")).not.toBeNull();
    expect((note as Element).className).not.toMatch(/max-w/);
  });
});

describe("B3 : tableau des membres et matrice", () => {
  it("Table framed, Avatar 32 soft (client warning), RolePill par ligne", async () => {
    asRole("owner");
    renderWithQuery(<MembersPage />);
    const table = await screen.findByRole("table", { name: "Liste des membres" });
    expect(table.parentElement).toHaveClass("rounded-xl", "border");
    const awa = screen.getAllByText("Awa Koné")[0]?.closest("tr") as HTMLElement;
    const avatar = awa.querySelector('[data-slot="avatar"], [data-size="32"]') as HTMLElement;
    expect(avatar).toHaveAttribute("data-size", "32");
    expect(avatar).toHaveAttribute("data-tone", "soft");
    expect(within(awa).getByText("Propriétaire")).toHaveAttribute("data-slot", "pill");
    const nadia = screen.getByText("Nadia Client").closest("tr") as HTMLElement;
    expect(nadia.querySelector('[data-size="32"]')).toHaveAttribute("data-tone", "warning");
    expect(within(nadia).getByText("Client")).toHaveAttribute("data-role", "client");
    const dev = screen.getByText("Moussa Diallo").closest("tr") as HTMLElement;
    expect(within(dev).getByText("Développeur")).toHaveAttribute("data-role", "developer");
  });

  it("phrase sous le h2 Membres", async () => {
    asRole("owner");
    renderWithQuery(<MembersPage />);
    expect(
      await screen.findByText(
        /Les personnes de l'organisation et leur rôle\. Les clients n'y voient/,
      ),
    ).toBeInTheDocument();
  });

  it("matrice : Table framed, cellules YesNoCell centrées, résumé sur --surface", async () => {
    asRole("owner");
    renderWithQuery(<MembersPage />);
    const summary = await screen.findByText("Ce que chaque rôle peut faire");
    expect(summary).toHaveClass("bg-surface");
    const table = screen.getByRole("table", { name: "Ce que chaque rôle peut faire" });
    expect(table.parentElement).toHaveClass("border-t");
    const row = screen.getByText("Voir l'avancement et le reporting").closest("tr") as HTMLElement;
    const yes = within(row).getAllByRole("cell").slice(1);
    expect(yes).toHaveLength(6);
    for (const cell of yes) expect(cell).toHaveClass("text-center");
    expect(within(row).getAllByLabelText("Oui")).toHaveLength(6);
  });
});

describe("B4 / B5 : invitation et invitations en attente", () => {
  it("formulaire pleine largeur : section bordée, champs côte à côte, bouton person_add", async () => {
    asRole("owner");
    renderWithQuery(<MembersPage />);
    const section = await screen.findByRole("region", { name: "Inviter un membre" });
    expect(section.className).not.toMatch(/max-w/);
    const form = section.querySelector("form") as HTMLElement;
    expect(form).toHaveClass("flex-wrap", "items-end");
    expect(within(section).getByRole("heading", { name: "Inviter un membre" })).toHaveClass(
      "sr-only",
    );
    const button = within(section).getByRole("button", { name: "Inviter" });
    expect(icon(button, "person_add")).not.toBeNull();
  });

  it("invitation : icône schedule_send, RolePill hors de la ligne e-mail, Renvoyer sm, Annuler ghost", async () => {
    asRole("owner");
    renderWithQuery(<MembersPage />);
    const row = (await screen.findByText("nina@example.com")).closest("li") as HTMLElement;
    expect(icon(row, "schedule_send")).not.toBeNull();
    const pill = within(row).getByText("Designer");
    expect(pill).toHaveAttribute("data-slot", "pill");
    expect(screen.getByText("nina@example.com").parentElement).not.toContainElement(pill);
    expect(screen.getByText("nina@example.com")).toHaveClass("font-semibold");
    const resend = within(row).getByRole("button", { name: /Renvoyer/ });
    expect(resend).toHaveClass("border-input", "h-8");
    expect(within(row).getByRole("button", { name: /Annuler/ })).toHaveClass("hover:bg-accent");
  });
});

describe("B6 : Général et Mon compte", () => {
  it("Général : tuile agent 56, formulaire en cadre avant les StatCard", async () => {
    asRole("owner");
    renderWithQuery(<GeneralPage />);
    const name = await screen.findByLabelText("Nom de l'organisation");
    const frame = name.closest('[data-slot="card"]') as HTMLElement;
    expect(frame).not.toBeNull();
    const tile = frame.querySelector('[data-shape="tile"]') as HTMLElement;
    expect(tile).toHaveAttribute("data-size", "56");
    expect(tile).toHaveAttribute("data-tone", "agent");
    const stats = document.querySelectorAll('[data-slot="stat-card"]');
    expect(stats).toHaveLength(3);
    expect(
      frame.compareDocumentPosition(stats[0] as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("Mon compte : cadre Nom + e-mail, thème en SegmentedControl radio, préférences en SwitchRow", async () => {
    asRole("owner");
    renderWithQuery(<AccountPage />);
    const group = await screen.findByRole("radiogroup", { name: "Thème" });
    expect(group).toHaveAttribute("data-slot", "segmented-control");
    const frame = screen.getByLabelText("Nom").closest('[data-slot="card"]') as HTMLElement;
    expect(within(frame).getByLabelText("Adresse e-mail")).toBeInTheDocument();
    expect(frame).toContainElement(group);
    const toggle = await screen.findByRole("switch", { name: "Résumé de la semaine" });
    expect(toggle.closest('[data-slot="switch-row"]')).not.toBeNull();
    expect(toggle.closest('[data-slot="card"]')).not.toBeNull();
  });
});

describe("B7 : titres de section", () => {
  it.each([
    ["Membres", <MembersPage key="m" />],
    ["Organisation", <GeneralPage key="g" />],
    ["Mon compte", <AccountPage key="a" />],
  ])("h2 %s en text-settings-title", async (name, page) => {
    asRole("owner");
    renderWithQuery(page);
    expect(await screen.findByRole("heading", { level: 2, name })).toHaveClass(
      "text-settings-title",
    );
  });

  it("textes de la planche 24 pour Général et Mon compte", async () => {
    asRole("owner");
    renderWithQuery(<GeneralPage />);
    expect(
      await screen.findByText(
        /Un freelance a en général une organisation ; une agence peut en avoir plusieurs/,
      ),
    ).toBeInTheDocument();
  });
});

describe("TK-141 correction 1 : écarts de la revue visuelle", () => {
  it("lecture seule : le bandeau suit le h2 et sa phrase, espacement 20", async () => {
    asRole("dev");
    renderWithQuery(<SettingsPage section="members" />);
    const note = (await screen.findByText(/^Lecture seule/)).closest(
      '[data-slot="inline-alert"]',
    ) as Element;
    const h2 = screen.getByRole("heading", { level: 2, name: "Membres" });
    expect(h2.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("members-page")).toHaveClass("gap-5");
  });

  it("en-tête : pastille pleine (soft) pour le développeur, ambre pour le client", async () => {
    asRole("dev");
    const first = renderWithQuery(<SettingsPage section="members" />);
    expect(await screen.findByTestId("settings-role")).toHaveClass("bg-secondary");
    first.unmount();
    asRole("client");
    renderWithQuery(<SettingsPage section="account" />);
    expect(await screen.findByTestId("settings-role")).toHaveClass("bg-status-pending");
  });

  it("invitation : exemple d'adresse et champs de 40 px ; colonne Actions masquée visuellement", async () => {
    asRole("owner");
    renderWithQuery(<MembersPage />);
    const email = await screen.findByRole("textbox", { name: "Adresse e-mail" });
    expect(email).toHaveAttribute("placeholder", "prenom@exemple.fr");
    expect(email).toHaveClass("md:h-10");
    expect(await screen.findByText("Actions")).toHaveClass("sr-only");
  });

  it("Mon compte : champs alignés (aucune aide sous l'adresse), libellés de la planche", async () => {
    asRole("owner");
    renderWithQuery(<AccountPage />);
    expect(
      await screen.findByRole("switch", { name: "Une pull request attend ma revue" }),
    ).toBeVisible();
    expect(screen.queryByText("Cette adresse sert à vous connecter")).toBeNull();
  });
});
