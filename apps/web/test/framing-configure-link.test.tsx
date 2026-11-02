import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GENERATE,
  generateBrief,
  IDEA,
  openFraming,
  PROPOSE,
  serveFraming,
  writeIdea,
} from "./support/framing.tsx";
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
 * S-framing §4.5 (v2.1) : « IA non configurée » -> lien « Configurer l'IA » vers /settings/ai pour les
 * propriétaires et administrateurs, à la place de « Demandez à un administrateur... » ; texte inchangé pour tous les
 * autres rôles (jamais un lien : ils n'ont pas accès à la page des réglages).
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
});

const NOT_CONFIGURED = "L'IA n'est pas encore configurée pour votre organisation.";
const ASK_ADMIN = "Demandez à un administrateur de l'organisation d'ajouter la clé.";
const LINK = "Configurer l'IA";

async function failBrief(error: unknown) {
  procedures.aiDraftBrief.mockRejectedValue(error);
  await openFraming();
  await writeIdea(IDEA);
  await userEvent.click(screen.getByRole("button", { name: GENERATE }));
  return screen.findByRole("alert");
}
async function failPropose(error: unknown) {
  procedures.aiProposeFeatures.mockRejectedValue(error);
  await openFraming();
  await generateBrief();
  await userEvent.click(screen.getByRole("button", { name: PROPOSE }));
  return screen.findByRole("alert");
}

const REASONS = [
  ["missing", "Aucune clé n'a été enregistrée."],
  ["invalidated", "La clé enregistrée a été refusée par le fournisseur et a été désactivée."],
  ["undecryptable", "La clé enregistrée est illisible : il faut la saisir à nouveau."],
] as const;

describe("propriétaire et administrateur : lien « Configurer l'IA »", () => {
  const CASES = (["owner", "admin"] as const).flatMap((role) =>
    REASONS.map(([reason, detail]) => [role, reason, detail] as const),
  );
  it.each(CASES)(
    "%s, raison %s : vrai lien vers /settings/ai, texte « Demandez... » absent",
    async (role, reason, detail) => {
      serveFraming(role);
      const alert = await failBrief(apiError("LLM_NOT_CONFIGURED", { reason }));
      expect(alert).toHaveTextContent(NOT_CONFIGURED);
      expect(alert).toHaveTextContent(detail);
      expect(within(alert).getByRole("link", { name: LINK })).toHaveAttribute(
        "href",
        "/settings/ai",
      );
      expect(alert).not.toHaveTextContent(ASK_ADMIN);
      expect(screen.getAllByRole("alert")).toHaveLength(1);
    },
  );

  it("le lien est un <a>, dans l'alerte, de 44 px sous 768 px", async () => {
    serveFraming("owner");
    const alert = await failBrief(apiError("LLM_NOT_CONFIGURED", { reason: "missing" }));
    const link = within(alert).getByRole("link", { name: LINK });
    expect(link.tagName).toBe("A");
    expect(link.className).toMatch(/\bh-11\b|\bmin-h-11\b/);
    expect(link.className).toMatch(/md:h-9|md:min-h-9/);
  });

  it("clé refusée en cours d'usage (provider auth) : même lien, texte dédié", async () => {
    serveFraming("admin");
    const alert = await failBrief(apiError("LLM_PROVIDER_ERROR", { reason: "auth" }));
    expect(alert).toHaveTextContent(
      "Le fournisseur a refusé la clé de l'organisation. Elle est désactivée jusqu'à ce qu'un administrateur la remplace.",
    );
    expect(within(alert).getByRole("link", { name: LINK })).toHaveAttribute("href", "/settings/ai");
    expect(alert).not.toHaveTextContent(ASK_ADMIN);
  });

  it("à l'étape des propositions aussi, saisie et brouillon conservés", async () => {
    serveFraming("owner");
    const alert = await failPropose(apiError("LLM_NOT_CONFIGURED", { reason: "missing" }));
    expect(within(alert).getByRole("link", { name: LINK })).toHaveAttribute("href", "/settings/ai");
    expect(screen.getByRole("textbox", { name: /^Titre/ })).toHaveValue("Portail de réservation");
  });
});

describe("autres rôles : texte inchangé, jamais de lien", () => {
  it.each(["dev", "designer"] as const)("%s", async (role) => {
    serveFraming(role);
    const alert = await failBrief(apiError("LLM_NOT_CONFIGURED", { reason: "missing" }));
    expect(alert).toHaveTextContent(NOT_CONFIGURED);
    expect(alert).toHaveTextContent(ASK_ADMIN);
    expect(within(alert).queryByRole("link")).not.toBeInTheDocument();
    expect(alert).not.toHaveTextContent(LINK);
  });

  it("rôle inconnu (organization.list en attente) : texte « Demandez... », pas de lien (fail-closed)", async () => {
    serveFraming("dev");
    procedures.organizationList.mockReturnValue(new Promise(() => undefined));
    procedures.aiDraftBrief.mockRejectedValue(
      apiError("LLM_NOT_CONFIGURED", { reason: "missing" }),
    );
    // Le rôle n'étant pas connu, l'écran de cadrage reste en chargement : aucun lien « Configurer l'IA » nulle part.
    openFraming().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByRole("link", { name: LINK })).not.toBeInTheDocument();
  });
});
