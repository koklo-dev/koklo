import { act, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferred } from "./support/feature-form.tsx";
import {
  BRIEF_OUTPUT,
  briefCalls,
  GENERATE,
  generateBrief,
  liveText,
  openFraming,
  PROPOSALS_OUTPUT,
  PROPOSE,
  proposeCalls,
  serveFraming,
  writeIdea,
} from "./support/framing.tsx";
import { findNamed } from "./support/wait.ts";
import { polyfillRadix, procedures, resetWebMocks, watchUrl } from "./support/web-mocks.ts";

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

/**
 * TK-59 / 59a, appel en cours (S-framing §4.3, §5.1) : un seul appel IA à la fois, double clic impossible,
 * annulation honnête de l'attente, focus et annonce uniques en fin d'appel.
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
  serveFraming();
});

async function startBrief() {
  const pending = deferred<typeof BRIEF_OUTPUT>();
  procedures.aiDraftBrief.mockReturnValue(pending.promise);
  await openFraming();
  await writeIdea();
  await userEvent.click(screen.getByRole("button", { name: GENERATE }));
  return pending;
}

describe("Attente d'un appel", () => {
  it("bouton désactivé « Génération en cours… », section aria-busy, message d'attente", async () => {
    await startBrief();
    const busy = await screen.findByRole("button", { name: "Génération en cours…" });
    expect(busy).toBeDisabled();
    expect(busy.closest("[aria-busy='true']")).not.toBeNull();
    expect(liveText()).toContain(
      "Génération en cours. Cela peut prendre une minute. Vous pouvez continuer à lire.",
    );
  });

  it("le focus reste sur « Annuler l'attente »", async () => {
    await startBrief();
    const cancel = await screen.findByRole("button", { name: "Annuler l'attente" });
    await waitFor(() => expect(cancel).toHaveFocus());
  });

  it("un double clic ne lance qu'un seul appel", async () => {
    procedures.aiDraftBrief.mockReturnValue(new Promise(() => undefined));
    await openFraming();
    await writeIdea();
    const button = screen.getByRole("button", { name: GENERATE });
    await userEvent.dblClick(button);
    expect(briefCalls()).toHaveLength(1);
  });

  it("un seul appel IA à la fois : pendant proposeFeatures, « Régénérer le brief » n'est pas utilisable et la raison est annoncée", async () => {
    await openFraming();
    await generateBrief();
    procedures.aiProposeFeatures.mockReturnValue(new Promise(() => undefined));
    await userEvent.click(screen.getByRole("button", { name: PROPOSE }));
    await screen.findByRole("button", { name: "Annuler l'attente" });
    const regenerate = screen.queryByRole("button", { name: "Régénérer le brief" });
    if (regenerate) expect(regenerate).toBeDisabled();
    expect(briefCalls()).toHaveLength(1);
    expect(liveText()).toMatch(/Une génération est déjà en cours|Génération en cours/);
  });
});

describe("Annuler l'attente", () => {
  it("abandonne l'attente côté écran, dit que la demande est comptée, conserve la saisie", async () => {
    await startBrief();
    await userEvent.click(await screen.findByRole("button", { name: "Annuler l'attente" }));
    expect(await screen.findByText("La demande a déjà été comptée.")).toBeVisible();
    expect(screen.getByRole("button", { name: GENERATE })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: /^Votre idée/ })).toHaveValue(
      "Un portail pour réserver des créneaux en ligne.",
    );
  });

  it("une réponse arrivée après l'annulation est ignorée : pas d'étape 2, pas d'annonce", async () => {
    const pending = await startBrief();
    await userEvent.click(await screen.findByRole("button", { name: "Annuler l'attente" }));
    await act(async () => pending.resolve(BRIEF_OUTPUT));
    expect(screen.queryByRole("heading", { name: /^2\. Le brief/ })).not.toBeInTheDocument();
    expect(liveText()).not.toContain("Brief prêt");
  });

  it("annuler les propositions garde le brief édité", async () => {
    await openFraming();
    await generateBrief();
    procedures.aiProposeFeatures.mockReturnValue(new Promise(() => undefined));
    await userEvent.click(screen.getByRole("button", { name: PROPOSE }));
    await userEvent.click(await screen.findByRole("button", { name: "Annuler l'attente" }));
    expect(await screen.findByRole("button", { name: PROPOSE })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: /^Titre/ })).toHaveValue("Portail de réservation");
  });
});

describe("Fin d'appel (propositions)", () => {
  it("focus sur le h2 « 3. Les propositions » (tabindex -1) et annonce « 3 propositions à relire. » une fois", async () => {
    await openFraming();
    await generateBrief();
    await userEvent.click(screen.getByRole("button", { name: PROPOSE }));
    const h2 = await findNamed("heading", /^3\. Les propositions/, { level: 2 });
    expect(h2).toHaveAttribute("tabindex", "-1");
    await waitFor(() => expect(h2).toHaveFocus());
    expect(liveText().match(/3 propositions à relire\./g) ?? []).toHaveLength(1);
    expect(proposeCalls()).toHaveLength(1);
    expect(PROPOSALS_OUTPUT.features).toHaveLength(3);
  });

  it("jamais d'enchaînement : après le brief, aucun appel de propositions sans clic", async () => {
    await openFraming();
    await generateBrief();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(proposeCalls()).toHaveLength(0);
  });
});
