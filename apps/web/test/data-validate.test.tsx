import { useQuery } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataPage } from "../src/components/data-page.tsx";
import { orpc } from "../src/lib/orpc.ts";
import { PROJECT_ID, renderData, serveData } from "./support/data.tsx";
import { batch, NEW_SHA } from "./support/feature-form.tsx";
import { head, SHA } from "./support/features.tsx";
import { renderWithQuery } from "./support/render.tsx";
import {
  apiError,
  polyfillRadix,
  procedures,
  resetWebMocks,
  setUrl,
  specDeliverables,
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

/** TK-109 lot B, critères 1, 2 et 7 : « Valider le modèle », « Validé par », écran équipe. */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
});

const DECISION = {
  id: "00000000-0000-4000-8000-0000000000d1",
  targetKind: "deliverable",
  targetRef: "data",
  sha: "3c7e1a9".padEnd(40, "0"),
  status: "approved",
  authorId: "00000000-0000-4000-8000-0000000000a1",
  authorName: "Moussa",
  authorRole: "owner",
  comment: null,
  createdAt: "2026-11-05T10:00:00.000Z",
  current: true,
  withoutClient: false,
};
const deliverables = (status: string, staleUpstream?: string[]) =>
  specDeliverables({
    status: { data: status },
    ...(staleUpstream ? { staleUpstream: { data: staleUpstream } } : {}),
  });
/** Lecteur de `project.shell` (la barre latérale n'est pas montée ici) : prouve que la décision l'invalide. */
function ShellProbe() {
  useQuery(orpc.project.shell.queryOptions({ input: { projectId: PROJECT_ID } }));
  return null;
}
const validateButton = () => screen.findByRole("button", { name: "Valider le modèle" });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Écran Données : valider le modèle", () => {
  it("non validé : « Validation de l'équipe » et « Valider le modèle » en dernier bouton, primaire", async () => {
    serveData("owner");
    procedures.specDeliverables.mockResolvedValue(deliverables("pending"));
    renderData();
    const button = await validateButton();
    expect(button).toHaveClass("bg-primary");
    expect(
      screen.getByText("Validation de l'équipe · le client lit et commente"),
    ).toBeInTheDocument();
    const header = button.parentElement as HTMLElement;
    const names = within(header)
      .getAllByRole("button")
      .map((b) => b.textContent?.trim());
    expect(names.at(-1)).toBe("Valider le modèle");
  });

  it("clic : review.submit deliverable data sur le SHA de tête, annonce « Modèle validé »", async () => {
    serveData("owner");
    procedures.specDeliverables.mockResolvedValue(deliverables("pending"));
    procedures.reviewSubmit.mockResolvedValue({ id: DECISION.id });
    renderData();
    await userEvent.click(await validateButton());
    await waitFor(() =>
      expect(procedures.reviewSubmit.mock.calls[0]?.[0]).toEqual({
        projectId: PROJECT_ID,
        targetKind: "deliverable",
        targetRef: "data",
        version: SHA,
        status: "approved",
      }),
    );
    expect(await screen.findByText("Modèle validé")).toBeInTheDocument();
  });

  it("après la décision, spec.deliverables, project.shell et review.list se relisent", async () => {
    serveData("owner");
    procedures.specDeliverables.mockResolvedValue(deliverables("pending"));
    procedures.reviewSubmit.mockResolvedValue({ id: DECISION.id });
    setUrl(`/projects/${PROJECT_ID}/spec/data`);
    renderWithQuery(
      <>
        <DataPage projectId={PROJECT_ID} />
        <ShellProbe />
      </>,
    );
    await validateButton();
    await waitFor(() => expect(procedures.projectShell).toHaveBeenCalled());
    const before = {
      deliverables: procedures.specDeliverables.mock.calls.length,
      shell: procedures.projectShell.mock.calls.length,
      list: procedures.reviewList.mock.calls.length,
    };
    procedures.specDeliverables.mockResolvedValue(deliverables("validated"));
    procedures.reviewList.mockResolvedValue({ items: [DECISION], nextCursor: null });
    await userEvent.click(await validateButton());
    await waitFor(() =>
      expect(procedures.specDeliverables.mock.calls.length).toBeGreaterThan(before.deliverables),
    );
    expect(procedures.projectShell.mock.calls.length).toBeGreaterThan(before.shell);
    expect(procedures.reviewList.mock.calls.length).toBeGreaterThan(before.list);
    expect(
      await screen.findByText("Validé par Moussa le 5 nov. · version 3c7e1a9"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Valider le modèle" })).toBeNull();
  });

  it("échec : phrase en français dans une alerte, le bouton reste", async () => {
    serveData("owner");
    procedures.specDeliverables.mockResolvedValue(deliverables("pending"));
    procedures.reviewSubmit.mockRejectedValue(apiError("STALE_VERSION"));
    renderData();
    await userEvent.click(await validateButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(/a changé depuis votre lecture/);
    expect(screen.getByRole("button", { name: "Valider le modèle" })).toBeInTheDocument();
  });

  it("validé : statut « Validé par l'équipe », « Validé par Moussa le 5 nov. · version 3c7e1a9 », pas de bouton", async () => {
    serveData("owner");
    procedures.specDeliverables.mockResolvedValue(deliverables("validated"));
    procedures.reviewList.mockResolvedValue({ items: [DECISION], nextCursor: null });
    renderData();
    expect(
      await screen.findByText("Validé par Moussa le 5 nov. · version 3c7e1a9"),
    ).toBeInTheDocument();
    expect(screen.getByText("Validé par l'équipe")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Valider le modèle" })).toBeNull();
    expect(procedures.reviewList.mock.calls[0]?.[0]).toMatchObject({
      projectId: PROJECT_ID,
      targetKind: "deliverable",
      targetRef: "data",
    });
  });

  it("une table modifiée après validation : l'en-tête repasse à « Validation de l'équipe » et le bouton revient", async () => {
    serveData("owner");
    procedures.specDeliverables.mockResolvedValue(deliverables("validated"));
    procedures.reviewList.mockResolvedValue({ items: [DECISION], nextCursor: null });
    renderData({ search: "tab=tables&edit=T-client" });
    // La feuille de chargement est remplacée par celle du formulaire : on relit le dialogue à chaque accès.
    const dialog = () => within(screen.getByRole("dialog"));
    await waitFor(() =>
      expect(dialog().getByRole("textbox", { name: /^Nom/ })).toHaveValue("Client"),
    );
    const zone = dialog().getByRole("combobox", { name: /^Zone/ });
    const result = batch({ results: [{ position: 0, kind: "table.update", specId: "T-client" }] });
    // L'écriture n'est « enregistrée » qu'une fois l'index de tête au commit du lot.
    procedures.specHead.mockResolvedValue(head({ commitSha: NEW_SHA }));
    procedures.specBatchSubmit.mockResolvedValue(result);
    procedures.specBatchGet.mockResolvedValue(result);
    // Après l'écriture, le serveur dit « pending » : l'écran le relit (spec.deliverables invalidé) et suit.
    procedures.specDeliverables.mockResolvedValue(deliverables("pending"));
    await userEvent.clear(zone);
    await userEvent.type(zone, "Fidélité");
    await userEvent.click(dialog().getByRole("button", { name: "Enregistrer les modifications" }));
    expect(
      await screen.findByText("Validation de l'équipe · le client lit et commente", undefined, {
        timeout: 8_000,
      }),
    ).toBeInTheDocument();
    expect(await validateButton()).toBeInTheDocument();
  });

  it("designer : le statut se lit, aucune action d'écriture ni « Valider le modèle »", async () => {
    serveData("designer");
    procedures.specDeliverables.mockResolvedValue(deliverables("pending"));
    renderData();
    await screen.findByText("Validation de l'équipe · le client lit et commente");
    expect(screen.queryByRole("button", { name: "Valider le modèle" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ajouter une table" })).toBeNull();
  });
});
