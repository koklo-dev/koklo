import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityPage } from "../src/components/activity-page.tsx";
import { PROJECT_ID } from "./support/overview.tsx";
import { renderWithQuery } from "./support/render.tsx";
import { apiError, polyfillRadix, procedures, resetWebMocks } from "./support/web-mocks.ts";

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

/** TK-92 : /projects/[projectId]/activity, liste à curseur de 50 par page (S-overview §2, B280). */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
});

const event = (n: number) => ({
  actor: { kind: "team" as const, name: "Awa", initials: "AK" },
  text: `Événement numéro ${n}`,
  at: "2026-11-08T10:00:00.000Z",
});
const page = (from: number, count: number, next: string | null, total: number) => ({
  items: Array.from({ length: count }, (_, i) => event(from + i)),
  nextCursor: next,
  previousCursor: null,
  offset: from - 1,
  total,
});

describe("page d'activité", () => {
  it("affiche la première page de 50, le total, puis la suivante par curseur", async () => {
    procedures.projectActivity
      .mockResolvedValueOnce(page(1, 50, "c2", 60))
      .mockResolvedValueOnce(page(51, 10, null, 60));
    renderWithQuery(<ActivityPage projectId={PROJECT_ID} />);
    const feed = await screen.findByRole("list", { name: "Activité du projet" });
    expect(within(feed).getAllByRole("listitem")).toHaveLength(50);
    expect(screen.getByRole("heading", { level: 1, name: "Activité" })).toBeVisible();
    expect(screen.getByText("60 événements")).toBeVisible();
    expect(procedures.projectActivity).toHaveBeenCalledWith({ projectId: PROJECT_ID, limit: 50 });
    await userEvent.click(screen.getByRole("button", { name: /Charger/ }));
    await waitFor(() => expect(within(feed).getAllByRole("listitem")).toHaveLength(60));
    expect(procedures.projectActivity).toHaveBeenLastCalledWith({
      projectId: PROJECT_ID,
      limit: 50,
      cursor: "c2",
    });
    expect(screen.queryByRole("button", { name: /Charger/ })).toBeNull();
  });

  it("projet introuvable : 404 uniforme ; autre erreur : message et Réessayer", async () => {
    procedures.projectActivity.mockRejectedValueOnce(apiError("INTERNAL"));
    renderWithQuery(<ActivityPage projectId={PROJECT_ID} />);
    expect(await screen.findByText("Impossible de charger l'activité.")).toBeVisible();
    procedures.projectActivity.mockResolvedValueOnce(page(1, 2, null, 2));
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByRole("list", { name: "Activité du projet" })).toBeVisible();
  });

  it("NOT_FOUND : « Projet introuvable »", async () => {
    procedures.projectActivity.mockRejectedValue(apiError("NOT_FOUND"));
    renderWithQuery(<ActivityPage projectId={PROJECT_ID} />);
    expect(await screen.findByRole("heading", { name: "Projet introuvable" })).toBeVisible();
  });
});
