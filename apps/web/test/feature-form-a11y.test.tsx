import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clickSave,
  dialog,
  fillMinimum,
  form,
  liveText,
  openCreate,
  openEdit,
  serveWrite,
  setText,
  statusRegions,
  titleField,
} from "./support/feature-form.tsx";
import {
  CLIENT_SIDE,
  findTable,
  GIT_VOCABULARY,
  renderFeatures,
  visibleText,
} from "./support/features.tsx";
import {
  apiError,
  polyfillRadix,
  procedures,
  resetWebMocks,
  watchUrl,
} from "./support/web-mocks.ts";
import { DESKTOP, MOBILE, setViewport } from "./viewport.ts";

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
 * TK-48 / 48e : accessibilité, responsive 375 px, mouvement réduit et vocabulaire du formulaire
 * (S-feature-form §3.2, §6, §7, AC-48-28). Les contrastes et axe sont vérifiés en e2e.
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  setViewport(DESKTOP);
  localStorage.clear();
  serveWrite();
});

const TEAM_JARGON = /\blot\b|commit|branche|\bSHA\b|idempoten|payload|\bbatch\b/i;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Dialogue, focus, étiquettes", () => {
  it("dialogue modal nommé par son h2, focus initial sur le titre", async () => {
    const panel = await openCreate();
    const root = await dialog();
    expect(root).toHaveAccessibleName("Nouvelle fonctionnalité");
    await waitFor(() => expect(titleField(panel)).toHaveFocus());
  });

  it("chaque champ a un libellé visible lié ; les aides sont reliées par aria-describedby", async () => {
    const panel = await openCreate();
    for (const name of ["Titre (obligatoire)", "Description"]) {
      const field = panel.getByRole("textbox", { name });
      expect(field.id).not.toBe("");
      expect(document.querySelector(`label[for="${field.id}"]`)).not.toBeNull();
    }
    for (const name of ["Priorité (obligatoire)", "Statut"]) {
      expect(panel.getByRole("combobox", { name })).toBeVisible();
    }
  });

  it("la zone défilante est atteignable au clavier (région nommée, tabindex 0)", async () => {
    const panel = await openCreate();
    const region = panel.getByRole("region", { name: /fonctionnalité/i });
    expect(region).toHaveAttribute("tabindex", "0");
  });

  it("pied : « Enregistrer » principal et « Fermer » outline, cibles 44 px en mobile (h-11 md:h-9)", async () => {
    const panel = await openCreate();
    for (const name of ["Enregistrer", "Fermer"]) {
      expect(panel.getByRole("button", { name }).className).toMatch(/\bh-11\b/);
      expect(panel.getByRole("button", { name }).className).toMatch(/md:h-9/);
    }
  });

  it("bouton de fermeture de l'angle nommé « Fermer le formulaire »", async () => {
    const panel = await openCreate();
    expect(panel.getByRole("button", { name: "Fermer le formulaire" })).toBeVisible();
  });

  it("panneau de 440 px au plus (gabarit de la fiche), pleine largeur en mobile", async () => {
    await openCreate();
    const root = await dialog();
    expect(root.className).toMatch(/w-full/);
    expect(root.className).toMatch(/max-w-\[440px\]/);
  });

  it("ordre de tabulation = ordre visuel : titre, priorité, statut, description", async () => {
    const panel = await openCreate();
    titleField(panel).focus();
    const u = userEvent.setup();
    const order: string[] = [];
    for (let i = 0; i < 3; i++) {
      await u.tab();
      order.push(
        (document.activeElement as HTMLElement).getAttribute("aria-label") ??
          document.activeElement?.textContent ??
          "",
      );
    }
    expect(order[0]).toMatch(/Priorité|Choisir/);
    expect(order[1]).toMatch(/Brouillon|Statut/);
    expect((document.activeElement as HTMLElement).tagName).toBe("TEXTAREA");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Une seule région d'état, une seule alerte (§7)", () => {
  it("formulaire au repos : une région role=status sur tout l'écran", async () => {
    await openCreate();
    expect(statusRegions()).toHaveLength(1);
  });

  it("la région d'état est dans le panneau tant qu'il est ouvert (le reste de la page est masqué), hors du panneau ensuite (refactor 48e)", async () => {
    procedures.specBatchSubmit.mockReturnValue(new Promise(() => undefined));
    const panel = await openCreate();
    expect(statusRegions()[0]?.closest('[role="dialog"]')).not.toBeNull();
    await fillMinimum(panel);
    await clickSave(panel);
    await panel.findByRole("button", { name: "Enregistrement…" });
    expect(statusRegions()).toHaveLength(1);
    expect(within(await dialog()).getByRole("status")).toHaveTextContent(
      "Envoi de votre modification…",
    );
    await userEvent.click(panel.getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(statusRegions()).toHaveLength(1);
    expect(statusRegions()[0]?.closest('[role="dialog"]')).toBeNull();
  });

  it("pendant l'envoi : toujours une seule région d'état", async () => {
    procedures.specBatchSubmit.mockReturnValue(new Promise(() => undefined));
    const panel = await openCreate();
    await fillMinimum(panel);
    await clickSave(panel);
    await panel.findByRole("button", { name: "Enregistrement…" });
    expect(statusRegions()).toHaveLength(1);
    expect(liveText()).toContain("Envoi de votre modification…");
  });

  it("après une erreur : une seule alerte et une seule région d'état", async () => {
    procedures.specBatchSubmit.mockRejectedValue(apiError("PROVIDER_UNAVAILABLE"));
    const panel = await openCreate();
    await fillMinimum(panel);
    await clickSave(panel);
    await panel.findByRole("alert");
    expect(panel.getAllByRole("alert")).toHaveLength(1);
    expect(statusRegions()).toHaveLength(1);
  });

  it("résumé de validation : une seule alerte, pas de seconde région d'état", async () => {
    const panel = await openCreate();
    await clickSave(panel);
    await panel.findByRole("alert");
    expect(panel.getAllByRole("alert")).toHaveLength(1);
    expect(statusRegions()).toHaveLength(1);
  });

  it("modification en cours de chargement : un état de chargement annoncé (aria-busy), pulsation sous motion-safe seulement", async () => {
    procedures.specGetFeature.mockReturnValue(new Promise(() => undefined));
    renderFeatures({ search: "?edit=F-001" });
    const panel = await form();
    const loading = await panel.findByText("Chargement de la fonctionnalité…");
    expect(loading.closest("[aria-busy='true']")).not.toBeNull();
    const pulses = Array.from(document.querySelectorAll("[class*='animate-pulse']"));
    expect(pulses.length).toBeGreaterThan(0);
    for (const pulse of pulses) expect(pulse.className).toMatch(/motion-safe:animate-pulse/);
  });
});

describe("Mobile 375 px et mouvement réduit (§6, §7)", () => {
  beforeEach(() => setViewport(MOBILE));

  it("pied : boutons pleine largeur, « Enregistrer » avant « Fermer » dans le flux", async () => {
    const panel = await openCreate();
    const save = panel.getByRole("button", { name: "Enregistrer" });
    const close = panel.getByRole("button", { name: "Fermer" });
    expect(save.className).toMatch(/w-full/);
    expect(close.className).toMatch(/w-full/);
    expect(save.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("éditeur de critères : actions « Monter », « Descendre », « Retirer » avec libellés texte et cibles 44 px", async () => {
    const panel = await openEdit();
    const group = within(panel.getByRole("group", { name: /^Critère 1/ }));
    for (const name of [
      /^Monter le critère 1/,
      /^Descendre le critère 1/,
      /^Retirer le critère 1/,
    ]) {
      const button = group.getByRole("button", { name });
      expect(button.className).toMatch(/\bh-11\b/);
    }
    expect(group.getByText("Monter")).toBeVisible();
    expect(group.getByText("Descendre")).toBeVisible();
    expect(group.getByText("Retirer")).toBeVisible();
  });

  it("aucun élément de largeur fixe supérieure à 375 px dans le panneau", async () => {
    await openCreate();
    const root = await dialog();
    const fixed = Array.from(root.querySelectorAll<HTMLElement>("[class*='w-[']")).filter((el) => {
      const px = /(?:^|\s)w-\[(\d+)px\]/.exec(el.className)?.[1];
      return px !== undefined && Number(px) > 375;
    });
    expect(fixed).toEqual([]);
  });

  it("l'ouverture du panneau et du Collapsible respecte prefers-reduced-motion (motion-reduce ou motion-safe)", async () => {
    await openCreate();
    const root = await dialog();
    expect(root.className).toMatch(/motion-reduce:|motion-safe:/);
  });
});

describe("Vocabulaire (§5.9, AC-48-28)", () => {
  it("équipe : aucun terme technique (lot, commit, branche, SHA, idempotence, payload) dans le formulaire au repos", async () => {
    const panel = await openCreate();
    expect(visibleText(await dialog())).not.toMatch(TEAM_JARGON);
    expect(panel.getByRole("button", { name: "Enregistrer" })).toBeVisible();
  });

  it("équipe : ni dans la modification, ni dans l'indicateur d'avancement, ni dans une erreur", async () => {
    procedures.specBatchSubmit.mockRejectedValue(apiError("INTERNAL", { requestId: "req-9" }));
    const panel = await openEdit();
    await setText(titleField(panel), "Autre");
    await clickSave(panel);
    await panel.findByRole("alert");
    expect(visibleText(await dialog())).not.toMatch(TEAM_JARGON);
    expect(liveText()).not.toMatch(TEAM_JARGON);
  });

  it.each(CLIENT_SIDE)(
    "%s : ?new=1 et ?edit=F-001 ne montrent ni formulaire ni terme git",
    async (role) => {
      serveWrite(role);
      renderFeatures({ search: "?new=1" });
      await findTable();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(visibleText()).not.toMatch(GIT_VOCABULARY);
      expect(visibleText()).not.toMatch(
        /Enregistrer|Nouvelle fonctionnalité|Brouillon repris|Éléments liés/,
      );
      expect(document.body.innerHTML).not.toMatch(/feature-draft|feature-pending/);
    },
  );

  it.each(CLIENT_SIDE)(
    "%s : un marqueur de suivi resté sur l'appareil n'apparaît pas à l'écran",
    async (role) => {
      serveWrite(role);
      localStorage.setItem(
        `koklo:feature-pending:7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01`,
        JSON.stringify({
          batchId: "x",
          kind: "create",
          title: "Secret",
          savedAt: new Date().toISOString(),
        }),
      );
      renderFeatures();
      await findTable();
      expect(visibleText()).not.toContain("Secret");
    },
  );
});
