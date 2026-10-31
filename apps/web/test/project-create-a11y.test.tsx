import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INSTALL_ID_2, installation } from "./support/github-fixtures.ts";
import {
  ACME,
  createProject,
  createWithSpecFailure,
  openReadySheet,
  rejectWith,
  renderProjects,
  setupCreation,
} from "./support/project-create.tsx";
import { polyfillRadix, procedures, resetWebMocks } from "./support/web-mocks.ts";

vi.mock("next/navigation", async () => {
  const m = await import("./support/web-mocks.ts");
  return { useRouter: () => m.router, usePathname: () => m.pathname.current };
});
vi.mock("../src/lib/auth-client.ts", async () => ({
  authClient: (await import("./support/web-mocks.ts")).authClient,
}));
vi.mock("../src/lib/orpc.ts", async () => ({
  orpc: (await import("./support/web-mocks.ts")).orpc,
}));

const AWA = installation({ id: INSTALL_ID_2, ownerKind: "user", ownerLogin: "awa-kone" });
const FORBIDDEN_WORDS = /\b(oauth|jeton|token|repository|sha|branche)\b/i;

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  setupCreation();
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'accessibilité, un test par exigence
describe("Panneau de création — accessibilité et vocabulaire (§7.1)", () => {
  it("indicateur : liste ordonnée « Étapes de la création » de deux lignes, icônes masquées aux lecteurs d'écran", async () => {
    renderProjects();
    const sheet = await openReadySheet();
    const list = within(sheet).getByRole("list", { name: "Étapes de la création" });
    expect(list.tagName).toBe("OL");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    const icons = [...list.querySelectorAll("svg")];
    expect(icons).toHaveLength(2);
    for (const icon of icons) expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("titre du dialogue « Créer un projet » et focus initial sur « Nom du projet »", async () => {
    renderProjects();
    const sheet = await openReadySheet();
    expect(sheet).toHaveAccessibleName("Créer un projet");
    expect(within(sheet).getByLabelText("Nom du projet")).toHaveFocus();
  });

  it("une seule région role=status dans le panneau une fois les comptes chargés", async () => {
    renderProjects();
    const sheet = await openReadySheet();
    await createProject(sheet, "Alpha");
    await within(sheet).findByRole("status");
    expect(within(sheet).getAllByRole("status")).toHaveLength(1);
  });

  it("Select nommé « Compte GitHub » (libellé visible), invalide relié par aria-describedby", async () => {
    setupCreation([ACME, AWA]);
    renderProjects();
    const sheet = await openReadySheet();
    const select = within(sheet).getByRole("combobox", { name: "Compte GitHub" });
    await createProject(sheet, "Alpha");
    await within(sheet).findByText("Choisissez le compte GitHub du dépôt.");
    expect(select).toHaveAttribute("aria-invalid", "true");
    const described = select.getAttribute("aria-describedby") ?? "";
    expect(described).not.toBe("");
    expect(document.getElementById(described.split(" ")[0] ?? "")).toHaveTextContent(
      "Choisissez le compte GitHub du dépôt.",
    );
  });

  it("champs en erreur : aria-invalid et aria-describedby (nom vide)", async () => {
    renderProjects();
    const sheet = await openReadySheet();
    await userEvent.click(within(sheet).getByRole("button", { name: "Créer le projet" }));
    const field = await within(sheet).findByLabelText("Nom du projet");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAttribute("aria-describedby");
  });

  it("les liens sont de vrais liens (a) et les actions de vrais boutons", async () => {
    setupCreation([]);
    renderProjects();
    const sheet = await openReadySheet();
    const link = within(sheet).getByRole("link", { name: "Relier GitHub" });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/github");
  });

  it.each([
    ["formulaire", async () => openReadySheet()],
    [
      "échec 503",
      async () => {
        renderProjects();
        return createWithSpecFailure(rejectWith("PROVIDER_UNAVAILABLE"));
      },
    ],
    [
      "échec autorisation",
      async () => {
        renderProjects();
        return createWithSpecFailure(
          rejectWith("USER_TOKEN_REQUIRED", { ownerLogin: "acme-corp" }),
        );
      },
    ],
    [
      "échec nom de dépôt pris",
      async () => {
        renderProjects();
        return createWithSpecFailure(
          rejectWith("CONFLICT", { reason: "repo_name_taken" }),
          "mon-depot",
        );
      },
    ],
    [
      "autorisation expirée (installation)",
      async () => {
        renderProjects();
        return createWithSpecFailure(
          rejectWith("PROVIDER_AUTH_EXPIRED", { kind: "installation", refreshable: false }),
        );
      },
    ],
  ])(
    "vocabulaire (%s) : ni « OAuth », « jeton », « token », « repository », « SHA », « branche »",
    async (_label, arrange) => {
      if (_label === "formulaire") renderProjects();
      const sheet = await arrange();
      expect(sheet.textContent).not.toMatch(FORBIDDEN_WORDS);
      for (const el of sheet.querySelectorAll("[aria-label]")) {
        expect(el.getAttribute("aria-label")).not.toMatch(FORBIDDEN_WORDS);
      }
    },
  );

  it("sans compte : le panneau ne contient pas de vocabulaire technique non plus", async () => {
    setupCreation([]);
    renderProjects();
    const sheet = await openReadySheet();
    await createProject(sheet, "Alpha");
    await within(sheet).findByText(/créé, sans dépôt de spec/);
    expect(sheet.textContent).not.toMatch(FORBIDDEN_WORDS);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(procedures.repoCreateSpec).not.toHaveBeenCalled();
  });
});
