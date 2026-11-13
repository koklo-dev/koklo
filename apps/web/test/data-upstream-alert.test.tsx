import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataUpstreamAlert } from "../src/components/data-upstream-alert.tsx";
import { renderData, serveData } from "./support/data.tsx";
import {
  polyfillRadix,
  procedures,
  resetWebMocks,
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

/** TK-109 lot B, critères 3 et 7 : l'état À revoir, l'alerte d'impact amont et « Proposer les mises à jour » (B449, B450). */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
});

describe("DataUpstreamAlert", () => {
  it("avertissement : « Le cahier fonctionnel a changé : F-002, R-004 modifiées », une note sans annonce", () => {
    render(<DataUpstreamAlert ids={["F-002", "R-004"]} onPropose={() => {}} />);
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("Le cahier fonctionnel a changé : F-002, R-004 modifiées");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("une seule référence : « modifiée » au singulier", () => {
    render(<DataUpstreamAlert ids={["F-002"]} onPropose={() => {}} />);
    expect(screen.getByRole("note")).toHaveTextContent("F-002 modifiée");
  });

  it("« Proposer les mises à jour » appelle l'action ; sans action (designer), pas de bouton", async () => {
    const onPropose = vi.fn();
    const { rerender } = render(<DataUpstreamAlert ids={["F-002"]} onPropose={onPropose} />);
    await userEvent.click(screen.getByRole("button", { name: "Proposer les mises à jour" }));
    expect(onPropose).toHaveBeenCalledOnce();
    rerender(<DataUpstreamAlert ids={["F-002"]} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("Écran Données : À revoir", () => {
  const revise = () =>
    procedures.specDeliverables.mockResolvedValue(
      specDeliverables({ status: { data: "revise" }, staleUpstream: { data: ["F-002", "R-004"] } }),
    );

  it("statut « À revoir » et alerte d'avertissement avec les références", async () => {
    serveData("owner");
    revise();
    renderData();
    expect(
      await screen.findByText("Le cahier fonctionnel a changé : F-002, R-004 modifiées"),
    ).toBeInTheDocument();
    expect(screen.getByText("À revoir")).toBeInTheDocument();
  });

  it("« Proposer les mises à jour » ouvre la modale de l'agent préremplie, option « Compléter le modèle »", async () => {
    serveData("owner");
    revise();
    procedures.aiProposeOptions.mockResolvedValue({
      options: [{ id: "complete", count: 3 }],
      reads: [],
      available: true,
    });
    renderData();
    await userEvent.click(await screen.findByRole("button", { name: "Proposer les mises à jour" }));
    const dialog = within(await screen.findByRole("dialog"));
    await waitFor(() =>
      expect(dialog.getByRole("textbox")).toHaveValue(
        "Mettre le modèle à jour d'après F-002, R-004",
      ),
    );
    expect(dialog.getByRole("radio", { name: /Compléter le modèle/ })).toBeChecked();
  });

  it("designer : l'alerte se lit, sans bouton", async () => {
    serveData("designer");
    revise();
    renderData();
    await screen.findByText("Le cahier fonctionnel a changé : F-002, R-004 modifiées");
    expect(screen.queryByRole("button", { name: "Proposer les mises à jour" })).toBeNull();
  });

  it("pas d'alerte quand rien n'est à revoir", async () => {
    serveData("owner");
    procedures.specDeliverables.mockResolvedValue(
      specDeliverables({ status: { data: "pending" } }),
    );
    renderData();
    await screen.findByText("Validation de l'équipe · le client lit et commente");
    expect(screen.queryByText(/Le cahier fonctionnel a changé/)).toBeNull();
  });
});
