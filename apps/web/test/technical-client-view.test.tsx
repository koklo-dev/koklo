import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderTechnical, serveClientTechnical, technicalHeading } from "./support/technical.tsx";
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

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Page Technique : vue client", () => {
  it("cahier validé : bandeau, résumé en lecture seule, « En clair », aucun YAML ni écriture", async () => {
    serveClientTechnical("client");
    renderTechnical();
    await technicalHeading();
    expect(await screen.findByText("Lecture seule.")).toBeInTheDocument();
    expect(screen.getByText("Validé par l'équipe")).toBeInTheDocument();
    expect(
      screen.getByText(
        "24 choix · 132 opérations · 28 exigences · 3 environnements · lecture seule",
      ),
    ).toBeInTheDocument();
    const aside = await screen.findByRole("complementary", { name: "Fiche du choix technique" });
    expect(aside).toHaveTextContent("Le prestataire qui enverra les rappels SMS reste à choisir.");
    expect(aside).not.toHaveTextContent("L'agent recommande Brevo");
    for (const name of [/YAML/, /^Modifier$/, /^Choisir/, /Proposer/, /Nouveau choix/]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    for (const procedure of [
      procedures.specTechnicalStackList,
      procedures.specTechnicalStackSource,
      procedures.specTechnicalEnvironments,
      procedures.specDocumentSections,
      procedures.proposalList,
    ]) {
      expect(procedure).not.toHaveBeenCalled();
    }
  });

  it("« Commenter » vise le choix ouvert et annonce « Commentaire envoyé »", async () => {
    serveClientTechnical("client");
    renderTechnical();
    const aside = await screen.findByRole("complementary", { name: "Fiche du choix technique" });
    await userEvent.click(within(aside).getByRole("button", { name: "Commenter" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox"), "Quel coût ?");
    await userEvent.click(within(dialog).getByRole("button", { name: "Envoyer" }));
    await waitFor(() =>
      expect(procedures.commentCreate.mock.calls[0]?.[0]).toMatchObject({
        targetKind: "stack",
        targetRef: "ST-sms",
        body: "Quel coût ?",
      }),
    );
    expect(await screen.findByText("Commentaire envoyé")).toBeInTheDocument();
  });

  it("Environnements : tableau sans « Modifier » ; Document : questions et envoi sur la section", async () => {
    serveClientTechnical("client");
    renderTechnical({ search: "tab=environments" });
    await screen.findByRole("table", { name: "Environnements" });
    expect(screen.queryByRole("button", { name: "Modifier" })).toBeNull();
  });

  it("Document : colonne « Questions et commentaires », question envoyée sur la section ouverte", async () => {
    serveClientTechnical("client");
    procedures.commentList.mockResolvedValue({
      items: [
        {
          id: "k1",
          authorKind: "team",
          body: "Voir Exploitation.",
          createdAt: "2026-11-20T10:00:00.000Z",
        },
      ],
      nextCursor: null,
    });
    renderTechnical({ search: "tab=document" });
    const side = await screen.findByRole("complementary", {
      name: "Questions et commentaires",
    });
    expect(await within(side).findByText("Voir Exploitation.")).toBeInTheDocument();
    expect(screen.queryByText("tech/cahier-technique/01-objet.md")).toBeNull();
    await userEvent.type(
      within(side).getByRole("textbox", { name: "Votre question" }),
      "Qui est alerté ?",
    );
    await userEvent.click(within(side).getByRole("button", { name: "Envoyer" }));
    await waitFor(() =>
      expect(procedures.commentCreate.mock.calls[0]?.[0]).toMatchObject({
        targetKind: "tech_section",
        targetRef: "DOC-objet",
      }),
    );
  });

  it("business : lit sans commenter", async () => {
    serveClientTechnical("business");
    renderTechnical();
    await screen.findByRole("complementary", { name: "Fiche du choix technique" });
    expect(screen.queryByRole("button", { name: "Commenter" })).toBeNull();
    expect(screen.getByText(/vous pouvez le lire\.$/)).toBeInTheDocument();
  });

  it("non validé : « en cours de validation par l'équipe », rien d'autre", async () => {
    serveClientTechnical("client", { available: false });
    renderTechnical();
    expect(
      await screen.findByText("Le cahier technique est en cours de validation par l'équipe"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Commenter" })).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});
