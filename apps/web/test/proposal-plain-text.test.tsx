import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fake, renderTeam, serveProposals } from "./support/proposals.tsx";
import { findNamed } from "./support/wait.ts";
import { polyfillRadix, resetWebMocks, watchUrl } from "./support/web-mocks.ts";

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
 * TEXTE BRUT absolu (B330, repris des tests de l'Assistant de cadrage retiré en TK-102) : HTML, javascript:, liens
 * Markdown par référence, //evil.com et images d'une proposition de l'agent restent des nœuds texte inertes dans la
 * relecture : liste, détail, critères et région d'état.
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
});

const SCRIPT = "<script>window.__pwned = 1</script>";
const IMG = '<img src=x onerror="window.__pwned = 2">';
const REF = "[x][1]\n\n[1]: javascript:alert(1)";
const PROTO = "javascript:alert(1) ftp://evil.example //evil.com www.evil.com";
const MD = "**gras** # titre ![](http://evil.example/p.png) [lien](https://evil.example)";
const HOSTILE = [SCRIPT, IMG, REF, PROTO, MD].join("\n");
const HOSTILE_TITLE = `Titre ${SCRIPT} ${MD}`;

const hostile = () =>
  fake(1, {
    title: HOSTILE_TITLE,
    rationale: HOSTILE,
    content: {
      title: HOSTILE_TITLE,
      priority: "must",
      description: HOSTILE,
      criteria: [
        {
          title: `Critère ${IMG}`,
          steps: [
            { type: "etant_donne", text: REF },
            { type: "quand", text: PROTO },
            { type: "alors", text: MD },
          ],
        },
      ],
    },
  });

/** Aucun balisage, lien, image, script ni gestionnaire d'événement ne vient d'une sortie du modèle. */
function expectInert(root: Element) {
  expect(root.querySelector("script, img, iframe, object, embed, svg image")).toBeNull();
  expect(root.querySelector("[onerror], [onclick], [onload], [style*='url(']")).toBeNull();
  expect(root.querySelector("a[href*='evil'], a[href^='javascript:'], a[href^='//']")).toBeNull();
  expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
}

describe("Proposition hostile dans la relecture", () => {
  beforeEach(() => serveProposals([hostile(), fake(2)]));

  it("titre, description, critères et étapes sont rendus tels quels, sans aucun élément actif", async () => {
    renderTeam("?view=review");
    const region = (await findNamed("group", "Mode relecture")).closest(
      "[data-slot=proposal-review]",
    ) as HTMLElement;
    await waitFor(() => expect(region.textContent).toContain(HOSTILE_TITLE));
    expect(region.textContent).toContain(IMG);
    expect(region.textContent).toContain(REF);
    expect(region.textContent).toContain(PROTO);
    expectInert(region);
  });

  it("l'annonce de la région d'état et la barre de décompte restent du texte", async () => {
    renderTeam("?view=review");
    await findNamed("group", "Mode relecture");
    await userEvent.click(await screen.findByRole("button", { name: /^Accepter/ }));
    const status = document.querySelector("[data-slot=proposal-review] [role=status]");
    await waitFor(() => expect(status?.textContent).toMatch(/acceptée/));
    expectInert(document.body);
  });
});
