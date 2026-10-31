import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DETAIL, renderFeatures, serve, visibleText } from "./support/features.tsx";
import { findRole } from "./support/wait.ts";
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

/** TK-48 / 48d, erreurs de la fiche (design/screens/S-features.md §4.11). La liste reste consultable. */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  serve();
});

const reject = (code: string, data?: unknown) => () => Promise.reject(apiError(code, data));

async function openWith(error: () => Promise<never>, role: Parameters<typeof serve>[0] = "owner") {
  serve(role);
  procedures.specGetFeature.mockImplementation(error);
  renderFeatures({ search: "?feature=F-001" });
  const dialog = await findRole("dialog");
  const alert = await findRole("alert", { from: dialog });
  return { dialog, alert };
}

describe("PROVIDER_UNAVAILABLE (503)", () => {
  it("« Le détail est momentanément indisponible », liste consultable, en-tête conservé, « Réessayer »", async () => {
    const { dialog, alert } = await openWith(reject("PROVIDER_UNAVAILABLE"), "dev");
    expect(alert).toHaveTextContent("Le détail est momentanément indisponible");
    expect(alert).toHaveTextContent("La liste reste consultable. Réessayez dans un instant.");
    expect(alert.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(
      within(dialog).getByRole("heading", { level: 2, name: "Connexion par e-mail" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Brouillon")).toBeInTheDocument();
    expect(within(dialog).getByText("Indispensable")).toBeInTheDocument();
    expect(screen.getByRole("table", { hidden: true })).toBeInTheDocument();
  });

  it("« Réessayer » rappelle spec.getFeature et affiche la fiche", async () => {
    const { dialog, alert } = await openWith(reject("PROVIDER_UNAVAILABLE"));
    procedures.specGetFeature.mockResolvedValue(DETAIL);
    await userEvent.click(within(alert).getByRole("button", { name: "Réessayer" }));
    expect(await within(dialog).findByText("Description")).toBeInTheDocument();
    expect(procedures.specGetFeature).toHaveBeenCalledTimes(2);
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(["owner", "admin"] as const)(
    "%s : « Vérifiez l'état de l'application GitHub » avec lien /github",
    async (role) => {
      const { alert } = await openWith(reject("PROVIDER_UNAVAILABLE"), role);
      expect(alert).toHaveTextContent("Vérifiez l'état de l'application GitHub");
      expect(within(alert).getByRole("link", { name: /GitHub/ })).toHaveAttribute(
        "href",
        "/github",
      );
    },
  );

  it.each(["dev", "designer"] as const)("%s : la consigne sans lien /github", async (role) => {
    const { alert } = await openWith(reject("PROVIDER_UNAVAILABLE"), role);
    expect(alert).toHaveTextContent("Vérifiez l'état de l'application GitHub");
    expect(within(alert).queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("PROVIDER_RATE_LIMITED (429)", () => {
  it("« Trop de demandes pour le moment. Réessayez dans un instant. » + « Réessayer », sans compte à rebours", async () => {
    const { alert } = await openWith(reject("PROVIDER_RATE_LIMITED", { retryAfterMs: 42000 }));
    expect(alert).toHaveTextContent("Trop de demandes pour le moment. Réessayez dans un instant.");
    expect(within(alert).getByRole("button", { name: "Réessayer" })).toBeEnabled();
    expect(alert).not.toHaveTextContent(/42|seconde/);
  });
});

describe("PROVIDER_AUTH_EXPIRED (403, l'« accès refusé » côté fournisseur)", () => {
  const error = reject("PROVIDER_AUTH_EXPIRED", { kind: "installation", refreshable: false });

  it.each(["owner", "admin"] as const)(
    "%s : « Koklo n'a plus accès au dépôt de spec », lien « Ouvrir la page GitHub » vers /github",
    async (role) => {
      const { alert } = await openWith(error, role);
      expect(alert).toHaveTextContent("Koklo n'a plus accès au dépôt de spec");
      expect(alert).toHaveTextContent(
        "Autorisez de nouveau Koklo sur GitHub, puis revenez à cette fiche.",
      );
      const link = within(alert).getByRole("link", { name: "Ouvrir la page GitHub" });
      expect(link.tagName).toBe("A");
      expect(link).toHaveAttribute("href", "/github");
    },
  );

  it.each(["dev", "designer", "client", "business"] as const)(
    "%s : « Demandez à un propriétaire ou à un administrateur… », aucun lien",
    async (role) => {
      const { alert } = await openWith(error, role);
      expect(alert).toHaveTextContent("Koklo n'a plus accès au dépôt de spec");
      expect(alert).toHaveTextContent(
        "Demandez à un propriétaire ou à un administrateur d'autoriser de nouveau Koklo.",
      );
      expect(within(alert).queryByRole("link")).not.toBeInTheDocument();
    },
  );

  it("la liste reste consultable derrière la fiche", async () => {
    await openWith(error);
    expect(screen.getByRole("link", { name: "Tableau kanban", hidden: true })).toBeInTheDocument();
  });
});

describe("NOT_FOUND (la fonctionnalité a disparu de la spec)", () => {
  it("« Cette fonctionnalité n'existe plus dans la spec. » + « Fermer », liste relue en arrière-plan", async () => {
    const { dialog, alert } = await openWith(reject("NOT_FOUND"));
    expect(alert).toHaveTextContent("Cette fonctionnalité n'existe plus dans la spec.");
    expect(within(alert).queryByRole("button", { name: "Réessayer" })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(procedures.specListFeatures.mock.calls.length).toBeGreaterThanOrEqual(2),
    );
    await userEvent.click(
      within(dialog).getAllByRole("button", { name: "Fermer" })[0] as HTMLElement,
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.location.search).toBe("");
  });
});

describe("SPEC_INDEX_FAILED (409)", () => {
  it("rendu de l'état « La spec n'a pas pu être lue » dans la fiche", async () => {
    const { alert } = await openWith(
      reject("SPEC_INDEX_FAILED", { errorCode: "spec_too_large", commitSha: "b".repeat(40) }),
    );
    expect(alert).toHaveTextContent("La spec n'a pas pu être lue");
    expect(alert).toHaveTextContent(
      "La spec de ce projet est trop volumineuse pour être lue par Koklo.",
    );
  });
});

describe("Autre erreur", () => {
  it.each([
    ["INTERNAL", reject("INTERNAL")],
    ["réseau", () => Promise.reject(new TypeError("fetch failed"))],
  ])("%s : « Impossible de charger la fiche » + « Réessayer »", async (_label, error) => {
    const { dialog, alert } = await openWith(error);
    expect(alert).toHaveTextContent("Impossible de charger la fiche");
    expect(visibleText(dialog)).not.toMatch(/fetch failed|INTERNAL/);
    expect(within(alert).getByRole("button", { name: "Réessayer" })).toBeEnabled();
  });

  it("une seule alerte à la fois dans la fiche", async () => {
    const { dialog } = await openWith(reject("INTERNAL"));
    expect(within(dialog).getAllByRole("alert")).toHaveLength(1);
  });
});
