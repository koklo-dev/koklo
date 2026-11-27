import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STEP_REPORT, STEPS_LINE, SUMMARY_LINE, serveLaunch } from "./support/launch.ts";
import { fake, serveProposals } from "./support/proposals.tsx";
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

const NO_STACK = "aucun choix de stack : ajoutez-en un avant de valider";

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("TK-115b : validation sans choix de stack et bilan", () => {
  it("aucun choix : « Valider » désactivé, relié à sa raison", async () => {
    // Des opérations sans choix : le serveur dit « à valider ».
    serveTechnical("owner", { choices: [] });
    status("pending");
    renderTechnical();
    const reason = await screen.findByText(new RegExp(NO_STACK));
    const button = await validate();
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-describedby", reason.id);
    expect(reason.id).not.toBe("");
  });

  it("à revoir sans choix : la raison reste au résumé et reliée", async () => {
    serveTechnical("owner", { choices: [] });
    procedures.specDeliverables.mockResolvedValue(
      specDeliverables({
        open: new Set(["technical", "architecture"]),
        status: { technical: "revise" },
      }),
    );
    procedures.reviewList.mockResolvedValue({
      items: [
        {
          status: "approved",
          current: true,
          authorName: "Moussa",
          createdAt: "2026-11-05T10:00:00.000Z",
          sha: "c".repeat(40),
          targetKind: "deliverable",
          targetRef: "technical",
        },
      ],
      nextCursor: null,
    });
    renderTechnical();
    const reason = await screen.findByText(
      `Validé le 5 nov., l'architecture a changé depuis · ${NO_STACK}`,
    );
    expect(await validate()).toHaveAttribute("aria-describedby", reason.id);
    expect(await validate()).toBeDisabled();
  });

  it("tout tranché : aucune description sur « Valider »", async () => {
    serveTechnical("owner", { choices: CHOSEN });
    renderTechnical();
    await waitFor(async () => expect(await validate()).toBeEnabled());
    expect(await validate()).not.toHaveAttribute("aria-describedby");
  });

  it("refus « stack_missing » : message en alerte", async () => {
    serveTechnical("owner", { choices: CHOSEN });
    procedures.reviewSubmit.mockRejectedValue(apiError("CONFLICT", { reason: "stack_missing" }));
    renderTechnical();
    await waitFor(async () => expect(await validate()).toBeEnabled());
    await userEvent.click(await validate());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Aucun choix de stack : ajoutez un choix technique avant de valider le cahier.",
    );
  });

  it("Relecture : le bilan en note au-dessus des groupes", async () => {
    serveTechnical("owner");
    serveProposals([fake(1, { kind: "stack", title: "Fournisseur SMS", content: {} })], {
      report: STEP_REPORT,
    });
    renderTechnical({ search: "view=review" });
    const note = (await screen.findByText(SUMMARY_LINE)).closest('[role="note"]');
    expect(note).toHaveTextContent(STEPS_LINE);
    const first = screen.getByRole("button", { name: /Fournisseur SMS/ });
    expect(
      (note as Node).compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("Génération : « Étapes traitées 4/9 · écartées 1 » sous le bandeau", async () => {
    serveTechnical("owner");
    serveLaunch({ ...STEP_REPORT, zonesRequested: 9, zonesDone: 3, zonesDiscarded: 1 }, "running");
    renderTechnical({ search: "view=review" });
    const detail = await screen.findByText("Étapes traitées 4/9 · écartées 1");
    expect(detail.closest('[role="status"]')).toHaveTextContent("L'agent rédige le cahier");
  });
});
