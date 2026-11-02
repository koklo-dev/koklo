import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BRIEF_OUTPUT,
  briefCalls,
  GENERATE,
  generateBrief,
  IDEA,
  openFraming,
  PROPOSALS_OUTPUT,
  PROPOSE,
  paste,
  proposeCalls,
  serveFraming,
  writeIdea,
} from "./support/framing.tsx";
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

/**
 * TK-59 / revue : « Réessayer » envoie ce qui est AFFICHÉ au moment du clic (idée, précisions, brief édités après
 * l'échec), jamais le texte capturé au premier clic. Ce qui part chez le fournisseur correspond à l'écran.
 */
const EDITED = "Une idée corrigée après l'échec.";
const NETWORK = apiError("LLM_PROVIDER_ERROR", { reason: "timeout" });

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
  serveFraming();
});

describe("« Réessayer » rejoue avec la saisie courante", () => {
  it("brief : l'idée éditée après l'échec est celle qui part", async () => {
    procedures.aiDraftBrief.mockRejectedValue(NETWORK);
    await openFraming();
    await writeIdea(IDEA);
    await userEvent.click(screen.getByRole("button", { name: GENERATE }));
    const alert = await screen.findByRole("alert");
    await paste(await screen.findByRole("textbox", { name: /^Votre idée/ }), EDITED);
    procedures.aiDraftBrief.mockResolvedValue(BRIEF_OUTPUT);
    await userEvent.click(within(alert).getByRole("button", { name: "Réessayer" }));
    await findNamed("heading", /^2\. Le brief/);
    expect(briefCalls()).toHaveLength(2);
    expect(briefCalls()[1]).toMatchObject({ idea: EDITED });
  });

  it("propositions : le brief édité après l'échec est celui qui part", async () => {
    procedures.aiProposeFeatures.mockRejectedValue(NETWORK);
    await openFraming();
    await generateBrief();
    await userEvent.click(screen.getByRole("button", { name: PROPOSE }));
    const alert = await screen.findByRole("alert");
    await paste(screen.getByRole("textbox", { name: /^Titre/ }), "Titre corrigé");
    procedures.aiProposeFeatures.mockResolvedValue(PROPOSALS_OUTPUT);
    await userEvent.click(within(alert).getByRole("button", { name: "Réessayer" }));
    await findNamed("heading", /^3\. Les propositions/);
    expect(proposeCalls()).toHaveLength(2);
    expect(proposeCalls()[1]).toMatchObject({ brief: expect.stringContaining("Titre corrigé") });
    expect(proposeCalls()[1]).not.toMatchObject({
      brief: expect.stringContaining(BRIEF_OUTPUT.brief.title),
    });
  });
});
