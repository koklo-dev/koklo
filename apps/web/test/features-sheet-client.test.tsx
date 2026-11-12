import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { feature, featureDetail, renderClient, serveClient } from "./support/client-space.tsx";
import { GIT_VOCABULARY } from "./support/features.tsx";
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
 * TK-48 / 48d, AC-48-28, reprise pour la vue client de TK-104 : la vue client et business ne croise jamais de vocabulaire
 * git (commit, branche, SHA entier, chemin de fichier, code d'erreur technique). Contrôles sur le DOM entier (texte ET
 * attributs). La seule trace de version est la note « date · 7 caractères » (B348).
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
});

const TECHNICAL_VALUE =
  /a1b2c3d4e5f6|\.ya?ml|\.koklo|features\/F-|spec_too_large|SPEC_INDEX_FAILED|PROVIDER_/i;

/** Texte visible + valeurs de tous les attributs (aria-label, title, href, alt, data-*). */
function everythingVisible(): string {
  const attributes = Array.from(document.body.querySelectorAll("*")).flatMap((element) =>
    Array.from(element.attributes)
      .filter((attribute) => !["class", "style"].includes(attribute.name))
      .map((attribute) => attribute.value),
  );
  return [document.body.textContent ?? "", ...attributes].join(" | ");
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Vue client et business : aucun vocabulaire technique", () => {
  it.each(["client", "business"] as const)(
    "%s : liste et fiche, dans le texte comme dans les attributs",
    async (role) => {
      serveClient(role, { canValidate: role === "client" });
      renderClient();
      await userEvent.click(await screen.findByRole("button", { name: /F-001/ }));
      await screen.findByRole("complementary", { name: "Fiche de la fonctionnalité" });
      // La note de version porte « a1b2c3d » (7 caractères) : seule exception, jamais le SHA entier.
      const text = everythingVisible().replace(/a1b2c3d(?![0-9a-f])/g, "");
      expect(text).not.toMatch(GIT_VOCABULARY);
      expect(text).not.toMatch(TECHNICAL_VALUE);
    },
  );

  it("la fiche ne montre ni jauge d'avancement, ni pied technique, ni « Modifier »", async () => {
    serveClient();
    renderClient();
    await userEvent.click(await screen.findByRole("button", { name: /F-001/ }));
    const fiche = await screen.findByRole("complementary", { name: "Fiche de la fonctionnalité" });
    expect(within(fiche).queryByRole("button", { name: "Modifier" })).toBeNull();
    expect(fiche.textContent).not.toMatch(
      /Implémentée|Spécifiée|Proposée par l'agent|Enregistrée dans la spec/,
    );
  });

  it.each([
    "INTERNAL",
    "PROVIDER_AUTH_EXPIRED",
    "PROVIDER_RATE_LIMITED",
    "SPEC_INDEX_FAILED",
    "UNAVAILABLE",
  ])(
    "lecture en erreur %s : une phrase en français, aucun code ni valeur technique",
    async (code) => {
      serveClient();
      procedures.clientSpaceProgress.mockRejectedValue(
        apiError(code, { errorCode: "x", commitSha: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678" }),
      );
      renderClient();
      expect(await screen.findByText("Impossible de charger le cahier")).toBeInTheDocument();
      expect(everythingVisible()).not.toMatch(GIT_VOCABULARY);
    },
  );

  it("fiche en erreur : « Impossible de charger la fonctionnalité » sans code", async () => {
    serveClient();
    procedures.clientSpaceFeature.mockRejectedValue(apiError("PROVIDER_UNAVAILABLE"));
    renderClient();
    await userEvent.click(await screen.findByRole("button", { name: /F-001/ }));
    expect(await screen.findByText("Impossible de charger la fonctionnalité")).toBeInTheDocument();
    expect(everythingVisible()).not.toMatch(/PROVIDER_/);
  });

  it("une demande de changement du client n'est jamais interprétée comme du balisage", async () => {
    serveClient();
    procedures.clientSpaceFeatures.mockResolvedValue({
      items: [feature(1)],
      nextCursor: null,
      version: "v1",
      total: 1,
      offset: 0,
    });
    procedures.clientSpaceFeature.mockResolvedValue(
      featureDetail("F-001", { validation: "to_revise" }),
    );
    procedures.reviewList.mockResolvedValue({
      items: [
        { status: "changes_requested", current: true, comment: "<img src=x onerror=alert(1)>" },
      ],
      nextCursor: null,
    });
    renderClient();
    await userEvent.click(await screen.findByRole("button", { name: /F-001/ }));
    expect(await screen.findByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});
