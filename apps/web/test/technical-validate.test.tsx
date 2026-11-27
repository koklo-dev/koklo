import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderTechnical, STACK, serveTechnical } from "./support/technical.tsx";
import {
  apiError,
  polyfillRadix,
  procedures,
  resetWebMocks,
  specDeliverables,
  watchUrl,
} from "./support/web-mocks.ts";

/** TK-116 lot B : « Valider » le cahier technique et les états d'en-tête (maquette 14 l.774-817). */
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

const CHOSEN = STACK.filter((choice) => choice.status === "chosen");
const validate = () => screen.findByRole("button", { name: "Valider" });
const status = (value: "pending" | "validated") =>
  procedures.specDeliverables.mockResolvedValue(
    specDeliverables({
      open: new Set(["functional", "data", "architecture", "technical", "design"]),
      validated: ["functional", "data", "architecture"],
      status: { technical: value },
    }),
  );

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Valider le cahier technique", () => {
  it("un choix à trancher : « Valider » désactivé, la raison dans le résumé", async () => {
    serveTechnical("owner");
    renderTechnical();
    await waitFor(async () => expect(await validate()).toBeDisabled());
    expect(await screen.findByText(/1 choix à trancher avant de valider/)).toBeInTheDocument();
  });

  it("tous tranchés : envoie le SHA de tête, annonce « Cahier technique validé »", async () => {
    serveTechnical("owner", { choices: CHOSEN });
    procedures.reviewSubmit.mockResolvedValue({ id: "r1" });
    renderTechnical();
    await waitFor(async () => expect(await validate()).toBeEnabled());
    await userEvent.click(await validate());
    await waitFor(() => expect(procedures.reviewSubmit).toHaveBeenCalled());
    expect(procedures.reviewSubmit.mock.calls[0]?.[0]).toMatchObject({
      targetKind: "deliverable",
      targetRef: "technical",
      status: "approved",
      version: expect.stringMatching(/^[0-9a-f]+$/),
    });
    expect(await screen.findByText("Cahier technique validé")).toBeInTheDocument();
  });

  it("refus « choices_open » : message en alerte, rien d'annoncé", async () => {
    serveTechnical("owner", { choices: CHOSEN });
    procedures.reviewSubmit.mockRejectedValue(apiError("CONFLICT", { reason: "choices_open" }));
    renderTechnical({ search: "tab=api" });
    await waitFor(async () => expect(await validate()).toBeEnabled());
    await userEvent.click(await validate());
    expect(
      await screen.findByText(
        "Un choix technique reste à trancher : tranchez-le avant de valider le cahier.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Un choix technique reste à trancher");
    expect(screen.queryByText("Cahier technique validé")).toBeNull();
  });

  it("validé : « Validé par <prénom> … », ajout en primaire, plus de « Valider »", async () => {
    serveTechnical("owner", { choices: CHOSEN });
    status("validated");
    procedures.reviewList.mockResolvedValue({
      items: [
        {
          current: true,
          status: "approved",
          authorName: "Moussa",
          createdAt: "2026-11-05T10:00:00.000Z",
          sha: "c07d2b4aaaa",
        },
      ],
      nextCursor: null,
    });
    renderTechnical();
    expect(await screen.findByText(/^Validé par Moussa le .* · version c07d2b4$/)).toBeVisible();
    const add = await screen.findByRole("button", { name: "Nouveau choix" });
    expect(add.className).toContain("bg-primary");
    expect(screen.queryByRole("button", { name: "Valider" })).toBeNull();
  });

  it("onglet Document : « Valider » sans ajout", async () => {
    serveTechnical("owner");
    renderTechnical({ search: "tab=document" });
    expect(await validate()).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Nouve/ })).toBeNull();
  });

  it("designer : aucun « Valider »", async () => {
    serveTechnical("designer");
    renderTechnical();
    await screen.findByRole("button", { name: /Fournisseur SMS/ });
    expect(screen.queryByRole("button", { name: "Valider" })).toBeNull();
  });

  it("comptes d'en-tête et d'onglet : opérations sans le REST (total d'ops.list)", async () => {
    serveTechnical("owner", { counts: { endpoints: 140 } });
    renderTechnical();
    expect(await screen.findByText(/132 opérations/)).toBeInTheDocument();
    const tabs = screen.getByRole("navigation", { name: "Sections du cahier technique" });
    await waitFor(() =>
      expect(within(tabs).getByRole("link", { name: /API/ })).toHaveTextContent("API132"),
    );
    expect(procedures.specTechnicalOpsList.mock.calls[0]?.[0]).toMatchObject({ limit: 1 });
  });
});
