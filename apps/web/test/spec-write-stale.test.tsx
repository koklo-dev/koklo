import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { followIndex } from "../src/lib/use-index-wait.ts";
import { advance, batch, conflictBatch, failedBatch, NEW_SHA } from "./support/feature-form.tsx";
import { head } from "./support/features.tsx";
import { renderTechnical, serveTechnical } from "./support/technical.tsx";
import { polyfillRadix, procedures, resetWebMocks, watchUrl } from "./support/web-mocks.ts";
import { DESKTOP, setViewport } from "./viewport.ts";

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

const SECOND = 1000;
const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
const choose = () => screen.findByRole("button", { name: "Choisir Brevo" });
const chosenBases = () =>
  procedures.specTechnicalStackChoose.mock.calls.map(
    (call) => (call[0] as { baseSha: string }).baseSha,
  );

/** La tête lue par l'écran, que le test fait avancer. */
let indexed = head();

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setViewport(DESKTOP);
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
  serveTechnical("owner");
  indexed = head();
  procedures.specHead.mockImplementation(async () => indexed);
});

afterEach(() => {
  vi.useRealTimers();
});

async function chooseRefused(): Promise<HTMLElement> {
  procedures.specTechnicalStackChoose.mockResolvedValue(conflictBatch("stale_base"));
  renderTechnical();
  await user().click(await choose());
  return screen.findByRole("alert");
}

describe("« Choisir » refusé parce que la spec a avancé (TK-115c)", () => {
  it("dit que la spec a changé, propose « Recharger » et aucun brouillon", async () => {
    const alert = await chooseRefused();
    expect(alert).toHaveTextContent("La spec a changé depuis l'affichage de cette page");
    expect(alert).toHaveTextContent(
      "Rien n'a été écrit. La version actuelle est relue : recommencez votre action.",
    );
    expect(within(alert).getByRole("button", { name: "Recharger" })).toBeVisible();
    expect(within(alert).queryByRole("button", { name: "Rouvrir le brouillon" })).toBeNull();
  });

  it("relit la version jusqu'à la nouvelle : le choix suivant part avec elle", async () => {
    const alert = await chooseRefused();
    indexed = head({ commitSha: NEW_SHA });
    await advance(6 * SECOND);
    await user().click(within(alert).getByRole("button", { name: "Recharger" }));
    expect(screen.queryByRole("alert")).toBeNull();
    await user().click(await choose());
    await waitFor(() => expect(chosenBases()).toHaveLength(2));
    expect(chosenBases()).toEqual([head().commitSha, NEW_SHA]);
  });
});

describe("« Choisir » en échec pour une autre raison (TK-115c)", () => {
  it("dit la raison et se ferme, sans brouillon", async () => {
    procedures.specTechnicalStackChoose.mockResolvedValue(failedBatch("PROVIDER_UNAVAILABLE"));
    renderTechnical();
    await user().click(await choose());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("GitHub est momentanément indisponible");
    expect(within(alert).queryByRole("button", { name: "Rouvrir le brouillon" })).toBeNull();
    await user().click(within(alert).getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("« Choisir » pendant que la liste rattrape la dernière écriture (TK-115c)", () => {
  it("reste désactivé tant que la version écrite n'est pas lue", async () => {
    procedures.specTechnicalStackChoose.mockResolvedValue(batch());
    renderTechnical();
    await user().click(await choose());
    await advance(31 * SECOND);
    expect(await choose()).toBeDisabled();
    indexed = head({ commitSha: NEW_SHA });
    await advance(6 * SECOND);
    await waitFor(async () => expect(await choose()).toBeEnabled());
  });
});

describe("suivi de la version après un enregistrement hors formulaire (TK-115c)", () => {
  it("relit `spec.head` jusqu'à la version écrite, puis relit la spec", async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    followIndex(client, "projet", NEW_SHA);
    await advance(5 * SECOND);
    expect(invalidate).not.toHaveBeenCalled();
    indexed = head({ commitSha: NEW_SHA });
    await advance(3 * SECOND);
    expect(invalidate).toHaveBeenCalledTimes(1);
    const reads = procedures.specHead.mock.calls.length;
    await advance(10 * SECOND);
    expect(procedures.specHead.mock.calls.length).toBe(reads);
  });
});
