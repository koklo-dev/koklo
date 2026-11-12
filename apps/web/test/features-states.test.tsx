import { ToastProvider } from "@koklo/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as route from "../src/app/(shell)/projects/[projectId]/spec/functional/page.tsx";
import { ShellFrame } from "../src/components/shell-frame.tsx";
import { findList, head, list, PROJECT_ID, renderFeatures, serve } from "./support/features.tsx";
import { fake, LAUNCH_ID, many, renderTeam, serveProposals } from "./support/proposals.tsx";
import { findNamed } from "./support/wait.ts";
import {
  pathname,
  polyfillRadix,
  procedures,
  resetWebMocks,
  setUrl,
  specDeliverables,
  watchUrl,
} from "./support/web-mocks.ts";

vi.mock("next/navigation", async () => {
  const m = await import("./support/web-mocks.ts");
  return {
    useRouter: () => m.router,
    usePathname: () => m.pathname.current,
    useSearchParams: m.useSearchParams,
  };
});
vi.mock("../src/lib/auth-client.ts", async () => ({
  authClient: (await import("./support/web-mocks.ts")).authClient,
}));
vi.mock("../src/lib/orpc.ts", async () => ({
  orpc: (await import("./support/web-mocks.ts")).orpc,
}));

/** TK-102 lot B : en-tête par état (statut, résumé, actions) et une seule région status (maquette 10 l.637-658). */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  serveProposals([]);
});

const pill = () => document.querySelector("[data-slot='deliverable-status']");
const header = () => document.querySelector("[data-slot='project-header']") as HTMLElement;

describe("En-tête : Liste · équipe", () => {
  it("statut du livrable, résumé, « Proposer avec l'agent » puis « Nouvelle fonctionnalité » primaire", async () => {
    procedures.specDeliverables.mockResolvedValue({
      ...specDeliverables(),
      deliverables: specDeliverables().deliverables.map((entry) =>
        entry.key === "functional" ? { ...entry, status: "pending" } : entry,
      ),
    });
    renderTeam();
    await findList();
    await waitFor(() => expect(pill()).toHaveAttribute("data-status", "pending"));
    expect(pill()).toHaveTextContent("À valider");
    expect(
      within(header()).getByText("3 fonctionnalités · 4 règles · 3 rôles · 2 parcours"),
    ).toBeInTheDocument();
    // L'agent est dans la zone visuellement première (order-1), « Nouvelle fonctionnalité » dans la seconde.
    const agent = within(header()).getByRole("button", { name: /Proposer avec l'agent/ });
    const create = within(header()).getAllByRole("button", { name: /Nouvelle fonctionnalité/ });
    expect(agent.parentElement).toHaveClass("order-1");
    expect(create).toHaveLength(1);
    expect(create[0]?.parentElement).toHaveClass("order-2");
    expect(within(header()).queryByRole("button", { name: "Ajouter" })).toBeNull();
  });

  it("client : ni statut, ni résumé, ni action", async () => {
    serve("client");
    renderFeatures();
    await findList();
    expect(within(header()).queryByRole("button")).toBeNull();
    expect(pill()).toBeNull();
    expect(within(header()).queryByText("3 fonctionnalités")).toBeNull();
  });
});

describe("En-tête : Relecture", () => {
  it("« En cours », « N propositions à relire », « Ajouter » et « Reproposer », onglet « N à relire » en primary", async () => {
    serveProposals(many(3));
    renderTeam();
    expect(await findNamed("button", "Reproposer")).toBeVisible();
    expect(pill()).toHaveTextContent("En cours");
    expect(within(header()).getByText("3 propositions à relire")).toBeInTheDocument();
    expect(within(header()).getByRole("button", { name: "Ajouter" })).toBeVisible();
    const count = within(header()).getByText("3 à relire");
    expect(count.className).toContain("bg-primary");
    expect(within(header()).queryByRole("button", { name: /Nouvelle fonctionnalité/ })).toBeNull();
  });

  it("« Reproposer » ouvre la modale de l'agent", async () => {
    serveProposals(many(3));
    renderTeam();
    await userEvent.click(await findNamed("button", "Reproposer"));
    expect(await findNamed("dialog", "Proposer avec l'agent")).toBeVisible();
  });

  it("une seule région status à l'écran : la relecture porte la sienne", async () => {
    serveProposals(many(3), { launchStatus: "running" });
    renderTeam("?view=review");
    await findNamed("button", "Reproposer");
    await waitFor(() => expect(screen.getAllByRole("status")).toHaveLength(1));
  });
});

describe("En-tête : Génération", () => {
  it("« Génération », « Depuis le dossier d'idée figé », « Ajouter », agent indisponible, onglet « … »", async () => {
    procedures.proposalList.mockResolvedValue({
      items: [],
      nextCursor: null,
      previousCursor: null,
      offset: 0,
      total: 0,
      groups: [],
      launch: { id: LAUNCH_ID, status: "running", proposedCount: 0, discardedCount: 0 },
    });
    renderTeam("?view=review");
    expect(await findNamed("button", "Ajouter")).toBeVisible();
    await waitFor(() => expect(pill()).toHaveAttribute("data-status", "generating"));
    expect(within(header()).getByText("Depuis le dossier d'idée figé")).toBeInTheDocument();
    // Un « … » sur chacun des quatre onglets (maquette 10 l.670).
    expect(within(header()).getAllByText("…")).toHaveLength(4);
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});

describe("En-tête : Prêt", () => {
  it("« Prêt », « Rien encore », aucune action : la carte de l'agent porte les deux, aucun compteur", async () => {
    serve("owner");
    procedures.specListFeatures.mockResolvedValue(list([]));
    procedures.specHead.mockResolvedValue(
      head({ counts: { features: 0, tables: 0, endpoints: 0 } }),
    );
    renderFeatures();
    await findNamed("button", "Proposer le fonctionnel");
    expect(pill()).toHaveAttribute("data-status", "ready");
    expect(
      within(header()).getByText("Rien encore · dossier d'idée figé disponible"),
    ).toBeInTheDocument();
    expect(within(header()).queryByRole("button")).toBeNull();
  });
});

describe("Barre : badge de Fonctionnel", () => {
  it("« N à relire » pendant une relecture, un seul badge, avant le statut", async () => {
    procedures.specDeliverables.mockResolvedValue({
      ...specDeliverables(),
      deliverables: specDeliverables().deliverables.map((entry) =>
        entry.key === "functional" ? { ...entry, status: "pending", pendingProposals: 3 } : entry,
      ),
    });
    pathname.current = `/projects/${PROJECT_ID}/spec/functional`;
    setUrl(`/projects/${PROJECT_ID}/spec/functional?tab=features`);
    serve("owner");
    const element = await route.default({ params: Promise.resolve({ projectId: PROJECT_ID }) });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ToastProvider>
          <ShellFrame>{element}</ShellFrame>
        </ToastProvider>
      </QueryClientProvider>,
    );
    const bar = await screen.findByRole("navigation", { name: "Navigation principale" });
    const link = await within(bar).findByRole("link", { name: /^Fonctionnel/ });
    await waitFor(() => expect(link.querySelectorAll("[data-slot='spec-badge']")).toHaveLength(1));
    expect(link).toHaveTextContent("3 à relire");
    expect(link.querySelector("[data-slot='spec-badge']")?.className).toContain("bg-primary");
  });
});
