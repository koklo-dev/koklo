import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { inputsOf } from "./support/features.tsx";
import { fake, many, renderTeam, serveProposals } from "./support/proposals.tsx";
import { findNamed } from "./support/wait.ts";
import {
  apiError,
  polyfillRadix,
  procedures,
  resetWebMocks,
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

/** TK-99b : bouton « Proposer avec l'agent », modale, lancement, sondage, reprise en relecture (fiche §3 critères 1 à 6). */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  serveProposals([]);
});

const BUTTON = /Proposer avec l'agent/;
const openModal = async () => {
  await userEvent.click(await findNamed("button", BUTTON));
  return findNamed("dialog", "Proposer avec l'agent");
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Bouton et modale", () => {
  it("ouvre la modale sans rien lancer", async () => {
    renderTeam();
    const dialog = await openModal();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(procedures.aiProposeDeliverable).not.toHaveBeenCalled();
  });

  it("choix dans l'ordre du serveur, compte nul absent, premier « Recommandé » avec sa pastille de compte", async () => {
    renderTeam();
    const dialog = await openModal();
    const radios = await within(dialog).findAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
    const text = dialog.textContent ?? "";
    expect(text.indexOf("Compléter le cahier")).toBeLessThan(text.indexOf("Écrire les critères"));
    expect(text).not.toContain("Mettre à jour depuis le dossier");
    expect(text).toContain("Recommandé");
    expect(text).toContain("3 critères");
    expect(text).toContain("Cahier fonctionnel actuel");
  });

  it("la consigne passe par `value` et s'arrête à 500 caractères", async () => {
    renderTeam();
    const dialog = await openModal();
    const field = within(dialog).getByRole("textbox") as HTMLTextAreaElement;
    expect(field.value).toBe("");
    expect(field).toHaveAttribute("maxlength", "500");
  });

  it("Lancer appelle ai.proposeDeliverable, ferme la modale, bouton « en cours »", async () => {
    procedures.aiProposeDeliverable.mockResolvedValue({ launchId: "x", status: "queued" });
    renderTeam();
    const dialog = await openModal();
    await userEvent.click(
      await within(dialog).findByRole("radio", { name: /Écrire les critères/ }),
    );
    await userEvent.type(within(dialog).getByRole("textbox"), "  des cas limites ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Lancer" }));
    await waitFor(() => expect(procedures.aiProposeDeliverable).toHaveBeenCalledTimes(1));
    expect(inputsOf(procedures.aiProposeDeliverable)[0]).toMatchObject({
      deliverable: "functional",
      mode: "criteria",
      instruction: "des cas limites",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("409 PROPOSAL_IN_PROGRESS : pas d'alerte bloquante, bouton « en cours » et message", async () => {
    procedures.aiProposeDeliverable.mockRejectedValue(
      apiError("PROPOSAL_IN_PROGRESS", { launchId: "l" }),
    );
    renderTeam();
    const dialog = await openModal();
    await userEvent.click(await within(dialog).findByRole("button", { name: "Lancer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(await findNamed("button", /L'agent propose/)).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Une génération est déjà en cours pour ce livrable.")).toBeVisible();
  });

  it("autre erreur : ai-error-notice dans la modale, qui reste ouverte", async () => {
    procedures.aiProposeDeliverable.mockRejectedValue(
      apiError("LLM_NOT_CONFIGURED", { reason: "missing" }),
    );
    renderTeam();
    const dialog = await openModal();
    await userEvent.click(await within(dialog).findByRole("button", { name: "Lancer" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/pas encore configurée/);
  });
});

describe("État indisponible", () => {
  it("available:false : bouton inerte, raison en infobulle, aucun lancement", async () => {
    procedures.aiProposeOptions.mockResolvedValue({
      options: [],
      reads: [],
      available: false,
      reason: "no_frozen_idea",
    });
    renderTeam();
    const button = await findNamed("button", BUTTON);
    await waitFor(() => expect(button).toHaveAttribute("data-state", "unavailable"));
    expect(button).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(button);
    expect(screen.queryByRole("dialog", { name: "Proposer avec l'agent" })).not.toBeInTheDocument();
    expect(procedures.aiProposeDeliverable).not.toHaveBeenCalled();
  });
});

describe("Sondage et reprise", () => {
  it("lancement en cours : le bouton est « en cours », un clic ne fait rien, la liste est relue", async () => {
    serveProposals(many(2), { launchStatus: "running" });
    renderTeam();
    const button = await findNamed("button", /L'agent propose/);
    await userEvent.click(button);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(procedures.proposalList.mock.calls.length).toBeGreaterThan(1), {
      timeout: 5000,
    });
  });

  it("propositions à relire au chargement : bouton « Relire N », relecture ouverte une fois, sans rouvrir après « Quitter »", async () => {
    serveProposals(many(3));
    renderTeam();
    await findNamed("button", /Relire 3 propositions/);
    await waitFor(() => expect(window.location.search).toContain("view=review"));
    await userEvent.click(await findNamed("button", "Quitter la relecture"));
    await waitFor(() => expect(window.location.search).not.toContain("view=review"));
    await findNamed("button", /Relire 3 propositions/);
    expect(window.location.search).not.toContain("view=review");
  });

  it("ready : le clic ouvre la relecture sans modale", async () => {
    serveProposals(many(3));
    renderTeam();
    await userEvent.click(await findNamed("button", "Quitter la relecture"));
    await userEvent.click(await findNamed("button", /Relire 3 propositions/));
    expect(window.location.search).toContain("view=review");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Données de départ", () => {
  it("une proposition seule suffit à rendre le bouton prêt (singulier)", async () => {
    serveProposals([fake(1)]);
    renderTeam();
    expect(await findNamed("button", /Relire 1 proposition/)).toBeVisible();
  });
});
