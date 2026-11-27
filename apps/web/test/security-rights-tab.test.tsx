import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RIGHTS, renderSecurity, serveSecurity } from "./support/security.tsx";
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

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
});

describe("onglet Droits", () => {
  it("matrice, règles de propriété et compte des scénarios", async () => {
    serveSecurity("owner");
    renderSecurity({ search: "tab=rights" });
    expect(await screen.findByRole("table", { name: "Matrice des droits" })).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Cliente : restreint (Les siens)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Cliente : non" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Règles de propriété" })).toBeVisible();
    expect(screen.getByText("Toute lecture vérifie le salon du compte connecté.")).toBeVisible();
    expect(screen.getByRole("region", { name: "Scénarios d'abus générés" })).toHaveTextContent("2");
    expect(screen.getByText(/La matrice part des rôles du cahier fonctionnel/)).toBeVisible();
  });

  it("sans rôle : « Aucun rôle dans le cahier fonctionnel »", async () => {
    serveSecurity("owner");
    procedures.securityRightsGet.mockResolvedValue({ ...RIGHTS, roles: [], actions: [] });
    renderSecurity({ search: "tab=rights" });
    expect(await screen.findByText("Aucun rôle dans le cahier fonctionnel")).toBeVisible();
  });
});
