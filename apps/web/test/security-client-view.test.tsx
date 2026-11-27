import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderSecurity, securityHeading, serveClientSecurity } from "./support/security.tsx";
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
describe("vue client de la Sécurité", () => {
  it("seul onglet « Résumé », statut, cartes sans identifiant, aucun appel de l'équipe", async () => {
    serveClientSecurity("client");
    renderSecurity();
    await securityHeading();
    expect(await screen.findByText("Résumé pour vous")).toBeVisible();
    const nav = screen.getByRole("navigation", { name: "Sections de la sécurité" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Résumé"]);
    expect(await screen.findAllByRole("article")).toHaveLength(7);
    expect(
      screen.getByText(/Résumé rédigé depuis le livrable Sécurité, relu par l'équipe le 5 nov/),
    ).toBeVisible();
    expect(procedures.securityThreatList).not.toHaveBeenCalled();
    expect(procedures.securitySummaryGet).not.toHaveBeenCalled();
    expect(procedures.proposalList).not.toHaveBeenCalled();
  });

  it("contact : saisie, enregistrement, annonce", async () => {
    serveClientSecurity("client");
    renderSecurity();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Indiquer un contact" }));
    await user.type(screen.getByRole("textbox", { name: /^Nom/ }), "Marie Exemple");
    await user.type(screen.getByRole("textbox", { name: /^Téléphone/ }), "06 00 00 00 00");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(procedures.clientSpaceSecurityContactSet.mock.calls[0]?.[0]).toMatchObject({
        name: "Marie Exemple",
        phone: "06 00 00 00 00",
      }),
    );
    expect(await screen.findByText("Contact enregistré")).toBeInTheDocument();
  });

  it("contact présent : texte et « Modifier » ; téléphone invalide refusé", async () => {
    serveClientSecurity("client", { contact: { name: "Marie", phone: "0600000000" } });
    renderSecurity();
    expect(await screen.findByText(/Contact en cas d'incident : Marie, 0600000000/)).toBeVisible();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Modifier" }));
    const phone = screen.getByRole("textbox", { name: /^Téléphone/ });
    await user.clear(phone);
    await user.type(phone, "abc");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(screen.getByText("Un numéro de téléphone est attendu.")).toBeVisible();
    expect(procedures.clientSpaceSecurityContactSet).not.toHaveBeenCalled();
  });

  it("question : commentaire sur le résumé", async () => {
    serveClientSecurity("client");
    renderSecurity();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Poser une question" }));
    await user.type(
      screen.getByRole("textbox", { name: "Votre question à l'équipe" }),
      "Bonjour ?",
    );
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() =>
      expect(procedures.commentCreate.mock.calls[0]?.[0]).toMatchObject({
        targetKind: "security_summary",
        targetRef: "summary",
        body: "Bonjour ?",
      }),
    );
    expect(await screen.findByText("Question envoyée à l'équipe")).toBeInTheDocument();
  });

  it("non validé : en cours de validation", async () => {
    serveClientSecurity("client", { available: false });
    renderSecurity();
    expect(await screen.findByText(/en cours de validation par l'équipe/)).toBeVisible();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("business : lit sans agir", async () => {
    serveClientSecurity("business");
    renderSecurity();
    expect(await screen.findAllByRole("article")).toHaveLength(7);
    expect(screen.queryByRole("button", { name: "Poser une question" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Ce que nous attendons de vous" })).toBeNull();
  });
});
