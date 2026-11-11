import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { inputsOf } from "./support/features.tsx";
import { fake, many, renderTeam, serveProposals } from "./support/proposals.tsx";
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

/** TK-99b : relecture à plat et en volume, décisions, enregistrement (fiche §3 critères 7 à 13). */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
});

const review = (search = "?view=review") => renderTeam(search);
const banner = () => findNamed("group", "Mode relecture");
const accept = () => screen.findByRole("button", { name: /^Accepter/ });
const statusText = () => document.querySelector("[data-slot=proposal-review] [role=status]");

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Relecture à plat (12 propositions)", () => {
  beforeEach(() => serveProposals(many(12)));

  it("bandeau de décompte, sans groupe ni « Accepter les N restantes »", async () => {
    review();
    expect((await banner()).textContent).toContain("12 propositions");
    expect((await banner()).textContent).toContain("12 à relire");
    expect(screen.queryByRole("button", { name: /Accepter les/ })).not.toBeInTheDocument();
    expect(document.querySelector("[aria-expanded]")).toBeNull();
  });

  it("Accepter décide côté serveur (`accept`), annonce la décision et met à jour le bandeau", async () => {
    review();
    await userEvent.click(await accept());
    await waitFor(() => expect(procedures.proposalDecide).toHaveBeenCalledTimes(1));
    expect(inputsOf(procedures.proposalDecide)[0]).toMatchObject({ decision: "accept" });
    await waitFor(() => expect(statusText()?.textContent).toMatch(/P-001 acceptée/));
    await waitFor(async () => expect((await banner()).textContent).toContain("1 acceptée"));
  });

  it("raccourcis A et R hors champ de saisie", async () => {
    review();
    await accept();
    await userEvent.keyboard("a");
    await waitFor(() =>
      expect(inputsOf(procedures.proposalDecide)[0]).toMatchObject({ decision: "accept" }),
    );
    await userEvent.keyboard("r");
    await waitFor(() => expect(procedures.proposalDecide).toHaveBeenCalledTimes(2));
    expect(inputsOf(procedures.proposalDecide)[1]).toMatchObject({ decision: "reject" });
  });

  it("Modifier : l'éditeur valide puis accepte avec le contenu corrigé, sans champ en trop", async () => {
    review();
    await userEvent.click(await findNamed("button", "Modifier"));
    const title = await screen.findByLabelText("Titre");
    await userEvent.clear(title);
    await userEvent.type(title, "Titre corrigé");
    await userEvent.click(screen.getByRole("button", { name: "Terminer la modification" }));
    await waitFor(() => expect(procedures.proposalDecide).toHaveBeenCalledTimes(1));
    const input = inputsOf(procedures.proposalDecide)[0] as { decision: string; edited: object };
    expect(input.decision).toBe("accept");
    expect(input.edited).toMatchObject({ title: "Titre corrigé", priority: "must" });
    expect(Object.keys(input.edited).sort()).toEqual([
      "criteria",
      "description",
      "priority",
      "title",
    ]);
  });

  it("titre vidé : l'éditeur refuse, rien n'est décidé", async () => {
    review();
    await userEvent.click(await findNamed("button", "Modifier"));
    await userEvent.clear(await screen.findByLabelText("Titre"));
    await userEvent.click(screen.getByRole("button", { name: "Terminer la modification" }));
    expect(await screen.findByRole("group", { name: "Erreurs de la proposition" })).toBeVisible();
    expect(procedures.proposalDecide).not.toHaveBeenCalled();
  });

  it("demande de modification à l'agent : ai.reviseProposal ; 409 proposal_applied géré sans alerte", async () => {
    procedures.aiReviseProposal.mockRejectedValue(
      apiError("CONFLICT", { reason: "proposal_applied" }),
    );
    review();
    await userEvent.type(
      await screen.findByRole("textbox", { name: /modification/i }),
      "plus court",
    );
    await userEvent.click(screen.getByRole("button", { name: /Demander|Envoyer/ }));
    await waitFor(() => expect(procedures.aiReviseProposal).toHaveBeenCalledTimes(1));
    expect(inputsOf(procedures.aiReviseProposal)[0]).toMatchObject({ instruction: "plus court" });
    await waitFor(() => expect(statusText()?.textContent).toMatch(/déjà enregistrée/));
  });

  it("403 du serveur : « Vous n'avez pas accès »", async () => {
    procedures.proposalDecide.mockRejectedValue(apiError("FORBIDDEN"));
    review();
    await userEvent.click(await accept());
    expect(await screen.findByText(/Vous n'avez pas accès/)).toBeVisible();
  });
});

describe("Relecture en volume (40 propositions, 4 zones)", () => {
  beforeEach(() => serveProposals(many(40, 4)));

  it("groupes repliables, filtre « À relire » par défaut, 8 éléments par groupe", async () => {
    review();
    const headers = await screen.findAllByRole("button", { expanded: true });
    expect(headers.length).toBeGreaterThanOrEqual(4);
    const calls = inputsOf(procedures.proposalList).filter((c) => c.group);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.status === "pending" && c.limit === 8)).toBe(true);
  });

  it("« Afficher 20 de plus » relit le groupe avec une limite de 28", async () => {
    review();
    await userEvent.click(
      (await screen.findAllByRole("button", { name: /Afficher \d+ de plus/ }))[0] as HTMLElement,
    );
    await waitFor(() =>
      expect(inputsOf(procedures.proposalList).some((c) => c.limit === 28)).toBe(true),
    );
  });

  it("« Accepter les N restantes » : decideMany avec expectedPending, annonce du résultat", async () => {
    review();
    await userEvent.click(
      (
        await screen.findAllByRole("button", { name: /Accepter les 10 restantes/ })
      )[0] as HTMLElement,
    );
    await waitFor(() => expect(procedures.proposalDecideMany).toHaveBeenCalledTimes(1));
    expect(inputsOf(procedures.proposalDecideMany)[0]).toMatchObject({
      decision: "accept",
      expectedPending: 10,
      group: "feature:Zone 1",
    });
    await waitFor(() =>
      expect(statusText()?.textContent).toMatch(/10 propositions acceptées dans/),
    );
  });

  it("409 PROPOSAL_COUNT_CHANGED : recharge et dit « Le groupe a changé : N à relire. »", async () => {
    procedures.proposalDecideMany.mockRejectedValue(
      apiError("PROPOSAL_COUNT_CHANGED", { expected: 10, actual: 5 }),
    );
    review();
    await userEvent.click(
      (
        await screen.findAllByRole("button", { name: /Accepter les 10 restantes/ })
      )[0] as HTMLElement,
    );
    await waitFor(() =>
      expect(statusText()?.textContent).toContain("Le groupe a changé : 5 à relire."),
    );
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Enregistrement", () => {
  it("rien n'est écrit sans clic ; ≤ 200 : un seul specBatch.submit, proposalIds et clé d'idempotence", async () => {
    serveProposals([
      fake(1, { status: "accepted" }),
      fake(2, {
        status: "accepted",
        kind: "criteria",
        content: { specId: "F-004", criteria: [fake(1).content.criteria].flat() },
      }),
      fake(3),
    ]);
    review();
    const save = await findNamed("button", "Enregistrer 2 dans la spec");
    expect(procedures.specBatchSubmit).not.toHaveBeenCalled();
    await userEvent.click(save);
    await waitFor(() => expect(procedures.specBatchSubmit).toHaveBeenCalledTimes(1));
    const input = inputsOf(procedures.specBatchSubmit)[0] as {
      operations: Array<{ kind: string }>;
      proposalIds: string[];
      idempotencyKey: string;
    };
    expect(input.operations.map((o) => o.kind)).toEqual(["feature.create", "feature.update"]);
    expect(input.proposalIds).toHaveLength(2);
    expect(input.idempotencyKey).toMatch(/^[A-Za-z0-9._:-]{1,128}$/);
    await waitFor(() => expect(statusText()?.textContent).toContain("2 enregistrées dans la spec"));
  });

  it("> 200 acceptées : un commit par groupe (200 au plus chacun), un récapitulatif unique", async () => {
    serveProposals(many(250, 10, () => ({ status: "accepted" })));
    review();
    await userEvent.click(await findNamed("button", "Enregistrer 250 dans la spec"));
    await waitFor(() => expect(procedures.specBatchSubmit).toHaveBeenCalledTimes(10), {
      timeout: 15000,
    });
    for (const call of inputsOf(procedures.specBatchSubmit)) {
      expect((call.operations as unknown[]).length).toBeLessThanOrEqual(200);
    }
    const keys = inputsOf(procedures.specBatchSubmit).map((c) => c.idempotencyKey);
    expect(new Set(keys).size).toBe(10);
    await waitFor(
      () => expect(statusText()?.textContent).toContain("250 enregistrées dans la spec"),
      { timeout: 15000 },
    );
  });

  it("un lot refusé arrête la suite : « N enregistrées, M à reprendre »", async () => {
    serveProposals(many(250, 10, () => ({ status: "accepted" })));
    const base = procedures.specBatchSubmit.getMockImplementation() as (
      i: never,
    ) => Promise<unknown>;
    procedures.specBatchSubmit.mockImplementation(async (input: never) =>
      procedures.specBatchSubmit.mock.calls.length === 2
        ? Promise.reject(apiError("VALIDATION"))
        : base(input),
    );
    review();
    await userEvent.click(await findNamed("button", "Enregistrer 250 dans la spec"));
    await waitFor(
      () => expect(statusText()?.textContent).toContain("25 enregistrées, 225 à reprendre"),
      {
        timeout: 15000,
      },
    );
    expect(procedures.specBatchSubmit).toHaveBeenCalledTimes(2);
  });
});

describe("Lot échoué (B320) et texte brut", () => {
  it("proposition liée à un lot échoué : « à reprendre », sans bouton d'action", async () => {
    const batch = "0190dddd-0000-7000-8000-000000000001";
    serveProposals([fake(1, { status: "accepted", appliedBatchId: batch })]);
    procedures.specBatchGet.mockResolvedValue({ id: batch, status: "failed" });
    review();
    const note = await screen.findAllByText(/Enregistrement échoué/);
    expect(note.length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /^Accepter$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remettre à relire/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Rejeter/ })).not.toBeInTheDocument();
  });

  it("sortie hostile : aucun lien, href, image ni HTML dans la relecture", async () => {
    const hostile =
      '[x](javascript:alert(1)) <a href="https://x">y</a> https://evil.example <img src=x onerror=alert(1)>';
    serveProposals([
      fake(1, {
        title: hostile,
        rationale: hostile,
        content: {
          title: hostile,
          priority: "must",
          description: hostile,
          criteria: [{ title: hostile, steps: [{ type: "quand", text: hostile }] }],
        },
      }),
    ]);
    review();
    await screen.findByRole("article");
    const root = document.querySelector("[data-slot=proposal-review]") as HTMLElement;
    expect(root.querySelector("a, [href], img")).toBeNull();
    expect(root.textContent).toContain("<a href");
    expect(within(root).getAllByText(/evil\.example/).length).toBeGreaterThan(0);
  });
});
