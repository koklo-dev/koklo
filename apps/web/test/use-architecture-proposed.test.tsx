import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProposalOutput } from "../src/lib/proposal-types.ts";
import {
  countProposedComponents,
  isProposedComponent,
  useArchitectureProposed,
} from "../src/lib/use-architecture-proposed.ts";
import type { ProposalCounts } from "../src/lib/use-proposal-status.ts";
import { type Fake, fake, LAUNCH_ID, PROJECT_ID } from "./support/proposals.tsx";
import { procedures, resetWebMocks } from "./support/web-mocks.ts";

vi.mock("../src/lib/auth-client.ts", async () => ({
  authClient: (await import("./support/web-mocks.ts")).authClient,
}));
vi.mock("../src/lib/orpc.ts", async () => ({
  orpc: (await import("./support/web-mocks.ts")).orpc,
}));

/** TK-114i lot B (B711, B712) : le compte « Composants » en relecture, les créations pas encore dans la spec. */
beforeEach(() => resetWebMocks());

const SAVED_BATCH = "0190cccc-0000-7000-8000-000000000001";
const FAILED_BATCH = "0190cccc-0000-7000-8000-000000000002";
const NO_FAILURE: ReadonlySet<string> = new Set();

const component = (n: number, over: Partial<Fake> = {}): Fake =>
  fake(n, { kind: "component", content: { name: `Composant proposé ${n}` }, ...over });
const range = (from: number, count: number, over: Partial<Fake> = {}) =>
  Array.from({ length: count }, (_, i) => component(from + i, over));
const saved: Partial<Fake> = { status: "accepted", appliedBatchId: SAVED_BATCH };
const present: Partial<Fake> = { status: "rejected", discardReason: "already_present" };
const update = (n: number) =>
  component(n, { content: { specId: "C-api", name: "API" }, status: "pending" });
const count = (items: Fake[], failed = NO_FAILURE) =>
  countProposedComponents(items as ProposalOutput[], failed);

describe("compte des composants proposés (B1)", () => {
  it("tout enregistré (45 appliquées) : 0", () => {
    expect(count(range(1, 45, saved))).toBe(0);
  });

  it("partiellement enregistré : seules les non enregistrées, à relire ou acceptées", () => {
    const items = [
      ...range(1, 45, saved),
      ...range(46, 2),
      ...range(48, 3, { status: "accepted" }),
    ];
    expect(count(items)).toBe(5);
  });

  it("rien d'enregistré : toutes les créations", () => {
    expect(count([...range(1, 4), ...range(5, 2, { status: "accepted" })])).toBe(6);
  });

  it("rejetée par une personne : hors du compte, sa ligne reste (B713)", () => {
    const rejected = component(1, { status: "rejected" });
    expect(count([rejected, component(2)])).toBe(1);
    expect(isProposedComponent(rejected as ProposalOutput, NO_FAILURE)).toBe(true);
  });

  it("déjà présente dans la spec : ni compte ni ligne", () => {
    const item = component(1, present);
    expect(count([item])).toBe(0);
    expect(isProposedComponent(item as ProposalOutput, NO_FAILURE)).toBe(false);
  });

  it("modification (`specId` C-…) : ni compte ni ligne ; un `specId` d'une autre forme reste une création", () => {
    expect(count([update(1)])).toBe(0);
    expect(isProposedComponent(update(1) as ProposalOutput, NO_FAILURE)).toBe(false);
    expect(count([component(2, { content: { specId: "api", name: "API" } })])).toBe(1);
  });

  it("autre type que `component` : ni compte ni ligne", () => {
    const flow = fake(1, { kind: "archflow", content: { flow: "P-reserver" } });
    expect(count([flow])).toBe(0);
    expect(isProposedComponent(flow as ProposalOutput, NO_FAILURE)).toBe(false);
  });

  it("tenue par un lot échoué : comptée ; par un lot abouti : non", () => {
    const held = range(1, 3, { status: "accepted", appliedBatchId: FAILED_BATCH });
    const items = [...held, ...range(4, 2, saved)];
    expect(count(items, new Set([FAILED_BATCH]))).toBe(3);
    expect(count(items)).toBe(0);
  });
});

const COUNTS: ProposalCounts = { total: 2, accepted: 0, rejected: 0, pending: 2, present: 0 };

interface Props {
  reviewing: boolean;
  launchId: string | undefined;
  counts: ProposalCounts;
}
const START: Props = { reviewing: true, launchId: LAUNCH_ID, counts: COUNTS };

function mount(initial: Partial<Props> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    ({ reviewing, launchId, counts }: Props) =>
      useArchitectureProposed(PROJECT_ID, {
        reviewing,
        status: { launch: launchId ? { id: launchId } : null, counts },
        failed: NO_FAILURE,
      }),
    { initialProps: { ...START, ...initial }, wrapper },
  );
  return { ...view, client };
}

const answer = (items: Fake[], nextCursor: string | null = null) => ({ items, nextCursor });
const never = () => new Promise<never>(() => {});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("lecture du compte (B3, B5)", () => {
  it("lit les composants du lancement, tous statuts, par pages de 100 suivies jusqu'au bout", async () => {
    procedures.proposalList
      .mockResolvedValueOnce(answer(range(1, 100), "100"))
      .mockResolvedValueOnce(answer(range(101, 20)));
    const { result } = mount();
    await waitFor(() => expect(result.current).toBe(120));
    expect(procedures.proposalList.mock.calls.map(([input]) => input)).toEqual([
      {
        projectId: PROJECT_ID,
        deliverable: "architecture",
        groupBy: "type_zone",
        group: "component",
        status: "all",
        limit: 100,
      },
      expect.objectContaining({ group: "component", limit: 100, cursor: "100" }),
    ]);
  });

  it.each([
    ["hors relecture", { reviewing: false }],
    ["sans lancement", { launchId: undefined }],
    ["lancement sans proposition", { counts: { ...COUNTS, total: 0, pending: 0 } }],
  ])("%s : 0 et aucune lecture", (_label, props) => {
    const { result } = mount(props);
    expect(result.current).toBe(0);
    expect(procedures.proposalList).not.toHaveBeenCalled();
  });

  it("lecture en cours : 0", () => {
    procedures.proposalList.mockImplementation(never);
    expect(mount().result.current).toBe(0);
  });

  it("lecture en échec : 0, sans erreur remontée", async () => {
    procedures.proposalList.mockRejectedValue(new Error("boom"));
    const { result, client } = mount();
    await waitFor(() => expect(client.getQueryCache().getAll()[0]?.state.status).toBe("error"));
    expect(result.current).toBe(0);
  });

  it("les comptes du lancement changent : relu, l'ancien compte reste affiché entre-temps", async () => {
    procedures.proposalList.mockResolvedValue(answer(range(1, 2)));
    const { result, rerender, client } = mount();
    await waitFor(() => expect(result.current).toBe(2));
    expect(client.getQueryCache().getAll()[0]?.queryKey[0]).toBe("proposal");
    let release: (value: unknown) => void = () => {};
    procedures.proposalList.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    rerender({ ...START, counts: { ...COUNTS, pending: 1, rejected: 1 } });
    await waitFor(() => expect(procedures.proposalList).toHaveBeenCalledTimes(2));
    expect(result.current).toBe(2);
    release(answer([component(1), component(2, { status: "rejected" })]));
    await waitFor(() => expect(result.current).toBe(1));
  });

  it("sortie de la relecture ou nouveau lancement : l'ancien compte disparaît", async () => {
    procedures.proposalList.mockResolvedValue(answer(range(1, 2)));
    const { result, rerender } = mount();
    await waitFor(() => expect(result.current).toBe(2));
    rerender({ ...START, reviewing: false });
    expect(result.current).toBe(0);
    procedures.proposalList.mockImplementation(never);
    rerender({ ...START, launchId: "0190aaaa-0000-7000-8000-000000000009" });
    expect(result.current).toBe(0);
  });
});
