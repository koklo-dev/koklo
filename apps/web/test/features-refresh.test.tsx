import { focusManager } from "@tanstack/react-query";
import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FEATURES,
  findTable,
  head,
  renderFeatures,
  serve,
  statusRegion,
} from "./support/features.tsx";
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

/**
 * TK-48 / 48d, actualisation automatique bornée de la spec en préparation (S-features §4.5) :
 * une relecture de spec.head toutes les 5 s pendant 2 minutes au plus, suspendue onglet masqué,
 * puis texte neutre « prend plus de temps », sans erreur factice. Minuteries simulées.
 */
const PREPARING = "La spec est en cours de préparation";
const SLOW = "La préparation prend plus de temps que prévu. Actualisez dans un moment.";
const SECOND = 1000;

function setTabVisibility(visible: boolean): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (visible ? "visible" : "hidden"),
  });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => !visible });
  document.dispatchEvent(new Event("visibilitychange"));
  focusManager.setFocused(visible);
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const headCalls = () => procedures.specHead.mock.calls.length;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  serve();
  setTabVisibility(true);
  procedures.specHead.mockResolvedValue(head({ status: "building" }));
  procedures.specListFeatures.mockResolvedValue({ items: [], nextCursor: null });
});

afterEach(() => {
  setTabVisibility(true);
  vi.useRealTimers();
});

async function renderPreparing() {
  renderFeatures();
  await screen.findByRole("heading", { name: PREPARING });
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Actualisation automatique de la spec en préparation (§4.5)", () => {
  it("relit spec.head toutes les 5 secondes", async () => {
    await renderPreparing();
    const initial = headCalls();
    await advance(4 * SECOND);
    expect(headCalls()).toBe(initial);
    await advance(1.5 * SECOND);
    expect(headCalls()).toBe(initial + 1);
    await advance(5 * SECOND);
    expect(headCalls()).toBe(initial + 2);
  });

  it("s'arrête silencieusement au bout de 2 minutes : le texte devient « prend plus de temps », sans alerte", async () => {
    await renderPreparing();
    await advance(125 * SECOND);
    const stopped = headCalls();
    expect(stopped).toBeGreaterThan(10);
    expect(stopped).toBeLessThanOrEqual(1 + 25);
    await advance(180 * SECOND);
    expect(headCalls()).toBe(stopped);
    expect(screen.getByText(SLOW)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualiser" })).toBeEnabled();
  });

  it("avant 2 minutes le texte « prend plus de temps » n'apparaît pas", async () => {
    await renderPreparing();
    await advance(60 * SECOND);
    expect(screen.queryByText(SLOW)).not.toBeInTheDocument();
  });

  it("l'onglet masqué suspend l'actualisation, l'onglet visible la reprend", async () => {
    await renderPreparing();
    await advance(5.5 * SECOND);
    setTabVisibility(false);
    await advance(0);
    const suspended = headCalls();
    await advance(60 * SECOND);
    expect(headCalls()).toBe(suspended);
    setTabVisibility(true);
    await advance(6 * SECOND);
    expect(headCalls()).toBeGreaterThan(suspended);
  });

  it("le temps passé onglet masqué ne rallonge ni ne raccourcit à l'excès la fenêtre : toujours borné", async () => {
    await renderPreparing();
    setTabVisibility(false);
    await advance(300 * SECOND);
    setTabVisibility(true);
    await advance(10 * 60 * SECOND);
    expect(headCalls()).toBeLessThan(60);
  });

  it("quand l'indexation aboutit : la liste remplace la carte et « La spec est prête. » est annoncé", async () => {
    procedures.specHead
      .mockResolvedValueOnce(head({ status: "building" }))
      .mockResolvedValue(head({ status: "ready" }));
    procedures.specListFeatures
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockResolvedValue({ items: FEATURES, nextCursor: null });
    await renderPreparing();
    await advance(6 * SECOND);
    await findTable();
    expect(screen.queryByRole("heading", { name: PREPARING })).not.toBeInTheDocument();
    expect(statusRegion()).toHaveTextContent("La spec est prête.");
    const settled = headCalls();
    await advance(60 * SECOND);
    expect(headCalls()).toBe(settled);
  });

  it("un projet prêt n'est jamais relu automatiquement", async () => {
    procedures.specHead.mockResolvedValue(head());
    procedures.specListFeatures.mockResolvedValue({ items: FEATURES, nextCursor: null });
    renderFeatures();
    await findTable();
    const initial = headCalls();
    await advance(60 * SECOND);
    expect(headCalls()).toBe(initial);
  });

  it("projet sans détail (client) : même actualisation bornée, sans appel à repo.list", async () => {
    serve("client");
    procedures.specHead.mockResolvedValue(null);
    renderFeatures();
    await screen.findByRole("heading", { name: "Aucune fonctionnalité à afficher pour le moment" });
    const initial = headCalls();
    await advance(5.5 * SECOND);
    expect(headCalls()).toBe(initial + 1);
    expect(procedures.repoList).not.toHaveBeenCalled();
  });

  it("aucune animation ni compte à rebours pendant l'actualisation", async () => {
    await renderPreparing();
    await advance(10 * SECOND);
    expect(document.body.innerHTML).not.toMatch(/(^|[\s"])animate-(spin|pulse|bounce|ping)/);
    expect(document.body.textContent).not.toMatch(/\b\d+\s*(s|sec|secondes)\b/);
  });
});
