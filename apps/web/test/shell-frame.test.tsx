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
    expect(linkHrefs()).toEqual(
      expect.arrayContaining([
        ["Tous les projets", "/projects"],
        ["Réglages", "/settings/members"],
      ]),
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

  it("Projet : Vue d'ensemble, Idée, Assistant de cadrage, SPEC, Tickets, dans l'ordre", async () => {
    asRole("owner");
    renderFrame(SPEC);
    await within(nav()).findByRole("link", { name: "Données" });
    expect(linkHrefs()).toEqual([
      ["Vue d'ensemble", `/projects/${PROJECT_ID}`],
      ["Idée", `/projects/${PROJECT_ID}/idea`],
      ["Assistant de cadrage", `/projects/${PROJECT_ID}/framing`],
      ["Fonctionnel", `/projects/${PROJECT_ID}/spec/functional`],
      ["Données", `/projects/${PROJECT_ID}/spec/data`],
      ["Design", `/projects/${PROJECT_ID}/spec/design`],
      ["Tickets12", `/projects/${PROJECT_ID}/tickets`],
      ["Tous les projets", "/projects"],
      ["Réglages", "/settings/members"],
    ]);
  });

  it("SPEC : compteur 0/7, livrables non disponibles en boutons aria-disabled", async () => {
    renderFrame(SPEC);
    const group = await within(nav()).findByRole("group", { name: "Spec" });
    expect(group).toHaveTextContent("0/7");
    const locked = within(group).getByRole("button", {
      name: "Architecture, disponible après les données",
    });
    expect(locked).toHaveAttribute("aria-disabled", "true");
    expect(within(group).getByRole("link", { name: "Fonctionnel" })).toHaveAttribute(
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

  it("un identifiant qui n'est pas un uuid n'appelle ni project.shell ni project.visit", async () => {
    renderFrame("/projects/pas-un-uuid/spec/functional");
    await within(nav()).findByRole("link", { name: "Tous les projets" });
    expect(procedures.projectShell).not.toHaveBeenCalled();
    expect(procedures.projectVisit).not.toHaveBeenCalled();
  });

  it("project.shell en échec : la navigation reste, SPEC verrouillée (fail-closed), pas de compteur", async () => {
    procedures.projectShell.mockRejectedValue(new Error("500"));
    renderFrame(SPEC);
    const group = await within(nav()).findByRole("group", { name: "Spec" });
    await waitFor(() => expect(group).not.toHaveAttribute("aria-busy"));
    expect(within(group).queryAllByRole("link")).toHaveLength(0);
    expect(within(nav()).getByRole("link", { name: "Tickets" })).toHaveTextContent(/^Tickets$/);
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
  it("client : ni Réglages ni Assistant de cadrage, mais la carte, SPEC et Tickets", async () => {
    asRole("client");
    renderFrame(SPEC);
    await within(nav()).findByRole("link", { name: /Tickets/ });
    expect(within(nav()).queryByRole("link", { name: "Réglages" })).toBeNull();
    expect(within(nav()).queryByRole("link", { name: "Assistant de cadrage" })).toBeNull();
    expect(
      within(nav()).getByRole("button", { name: /Portail de réservation/ }),
    ).toBeInTheDocument();
    expect(within(nav()).getByRole("link", { name: "Fonctionnel" })).toBeInTheDocument();
  });

  it("rôle inconnu (organization.list pas encore lu) : sans Réglages ni Assistant de cadrage", async () => {
    procedures.organizationList.mockReturnValue(new Promise(() => undefined));
    renderFrame(SPEC);
    await within(nav()).findByRole("link", { name: /Tickets/ });
    expect(within(nav()).queryByRole("link", { name: "Réglages" })).toBeNull();
    expect(within(nav()).queryByRole("link", { name: "Assistant de cadrage" })).toBeNull();
  });

  it.each(["owner", "admin", "dev", "designer"])(
    "%s : Réglages et Assistant de cadrage",
    async (role) => {
      asRole(role);
      renderFrame(SPEC);
      expect(await within(nav()).findByRole("link", { name: "Réglages" })).toBeInTheDocument();
      expect(within(nav()).getByRole("link", { name: "Assistant de cadrage" })).toBeInTheDocument();
    },
  );

  it("business : Réglages (membres) mais pas l'Assistant de cadrage", async () => {
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
