import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectsPage } from "../src/components/projects-page.tsx";

const replace = vi.hoisted(() => vi.fn());
const queryFn = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("../src/lib/orpc.ts", () => ({
  orpc: { project: { list: { queryOptions: () => ({ queryKey: ["project", "list"], queryFn }) } } },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  replace.mockReset();
  queryFn.mockReset();
});

describe("ProjectsPage", () => {
  it("affiche le chargement puis la liste des projets", async () => {
    queryFn.mockResolvedValue([{ id: "p1", name: "Alpha" }]);
    render(<ProjectsPage />, { wrapper });
    expect(screen.getByTestId("projects-loading")).toBeInTheDocument();
    expect(await screen.findByText("Alpha")).toBeInTheDocument();
  });

  it("redirige vers /login sur UNAUTHORIZED", async () => {
    queryFn.mockRejectedValue(Object.assign(new Error("no"), { code: "UNAUTHORIZED" }));
    render(<ProjectsPage />, { wrapper });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("affiche l'erreur sans redirection pour une autre erreur", async () => {
    queryFn.mockRejectedValue(new Error("boom"));
    render(<ProjectsPage />, { wrapper });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
