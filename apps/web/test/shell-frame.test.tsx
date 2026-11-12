import { DELIVERABLE_KEYS } from "@koklo/contract";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShellFrame } from "../src/components/shell-frame.tsx";
import { asRole } from "./support/github-fixtures.ts";
import {
  PROJECT_ID,
  pathname,
  polyfillRadix,
  procedures,
  projectShell,
  resetWebMocks,
  specDeliverables,
} from "./support/web-mocks.ts";
import { DESKTOP, MOBILE, setViewport } from "./viewport.ts";

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

/** TK-88 (C6, C8, C9, C12) : la coquille branchée sur project.shell, project.recent et organization.list. */
const SPEC = `/projects/${PROJECT_ID}/spec/functional`;
const OTHER_ID = "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b02";

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  setViewport(DESKTOP);
  localStorage.clear();
});

function renderFrame(path: string) {
  pathname.current = path;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <ShellFrame>
        <h1>Contenu</h1>
      </ShellFrame>
    </QueryClientProvider>,
  );
  return { ...view, client };
}

const nav = () => screen.getByRole("navigation", { name: "Navigation principale" });
const linkHrefs = () =>
  within(nav())
    .getAllByRole("link")
    .map((link) => [link.textContent?.trim(), link.getAttribute("href")]);

const recentOf = (id: string, name: string, initials: string, colorKey = 1) => ({
  id,
  name,
  initials,
  colorKey,
  visitedAt: "2026-11-07T10:00:00.000Z",
});

/** TK-93 lot B (B306, maquette 08 l.37-42) : groupe « Récents » de la barre, hors d'un projet. */
describe("groupe Récents de la barre", () => {
  const RECENT = [
    recentOf(PROJECT_ID, "Portail de réservation", "PR", 1),
    recentOf(OTHER_ID, "Plateforme de formation", "PF", 2),
    recentOf("7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b03", "Portail partenaires", "PP", 3),
    recentOf("7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b04", "Application caisse", "AC", 4),
  ];

  it("hors projet : trois projets au plus, plus récent d'abord, au-dessus d'Organisation", async () => {
    procedures.projectRecent.mockResolvedValue(RECENT);
    renderFrame("/projects");
    const group = await within(nav()).findByRole("group", { name: "Récents" });
    const links = within(group).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "PRPortail de réservation",
      "PFPlateforme de formation",
      "PPPortail partenaires",
    ]);
    expect(links[0]).toHaveAttribute("href", `/projects/${PROJECT_ID}`);
    expect(links[0]).toHaveAccessibleName("Portail de réservation");
    const organisation = within(nav()).getByRole("group", { name: "Organisation" });
    expect(
      group.compareDocumentPosition(organisation) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("les tuiles sont décoratives (initiales cachées aux lecteurs d'écran)", async () => {
    procedures.projectRecent.mockResolvedValue(RECENT);
    renderFrame("/projects");
    const group = await within(nav()).findByRole("group", { name: "Récents" });
    expect(group.querySelectorAll("[data-slot='project-tile'][aria-hidden='true']")).toHaveLength(
      3,
    );
  });

  it("dans un projet : pas de groupe Récents (la carte du projet porte déjà le menu)", async () => {
    procedures.projectRecent.mockResolvedValue(RECENT);
    renderFrame(SPEC);
    await within(nav()).findByRole("link", { name: "Réglages" });
    expect(within(nav()).queryByRole("group", { name: "Récents" })).toBeNull();
  });

  it("aucun projet récent, ou lecture en échec : pas de groupe", async () => {
    renderFrame("/projects");
    await within(nav()).findByRole("link", { name: "Réglages" });
    expect(within(nav()).queryByRole("group", { name: "Récents" })).toBeNull();
  });
});

describe("page d'organisation (/projects)", () => {
  it("n'a ni groupe Projet, ni SPEC, ni appel à project.shell ou project.visit", async () => {
    renderFrame("/projects");
    await within(nav()).findByRole("link", { name: "Tous les projets" });
    expect(within(nav()).queryByRole("group", { name: "Spec" })).toBeNull();
    expect(within(nav()).queryByText("Vue d'ensemble")).toBeNull();
    expect(procedures.projectShell).not.toHaveBeenCalled();
    expect(procedures.projectVisit).not.toHaveBeenCalled();
  });

  it("n'a plus Kanban, Membres, GitHub, IA, libellé « Navigation » ni liste de projets (C8)", async () => {
    procedures.projectList.mockResolvedValue([{ id: PROJECT_ID, name: "Atelier Lumière" }]);
    renderFrame("/projects");
    await within(nav()).findByRole("link", { name: "Réglages" });
    for (const name of ["Kanban", "Membres", "GitHub", "IA", "Projets"]) {
      expect(within(nav()).queryByRole("link", { name })).toBeNull();
    }
    expect(screen.queryByText("Navigation")).toBeNull();
    expect(procedures.projectList).not.toHaveBeenCalled();
  });

  it("Organisation : Tous les projets et Réglages (vers /settings/members)", async () => {
    asRole("owner");
    renderFrame("/projects");
    await within(nav()).findByRole("link", { name: "Réglages" });
    await waitFor(() =>
      expect(linkHrefs()).toEqual(
        expect.arrayContaining([
          ["Tous les projets", "/projects"],
          ["Réglages", "/settings/members"],
        ]),
      ),
    );
    expect(within(nav()).getByRole("link", { name: "Tous les projets" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("le sélecteur d'organisation montre le nom et le rôle", async () => {
    asRole("owner");
    renderFrame("/projects");
    const trigger = await within(nav()).findByRole("button", { name: /Atelier Lumière/ });
    expect(trigger).toHaveTextContent("Organisation · Propriétaire");
  });

  it("le champ Rechercher porte le raccourci de la plateforme", async () => {
    renderFrame("/projects");
    const search = await within(nav()).findByRole("button", { name: /Rechercher/ });
    expect(search).toHaveTextContent(/Ctrl K|⌘K/);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("page de projet", () => {
  it("lit project.shell du projet de l'URL, une seule fois", async () => {
    renderFrame(SPEC);
    await within(nav()).findByRole("group", { name: "Spec" });
    expect(procedures.projectShell).toHaveBeenCalledTimes(1);
    expect(procedures.projectShell).toHaveBeenCalledWith({ projectId: PROJECT_ID });
  });

  it("Projet : Vue d'ensemble, Idée, SPEC, Tickets, dans l'ordre (plus d'Assistant de cadrage, TK-102)", async () => {
    asRole("owner");
    renderFrame(SPEC);
    await within(nav()).findByRole("link", { name: /^Données/ });
    expect(linkHrefs()).toEqual([
      ["Vue d'ensemble", `/projects/${PROJECT_ID}`],
      ["Idée", `/projects/${PROJECT_ID}/idea`],
      ["Fonctionnel, Prêt", `/projects/${PROJECT_ID}/spec/functional`],
      ["Données, Prêt", `/projects/${PROJECT_ID}/spec/data`],
      ["Design, Prêt", `/projects/${PROJECT_ID}/spec/design`],
      ["Tickets12", `/projects/${PROJECT_ID}/tickets`],
      ["Tous les projets", "/projects"],
      ["Réglages", "/settings/members"],
    ]);
  });

  it("lit spec.deliverables du projet de l'URL, une seule fois (barre et compteur SPEC)", async () => {
    renderFrame(SPEC);
    await within(nav()).findByRole("link", { name: /^Données/ });
    expect(procedures.specDeliverables).toHaveBeenCalledTimes(1);
    expect(procedures.specDeliverables).toHaveBeenCalledWith({ projectId: PROJECT_ID });
  });

  it("le compteur et les liens viennent de spec.deliverables, pas de project.shell", async () => {
    procedures.projectShell.mockResolvedValue(
      projectShell({
        validatedCount: 6,
        deliverables: DELIVERABLE_KEYS.map((key) => ({ key, available: true, after: null })),
      }),
    );
    procedures.specDeliverables.mockResolvedValue(
      specDeliverables({
        validated: ["functional", "data"],
        open: new Set(["functional", "data"]),
      }),
    );
    renderFrame(SPEC);
    const group = await within(nav()).findByRole("group", { name: "Spec" });
    await within(group).findByRole("link", { name: /^Données/ });
    expect(group).toHaveTextContent("2/7");
    expect(
      within(group)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Fonctionnel", "Données"]);
  });

  it("SPEC : compteur 0/7, livrables non disponibles en boutons aria-disabled", async () => {
    renderFrame(SPEC);
    const group = await within(nav()).findByRole("group", { name: "Spec" });
    expect(group).toHaveTextContent("0/7");
    const locked = within(group).getByRole("button", {
      name: "Architecture, disponible après les données",
    });
    expect(locked).toHaveAttribute("aria-disabled", "true");
    expect(within(group).getByRole("link", { name: /^Fonctionnel/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("carte projet : nom et fil de phase de project.shell", async () => {
    renderFrame(SPEC);
    const card = await within(nav()).findByRole("button", { name: /Portail de réservation/ });
    expect(card).toHaveTextContent("Cadrage");
  });

  it("Tickets : pastille du sprint actif, absente sans sprint actif (B84)", async () => {
    renderFrame(SPEC);
    expect(await within(nav()).findByRole("link", { name: /Tickets/ })).toHaveTextContent("12");
    document.body.innerHTML = "";
    procedures.projectShell.mockResolvedValue(projectShell({ ticketCount: null }));
    renderFrame(`/projects/${PROJECT_ID}/tickets`);
    const tickets = await within(nav()).findByRole("link", { name: "Tickets" });
    expect(tickets).toHaveAttribute("aria-current", "page");
    expect(tickets).not.toHaveTextContent(/\d/);
  });

  it("project.visit est appelé une fois à l'ouverture, pas à chaque navigation interne (C6, H2)", async () => {
    const { rerender, client } = renderFrame(SPEC);
    await waitFor(() => expect(procedures.projectVisit).toHaveBeenCalledTimes(1));
    expect(procedures.projectVisit.mock.calls[0]?.[0]).toEqual({ projectId: PROJECT_ID });
    pathname.current = `/projects/${PROJECT_ID}/tickets`;
    rerender(
      <QueryClientProvider client={client}>
        <ShellFrame>
          <h1>Contenu</h1>
        </ShellFrame>
      </QueryClientProvider>,
    );
    await within(nav()).findByRole("link", { name: /Tickets/ });
    expect(procedures.projectVisit).toHaveBeenCalledTimes(1);
  });

  it("un échec de project.visit est silencieux", async () => {
    procedures.projectVisit.mockRejectedValue(new Error("hors ligne"));
    renderFrame(SPEC);
    await waitFor(() => expect(procedures.projectVisit).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("un identifiant qui n'est pas un uuid n'appelle ni project.shell, ni spec.deliverables, ni project.visit", async () => {
    renderFrame("/projects/pas-un-uuid/spec/functional");
    await within(nav()).findByRole("link", { name: "Tous les projets" });
    expect(procedures.projectShell).not.toHaveBeenCalled();
    expect(procedures.specDeliverables).not.toHaveBeenCalled();
    expect(procedures.projectVisit).not.toHaveBeenCalled();
  });

  it("project.shell en échec : la navigation reste et SPEC garde ses livrables (ils ne viennent plus de la coquille)", async () => {
    procedures.projectShell.mockRejectedValue(new Error("500"));
    renderFrame(SPEC);
    const group = await within(nav()).findByRole("group", { name: "Spec" });
    expect(await within(group).findByRole("link", { name: /^Données/ })).toBeInTheDocument();
    expect(within(nav()).getByRole("link", { name: "Vue d'ensemble" })).toBeInTheDocument();
  });

  it("spec.deliverables en échec : la navigation reste, SPEC verrouillée (fail-closed), pas de compteur", async () => {
    procedures.specDeliverables.mockRejectedValue(new Error("500"));
    renderFrame(SPEC);
    const group = await within(nav()).findByRole("group", { name: "Spec" });
    await waitFor(() => expect(group).not.toHaveAttribute("aria-busy"));
    expect(within(group).queryAllByRole("link")).toHaveLength(0);
    expect(within(nav()).getByRole("link", { name: /Tickets/ })).toBeInTheDocument();
    expect(within(nav()).getByRole("link", { name: "Vue d'ensemble" })).toBeInTheDocument();
  });
});

describe("carte projet : projets récents (C9)", () => {
  const recent = (id: string, name: string) => ({
    id,
    name,
    visitedAt: "2026-11-07T10:00:00.000Z",
  });

  it("liste les récents, « Tous les projets » et « Créer un projet » (propriétaire)", async () => {
    asRole("owner");
    procedures.projectRecent.mockResolvedValue([
      recent(PROJECT_ID, "Portail de réservation"),
      recent(OTHER_ID, "Atelier Lumière"),
    ]);
    renderFrame(SPEC);
    await userEvent.click(
      await within(nav()).findByRole("button", { name: /Portail de réservation/ }),
    );
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("Récents")).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Atelier Lumière" })).toHaveAttribute(
      "href",
      `/projects/${OTHER_ID}`,
    );
    expect(within(menu).getByRole("menuitem", { name: "Tous les projets" })).toHaveAttribute(
      "href",
      "/projects",
    );
    expect(within(menu).getByRole("menuitem", { name: "Créer un projet" })).toHaveAttribute(
      "href",
      "/projects",
    );
  });

  it("sans récent : « Aucun projet récent »", async () => {
    renderFrame(SPEC);
    await userEvent.click(
      await within(nav()).findByRole("button", { name: /Portail de réservation/ }),
    );
    expect(await screen.findByText("Aucun projet récent")).toBeInTheDocument();
  });

  it("« Créer un projet » est réservé au propriétaire et à l'administrateur", async () => {
    asRole("dev");
    renderFrame(SPEC);
    await userEvent.click(
      await within(nav()).findByRole("button", { name: /Portail de réservation/ }),
    );
    await screen.findByRole("menu");
    expect(screen.queryByRole("menuitem", { name: "Créer un projet" })).toBeNull();
  });
});

describe("droits (C8, C12, B82)", () => {
  it("client : Réglages (vers Mon compte), avec la carte, SPEC et Tickets", async () => {
    asRole("client");
    renderFrame(SPEC);
    await within(nav()).findByRole("link", { name: /Tickets/ });
    expect(within(nav()).getByRole("link", { name: "Réglages" })).toHaveAttribute(
      "href",
      "/settings/account",
    );
    expect(within(nav()).queryByRole("link", { name: "Assistant de cadrage" })).toBeNull();
    expect(
      within(nav()).getByRole("button", { name: /Portail de réservation/ }),
    ).toBeInTheDocument();
    expect(within(nav()).getByRole("link", { name: /^Fonctionnel/ })).toBeInTheDocument();
  });

  it("rôle inconnu (organization.list pas encore lu) : Réglages vers Mon compte", async () => {
    procedures.organizationList.mockReturnValue(new Promise(() => undefined));
    renderFrame(SPEC);
    await within(nav()).findByRole("link", { name: /Tickets/ });
    expect(within(nav()).getByRole("link", { name: "Réglages" })).toHaveAttribute(
      "href",
      "/settings/account",
    );
    expect(within(nav()).queryByRole("link", { name: "Assistant de cadrage" })).toBeNull();
  });

  it.each(["owner", "admin", "dev", "designer"])(
    "%s : Réglages, et plus d'entrée Assistant de cadrage (TK-102)",
    async (role) => {
      asRole(role);
      renderFrame(SPEC);
      expect(await within(nav()).findByRole("link", { name: "Réglages" })).toBeInTheDocument();
      expect(within(nav()).queryByRole("link", { name: /Assistant/ })).toBeNull();
    },
  );

  it("business : Réglages (membres)", async () => {
    asRole("business");
    renderFrame(SPEC);
    expect(await within(nav()).findByRole("link", { name: "Réglages" })).toBeInTheDocument();
    expect(within(nav()).queryByRole("link", { name: "Assistant de cadrage" })).toBeNull();
  });
});

describe("pied et repli", () => {
  it("Replier la barre, identité et thème dans le pied", async () => {
    renderFrame(SPEC);
    await within(nav()).findByRole("group", { name: "Spec" });
    expect(within(nav()).getByRole("button", { name: "Replier la barre" })).toBeInTheDocument();
    expect(within(nav()).getByRole("button", { name: /Menu utilisateur/ })).toHaveTextContent(
      "awa@example.com",
    );
    expect(
      within(nav()).getByRole("button", { name: "Passer au thème sombre" }),
    ).toBeInTheDocument();
  });

  it("le contenu est dans un unique landmark main", async () => {
    renderFrame(SPEC);
    expect(await screen.findAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("main")).toHaveTextContent("Contenu");
  });
});

describe("375 px", () => {
  it("en-tête de 56 px : bouton menu, nom du projet, thème et recherche ; barre dans un tiroir", async () => {
    setViewport(MOBILE);
    renderFrame(SPEC);
    expect(await screen.findByRole("button", { name: "Ouvrir le menu" })).toBeInTheDocument();
    expect(await screen.findByText("Portail de réservation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Passer au thème sombre" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rechercher" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Navigation principale" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Ouvrir le menu" }));
    expect(
      await screen.findByRole("navigation", { name: "Navigation principale" }),
    ).toBeInTheDocument();
  });
});

describe("barre : le pied reste en bas, la navigation défile au-dessus (D10, comparaison à la planche 10)", () => {
  it("« Replier la barre », l'identité et le thème sont hors de la zone défilante", async () => {
    renderFrame(SPEC);
    const scroll = await waitFor(() => {
      const zone = nav().querySelector('[data-slot="sidebar-scroll"]');
      expect(zone).not.toBeNull();
      return zone as HTMLElement;
    });
    expect(scroll.className).toContain("overflow-y-auto");
    expect(within(scroll).getByRole("link", { name: "Tous les projets" })).toBeInTheDocument();
    const fold = within(nav()).getByRole("button", { name: "Replier la barre" });
    expect(scroll).not.toContainElement(fold);
    expect(scroll).not.toContainElement(within(nav()).getByRole("button", { name: /thème/ }));
  });
});

describe("palette ⌘K branchée sur search.query (D1-D3, B3)", () => {
  it("le champ Rechercher ouvre la palette ; la saisie interroge le serveur du projet courant", async () => {
    procedures.searchQuery.mockResolvedValue({
      items: [
        {
          kind: "ticket",
          projectId: PROJECT_ID,
          key: "TK-7",
          title: "Corriger le tri",
          status: "todo",
        },
        { kind: "feature", projectId: PROJECT_ID, specId: "F-003", title: "Tri des résultats" },
      ],
      total: 2,
      nextCursor: null,
    });
    renderFrame(SPEC);
    await userEvent.click(await within(nav()).findByRole("button", { name: /Rechercher/ }));
    const dialog = await screen.findByRole("dialog", { name: "Recherche" });
    await userEvent.type(within(dialog).getByRole("combobox"), "tri");
    await waitFor(() =>
      expect(procedures.searchQuery).toHaveBeenCalledWith({ q: "tri", projectId: PROJECT_ID }),
    );
    expect(procedures.searchQuery).toHaveBeenCalledTimes(1);
    const feature = await within(dialog).findByRole("option", { name: /Tri des résultats/ });
    await userEvent.click(feature);
    expect((await import("./support/web-mocks.ts")).router.push).toHaveBeenCalledWith(
      `/projects/${PROJECT_ID}/spec/functional?tab=features&sel=F-003`,
    );
  });

  it("hors projet : la recherche ne passe pas de projectId", async () => {
    renderFrame("/projects");
    await userEvent.click(await within(nav()).findByRole("button", { name: /Rechercher/ }));
    const dialog = await screen.findByRole("dialog", { name: "Recherche" });
    await userEvent.type(within(dialog).getByRole("combobox"), "atel");
    await waitFor(() => expect(procedures.searchQuery).toHaveBeenCalledWith({ q: "atel" }));
  });

  it("Ctrl K ouvre la palette depuis toute page", async () => {
    renderFrame("/projects");
    await within(nav()).findByRole("link", { name: "Tous les projets" });
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(await screen.findByRole("dialog", { name: "Recherche" })).toBeInTheDocument();
  });
});

/** TK-141 lot A (TK-88 n° 1, 2, 7, 9) : la coquille sur ShellNavGroup, ShellNavItem count, PhaseRail inline, Kbd. */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("TK-141 lot A : coquille fidèle à la maquette 05", () => {
  const icons = (name: string) => nav().querySelectorAll(`svg[data-icon='${name}']`);

  it("A1 : Tickets porte son compteur par ShellNavItem count ; replié, le nom accessible l'inclut", async () => {
    renderFrame(SPEC);
    const link = await within(nav()).findByRole("link", { name: /Tickets/ });
    expect(link.querySelector("[data-slot='count-badge']")).toHaveTextContent("12");
    await userEvent.click(within(nav()).getByRole("button", { name: "Replier la barre" }));
    expect(await within(nav()).findByRole("link", { name: "Tickets, 12" })).toBeInTheDocument();
  });

  it("A1 : sans sprint actif, aucun compteur, replié comme déplié", async () => {
    procedures.projectShell.mockResolvedValue(projectShell({ ticketCount: null }));
    renderFrame(SPEC);
    await within(nav()).findByRole("link", { name: "Tickets" });
    expect(nav().querySelector("[data-slot='count-badge']")).toBeNull();
    await userEvent.click(within(nav()).getByRole("button", { name: "Replier la barre" }));
    expect(await within(nav()).findByRole("link", { name: "Tickets" })).toBeInTheDocument();
  });

  it("A2 : « Projet » et « Organisation » sont des groupes ShellNavGroup, le second séparé par un trait", async () => {
    renderFrame(SPEC);
    const project = await within(nav()).findByRole("group", { name: "Projet" });
    const organization = within(nav()).getByRole("group", { name: "Organisation" });
    expect(within(project).getByRole("link", { name: /Tickets/ })).toBeInTheDocument();
    expect(within(organization).getByRole("link", { name: "Réglages" })).toBeInTheDocument();
    expect(organization).toHaveClass("border-t");
    expect(project).not.toHaveClass("border-t");
  });

  it("A3 : replié, la carte projet n'est pas rendue (une seule icône folder_open, celle de Tous les projets)", async () => {
    renderFrame(SPEC);
    await within(nav()).findByRole("button", { name: /Portail de réservation/ });
    await userEvent.click(within(nav()).getByRole("button", { name: "Replier la barre" }));
    await within(nav()).findByRole("link", { name: "Tous les projets" });
    expect(within(nav()).queryByRole("button", { name: /Portail de réservation/ })).toBeNull();
    expect(within(nav()).queryByTestId("project-card-loading")).toBeNull();
    await waitFor(() => expect(icons("folder_open")).toHaveLength(1));
  });

  it("A3 : déplié, le fil de phase est inline dans la carte projet", async () => {
    renderFrame(SPEC);
    const card = await within(nav()).findByRole("button", { name: /Portail de réservation/ });
    const rail = card.querySelector("[data-slot='phase-rail']");
    expect(rail).toHaveAttribute("data-size", "inline");
    expect(rail).toHaveTextContent(/\d sur 4/);
  });

  it("A4 : le champ Rechercher porte le raccourci dans un Kbd", async () => {
    renderFrame("/projects");
    const search = await within(nav()).findByRole("button", { name: /Rechercher/ });
    expect(search.querySelector("[data-slot='kbd']")).toHaveTextContent(/Ctrl K|⌘K/);
  });

  it("A4 : le trait du pied est au-dessus de l'identité, sous « Replier la barre »", async () => {
    renderFrame(SPEC);
    const fold = await within(nav()).findByRole("button", { name: "Replier la barre" });
    expect(fold.parentElement).not.toHaveClass("border-t");
    const theme = within(nav()).getByRole("button", { name: /thème/ });
    expect(theme.parentElement).toHaveClass("border-t");
    expect(fold.parentElement).toContainElement(theme);
  });
});
