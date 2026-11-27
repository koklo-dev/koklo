import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commitOnSubmit, renderSecurity, serveSecurity } from "./support/security.tsx";
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

describe("onglet Exigences", () => {
  it("niveaux en radiogroup (recommandé marqué), couverture, secrets et blocages", async () => {
    serveSecurity("owner");
    renderSecurity({ search: "tab=reqs" });
    const group = await screen.findByRole("radiogroup", { name: "Niveau ASVS" });
    expect(within(group).getByRole("radio", { name: "Niveau 2 · recommandé" })).toBeChecked();
    expect(screen.getByRole("row", { name: /Journalisation et alertes/ })).toHaveTextContent(
      "2 sans réponse",
    );
    expect(screen.getByRole("row", { name: /API et services web/ })).toHaveTextContent(
      "À vérifier",
    );
    expect(screen.getByRole("region", { name: "Secrets et dépendances" })).toHaveTextContent(
      "90 jours",
    );
    expect(
      screen.getByRole("region", { name: "Une pull request ne fusionne pas si…" }),
    ).toHaveTextContent("un secret apparaît dans le code");
  });

  it("choisir un niveau écrit tout de suite et l'annonce", async () => {
    serveSecurity("owner");
    commitOnSubmit(procedures.securityAsvsSetLevel);
    procedures.specBatchGet.mockResolvedValue({ status: "committed", results: [] });
    renderSecurity({ search: "tab=reqs" });
    await userEvent.setup().click(await screen.findByRole("radio", { name: "Niveau 3" }));
    await waitFor(() =>
      expect(procedures.securityAsvsSetLevel.mock.calls[0]?.[0]).toMatchObject({ level: 3 }),
    );
    expect(await screen.findByText("Niveau enregistré")).toBeInTheDocument();
  });

  it("designer : niveaux lus, aucun changement", async () => {
    serveSecurity("designer");
    renderSecurity({ search: "tab=reqs" });
    await userEvent.setup().click(await screen.findByRole("radio", { name: "Niveau 3" }));
    expect(procedures.securityAsvsSetLevel).not.toHaveBeenCalled();
  });
});
