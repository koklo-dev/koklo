import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROJECT_ID, renderArchitecture, serveArchitecture } from "./support/architecture.tsx";
import { SHA } from "./support/features.tsx";
import {
  apiError,
  polyfillRadix,
  procedures,
  resetWebMocks,
  router,
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
/** TK-113 lot B, cas 4 et 5 : « Valider l'architecture » et état À revoir (B577 à B580, B587, B592 bis). */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
});

const DECISION = {
  id: "00000000-0000-4000-8000-0000000000d1",
  targetKind: "deliverable",
  targetRef: "architecture",
  sha: "8f2d41c".padEnd(40, "0"),
  status: "approved",
  authorId: "00000000-0000-4000-8000-0000000000a1",
  authorName: "Moussa",
  authorRole: "owner",
  comment: null,
  createdAt: "2026-11-05T10:00:00.000Z",
  current: true,
  withoutClient: false,
};

const deliverables = (status: string, stale: Record<string, readonly string[]> = {}) => {
  const base = specDeliverables({ status: { architecture: status } });
  return {
    ...base,
    deliverables: base.deliverables.map((entry) =>
      entry.key === "architecture" ? { ...entry, ...stale } : entry,
    ),
  };
};
const validate = () => screen.findByRole("button", { name: "Valider l'architecture" });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Valider l'architecture", () => {
  it.each(["owner", "admin", "dev"] as const)(
    "%s : le bouton est là, primaire, en dernier",
    async (role) => {
      serveArchitecture(role);
      procedures.specDeliverables.mockResolvedValue(deliverables("pending"));
      renderArchitecture();
      const button = await validate();
      expect(button).toHaveClass("bg-primary");
      const names = within(button.parentElement as HTMLElement)
        .getAllByRole("button")
        .map((b) => b.textContent?.trim());
      expect(names.at(-1)).toBe("Valider l'architecture");
    },
  );

  it("designer : aucun bouton Valider ; une architecture déjà validée n'en a plus", async () => {
    serveArchitecture("designer");
    procedures.specDeliverables.mockResolvedValue(deliverables("pending"));
    renderArchitecture();
    await screen.findByRole("heading", { level: 1, name: "Architecture" });
    expect(screen.queryByRole("button", { name: "Valider l'architecture" })).toBeNull();
  });

  it("clic : review.submit deliverable architecture au SHA de tête, annonce « Architecture validée »", async () => {
    serveArchitecture("owner");
    procedures.specDeliverables.mockResolvedValue(deliverables("pending"));
    procedures.reviewSubmit.mockResolvedValue({ id: DECISION.id });
    renderArchitecture();
    await userEvent.click(await validate());
    await waitFor(() =>
      expect(procedures.reviewSubmit.mock.calls[0]?.[0]).toEqual({
        projectId: PROJECT_ID,
        targetKind: "deliverable",
        targetRef: "architecture",
        version: SHA,
        status: "approved",
      }),
    );
    expect(await screen.findByText("Architecture validée")).toBeInTheDocument();
  });

  it("échec : phrase en français dans une alerte, le bouton reste", async () => {
    serveArchitecture("owner");
    procedures.specDeliverables.mockResolvedValue(deliverables("pending"));
    procedures.reviewSubmit.mockRejectedValue(apiError("STALE_VERSION"));
    renderArchitecture();
    await userEvent.click(await validate());
    expect(await screen.findByRole("alert")).toHaveTextContent(/a changé depuis votre lecture/);
    expect(screen.getByRole("button", { name: "Valider l'architecture" })).toBeInTheDocument();
  });

  it("validé : « Validé par Moussa le 5 nov. · version 8f2d41c », sans bouton Valider", async () => {
    serveArchitecture("owner");
    procedures.specDeliverables.mockResolvedValue(deliverables("validated"));
    procedures.reviewList.mockResolvedValue({ items: [DECISION], nextCursor: null });
    renderArchitecture();
    expect(
      await screen.findByText("Validé par Moussa le 5 nov. · version 8f2d41c"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Valider l'architecture" })).toBeNull();
    expect(procedures.reviewList.mock.calls[0]?.[0]).toMatchObject({ targetRef: "architecture" });
  });
});

const REVISE = deliverables("revise", {
  staleUpstream: ["T-avis", "F-002"],
  staleComponents: ["C-api"],
  staleFlows: ["P-reserver"],
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Architecture à revoir", () => {
  it("statut « À revoir », bandeau role=alert avec les éléments et les concernés ; Valider reste (B592 bis)", async () => {
    serveArchitecture("owner");
    procedures.specDeliverables.mockResolvedValue(REVISE);
    procedures.reviewList.mockResolvedValue({ items: [DECISION], nextCursor: null });
    renderArchitecture();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("T-avis, F-002 modifiés.");
    expect(alert).toHaveTextContent("Sont concernés : C-api, P-reserver");
    expect(alert).toHaveTextContent("(version 8f2d41c)");
    expect(screen.getByText("À revoir")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Valider l'architecture" })).toBeVisible();
  });

  it("« Voir les changements » ouvre l'écran amont sur le premier élément", async () => {
    serveArchitecture("owner");
    procedures.specDeliverables.mockResolvedValue(REVISE);
    renderArchitecture();
    await userEvent.click(await screen.findByRole("button", { name: "Voir les changements" }));
    expect(router.push).toHaveBeenCalledWith(
      `/projects/${PROJECT_ID}/spec/data?tab=tables&sel=T-avis`,
    );
  });

  it("« Proposer les mises à jour » ouvre la modale de l'agent préremplie (équipe écrivante)", async () => {
    serveArchitecture("owner");
    procedures.specDeliverables.mockResolvedValue(REVISE);
    procedures.aiProposeOptions.mockResolvedValue({
      options: [{ id: "complete", count: 3 }],
      reads: [],
      available: true,
    });
    renderArchitecture();
    await userEvent.click(await screen.findByRole("button", { name: "Proposer les mises à jour" }));
    const dialog = within(await screen.findByRole("dialog"));
    await waitFor(() =>
      expect(dialog.getByRole("textbox")).toHaveValue(
        "Mettre l'architecture à jour d'après T-avis, F-002",
      ),
    );
  });

  it("designer : le bandeau se lit, sans « Proposer les mises à jour »", async () => {
    serveArchitecture("designer");
    procedures.specDeliverables.mockResolvedValue(REVISE);
    renderArchitecture();
    expect(await screen.findByRole("alert")).toHaveTextContent("T-avis, F-002 modifiés.");
    expect(screen.queryByRole("button", { name: "Proposer les mises à jour" })).toBeNull();
  });

  it("jamais de bandeau hors « À revoir » (B592)", async () => {
    serveArchitecture("owner");
    procedures.specDeliverables.mockResolvedValue(
      deliverables("pending", { staleUpstream: ["T-avis"] }),
    );
    renderArchitecture();
    await validate();
    expect(screen.queryByText(/a changé depuis la validation/)).toBeNull();
  });

  it("schéma : les nœuds concernés portent « à revoir » dans leur nom, la fiche l'encadré ambre", async () => {
    serveArchitecture("owner");
    procedures.specDeliverables.mockResolvedValue(REVISE);
    renderArchitecture({ wide: true, search: "zone=Prise%20de%20rendez-vous&sel=C-api" });
    expect(await screen.findByRole("button", { name: "Service API, à revoir" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Application Application web" })).toBeVisible();
    expect(await screen.findByText(/Concerné par le changement/)).toHaveTextContent(
      "T-avis doit être possédée",
    );
  });
});
