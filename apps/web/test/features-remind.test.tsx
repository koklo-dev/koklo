import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderClient, serveClient } from "./support/client-space.tsx";
import {
  apiError,
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

/** TK-104 lot B (critère 12, B352, D1) : « Relancer <prénom> » côté équipe, `role=status` « Rappel envoyé ». */
function pending() {
  procedures.specDeliverables.mockResolvedValue({
    ...specDeliverables(),
    deliverables: specDeliverables().deliverables.map((item) =>
      item.key === "functional" ? { ...item, status: "pending" } : item,
    ),
  });
}

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  procedures.reviewRemind.mockResolvedValue({ reminded: 1 });
});

describe("Équipe : « Relancer »", () => {
  it.each(["owner", "admin"] as const)(
    "%s : « Relancer Marie » envoie le rappel et annonce « Rappel envoyé »",
    async (role) => {
      serveClient(role, { canValidate: false });
      pending();
      renderClient();
      await userEvent.click(await screen.findByRole("button", { name: "Relancer Marie" }));
      expect(procedures.reviewRemind.mock.calls[0]?.[0]).toEqual({ projectId: expect.any(String) });
      expect(await screen.findByText("Rappel envoyé")).toBeInTheDocument();
    },
  );

  it("un rappel déjà parti aujourd'hui est dit comme tel", async () => {
    serveClient("owner", { canValidate: false });
    pending();
    procedures.reviewRemind.mockResolvedValue({ reminded: 0 });
    renderClient();
    await userEvent.click(await screen.findByRole("button", { name: "Relancer Marie" }));
    expect(await screen.findByText("Le client a déjà été relancé aujourd'hui")).toBeInTheDocument();
  });

  it("sans client invité : pas de « Relancer », mais l'accès « Valider à la place du client »", async () => {
    serveClient("owner", { hasClient: false, canValidate: true });
    pending();
    renderClient();
    expect(
      await screen.findByRole("link", { name: "Valider à la place du client" }),
    ).toHaveAttribute("href", "?tab=features&vue=client");
    expect(screen.queryByRole("button", { name: /Relancer/ })).toBeNull();
  });

  it("dev et designer : ni « Relancer » ni lecture de la progression", async () => {
    for (const role of ["dev", "designer"] as const) {
      serveClient(role);
      pending();
      const { unmount } = renderClient();
      await screen.findByRole("heading", { level: 1 });
      expect(screen.queryByRole("button", { name: /Relancer/ })).toBeNull();
      unmount();
    }
    expect(procedures.clientSpaceProgress).not.toHaveBeenCalled();
  });

  it("la relance échouée est dite sans code technique", async () => {
    serveClient("owner", { canValidate: false });
    pending();
    procedures.reviewRemind.mockRejectedValue(apiError("CONFLICT", { reason: "no_client" }));
    renderClient();
    await userEvent.click(await screen.findByRole("button", { name: "Relancer Marie" }));
    expect(await screen.findByText("Aucun client n'est invité à ce projet.")).toBeInTheDocument();
  });
});
