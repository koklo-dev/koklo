import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  button,
  credential,
  keyField,
  openAiSettings,
  REMOVE,
  renderAiSettings,
  SAVE_VERIFY,
  saveKey,
  serveAiSettings,
  typeKey,
} from "./support/ai-settings.tsx";
import { apiError, polyfillRadix, procedures, resetWebMocks } from "./support/web-mocks.ts";
import { DESKTOP, MOBILE, setViewport } from "./viewport.ts";

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

/**
 * Réglages de l'IA, accessibilité et gabarit (S-ai-settings §6, §7) : repères, libellés, annonces (une région
 * d'état polie, une alerte à la fois, jamais la clé), ordre de focus, cibles de 44 px, mouvement réduit, icônes
 * décoratives. Les contrastes (axe) sont vérifiés en e2e (jsdom ne les calcule pas).
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  setViewport(DESKTOP);
  localStorage.clear();
  serveAiSettings("owner");
});

describe("repères et libellés", () => {
  it("h2 « IA » puis h2 « Anthropic », data-testid, aucun h1 (celui de la page est « Réglages »)", async () => {
    await openAiSettings([]);
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    const h2s = screen.getAllByRole("heading", { level: 2 });
    expect(h2s.map((h) => h.textContent)).toEqual(["IA", "Anthropic"]);
    expect(screen.getByTestId("ai-settings-page")).toContainElement(h2s[1] as HTMLElement);
  });

  it("le champ de clé a un libellé visible et une aide reliée par aria-describedby", async () => {
    await openAiSettings([]);
    const field = keyField();
    const help = screen.getByText(/Collez la clé depuis la console/);
    expect((field.getAttribute("aria-describedby") ?? "").split(" ")).toContain(help.id);
    expect(field).not.toHaveAttribute("aria-invalid", "true");
  });

  it("toutes les icônes sont décoratives (aria-hidden) et les boutons ont un nom", async () => {
    await openAiSettings([credential()]);
    for (const svg of Array.from(document.querySelectorAll("svg"))) {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    }
    for (const el of screen.getAllByRole("button")) {
      expect(
        (el.textContent ?? "").trim().length + (el.getAttribute("aria-label") ?? "").length,
      ).toBeGreaterThan(0);
    }
  });

  it("chaque statut a une icône ET un texte (jamais la couleur seule)", async () => {
    for (const [items, label] of [
      [[], "Non configurée"],
      [[credential()], "Configurée"],
      [
        [credential({ invalid: true, invalidatedAt: "2026-10-28T12:00:00.000Z" })],
        /Refusée par le fournisseur/,
      ],
    ] as const) {
      serveAiSettings("owner", [...items]);
      const { unmount } = renderAiSettings();
      const badge = await screen.findByText(label, { exact: typeof label === "string" });
      expect(
        badge.closest("[data-slot=badge], span, div")?.querySelector("svg[aria-hidden='true']"),
      ).not.toBeNull();
      unmount();
    }
  });

  it("aucun texte atténué par opacité : `text-muted-foreground`, jamais `opacity-*` sur du texte", async () => {
    await openAiSettings([credential()]);
    const page = screen.getByTestId("ai-settings-page");
    expect(page.innerHTML).not.toMatch(/\btext-[a-z-]+\/\d+|\bopacity-\d+/);
  });
});

describe("ordre de focus (§7)", () => {
  // TK-87 : le bloc d'envoi (au-dessus du formulaire) porte « Détails », premier arrêt de tabulation.
  it("« Détails » du bloc d'envoi, champ de clé, puis « Avancé », puis « Enregistrer et vérifier »", async () => {
    await openAiSettings([]);
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Détails" })).toHaveFocus();
    await userEvent.tab();
    expect(keyField()).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Avancé" })).toHaveFocus();
    await userEvent.tab();
    expect(button(SAVE_VERIFY)).toHaveFocus();
  });

  it("avec « Avancé » ouvert : le champ du modèle vient juste après « Avancé »", async () => {
    await openAiSettings([]);
    await userEvent.click(screen.getByRole("button", { name: "Avancé" }));
    await userEvent.tab();
    expect(screen.getByLabelText("Modèle par défaut (facultatif)")).toHaveFocus();
    await userEvent.tab();
    expect(button(SAVE_VERIFY)).toHaveFocus();
  });

  it("carte configurée : Détails, Vérifier à nouveau, Remplacer la clé, Retirer la clé, dans cet ordre", async () => {
    await openAiSettings([credential()]);
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Détails" })).toHaveFocus();
    await userEvent.tab();
    expect(button("Vérifier à nouveau")).toHaveFocus();
    await userEvent.tab();
    expect(button("Remplacer la clé")).toHaveFocus();
    await userEvent.tab();
    expect(button(REMOVE)).toHaveFocus();
  });
});

describe("annonces (§4.7, §7)", () => {
  it("succès : une région d'état polie unique ; aucune alerte", async () => {
    await openAiSettings([]);
    await saveKey();
    await screen.findByText(/Clé enregistrée et vérifiée/);
    const regions = document.querySelectorAll('[role="status"], output');
    expect(regions).toHaveLength(1);
    const live = (regions[0] as HTMLElement).getAttribute("aria-live");
    expect(live === null || live === "polite").toBe(true);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("échec : une seule alerte, et aucune annonce ne cite la clé", async () => {
    procedures.llmCredentialSet.mockRejectedValue(new TypeError("Failed to fetch"));
    await openAiSettings([]);
    await saveKey();
    await screen.findByRole("alert");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    for (const live of document.querySelectorAll('[role="status"], [role="alert"], [aria-live]')) {
      expect(live.textContent).not.toContain("FAKE-KEY");
    }
  });

  it("erreur de champ : reliée par aria-describedby, focus dans le champ", async () => {
    await openAiSettings([]);
    await userEvent.click(button(SAVE_VERIFY));
    const error = await screen.findByText("Saisissez la clé.");
    expect(keyField()).toHaveFocus();
    expect(keyField()).toHaveAttribute("aria-invalid", "true");
    expect((keyField().getAttribute("aria-describedby") ?? "").split(" ")).toContain(error.id);
  });

  it("le bouton d'envoi porte aria-busy pendant l'attente", async () => {
    procedures.llmCredentialVerify.mockReturnValue(new Promise(() => undefined));
    await openAiSettings([]);
    await saveKey();
    expect(
      await screen.findByRole("button", { name: /Vérification…|Enregistrement et vérification…/ }),
    ).toHaveAttribute("aria-busy", "true");
  });

  it("429 : le compte à rebours visible est exclu de la région annoncée (aria-hidden)", async () => {
    procedures.llmCredentialVerify.mockRejectedValue(
      apiError("LLM_RATE_LIMITED", { retryAfterSeconds: 30 }),
    );
    await openAiSettings([]);
    await saveKey();
    const alert = await screen.findByRole("alert");
    expect(alert.querySelector("[aria-hidden='true']:not(svg)")).not.toBeNull();
  });
});

describe("mouvement réduit, cibles tactiles et 375 px (§6)", () => {
  it("chargement : squelette sous motion-safe: uniquement", async () => {
    procedures.llmCredentialList.mockReturnValue(new Promise(() => undefined));
    renderAiSettings();
    const label = await screen.findByText("Chargement des réglages de l'IA…");
    const status = label.closest("[role=status]") as HTMLElement;
    expect(status.innerHTML).toMatch(/motion-safe:animate-pulse/);
    expect(status.innerHTML.replace(/motion-safe:animate-pulse/g, "")).not.toMatch(/animate-/);
  });

  it("boutons et champ de 44 px sous 768 px (h-11), 36 px dès 768 px (md:h-9)", async () => {
    await openAiSettings([]);
    for (const el of [button(SAVE_VERIFY), keyField()]) {
      expect(el.className).toMatch(/\bh-11\b/);
    }
    expect(button(SAVE_VERIFY).className).toMatch(/md:h-9/);
  });

  it("375 px : boutons pleine largeur (w-full) sous md, en rangée dès md", async () => {
    setViewport(MOBILE);
    await openAiSettings([credential()]);
    for (const name of ["Vérifier à nouveau", "Remplacer la clé", REMOVE]) {
      expect(button(name).className).toMatch(/\bw-full\b/);
      expect(button(name).className).toMatch(/md:w-auto/);
    }
  });

  it("375 px : confirmation du retrait, « Garder la clé » en premier, deux boutons empilés", async () => {
    setViewport(MOBILE);
    await openAiSettings([credential()]);
    await userEvent.click(button(REMOVE));
    const group = await screen.findByRole("group", { name: "Confirmer le retrait de la clé" });
    const names = Array.from(group.querySelectorAll("button")).map((b) => b.textContent?.trim());
    expect(names).toEqual(["Garder la clé", "Retirer la clé"]);
    expect(group.className + group.innerHTML).toMatch(/flex-col/);
  });

  it("texte long (modèle, dates) : passe à la ligne, jamais de défilement horizontal", async () => {
    await openAiSettings([
      credential({
        defaultModel: "claude-un-nom-de-modele-vraiment-tres-long-pour-tester-le-retour",
      }),
    ]);
    const page = screen.getByTestId("ai-settings-page");
    expect(page.innerHTML).toMatch(/break-words|break-all|\[overflow-wrap:anywhere\]|min-w-0/);
    // Les pastilles de statut (DESIGN.md v2 §5.1, libellé court et fixe) ne se coupent pas : c'est leur
    // ligne qui passe à la suivante. Le garde porte sur tout le reste de la page.
    const rest = page.cloneNode(true) as HTMLElement;
    for (const pill of rest.querySelectorAll("[data-slot='validation-status']")) pill.remove();
    expect(rest.innerHTML).not.toMatch(/\bwhitespace-nowrap\b|\boverflow-x-(?:auto|scroll)\b/);
  });
});

describe("saisie : aucune annonce ni attribut ne porte la valeur", () => {
  it("aria-*, title, placeholder, data-* : jamais la clé", async () => {
    await openAiSettings([]);
    await typeKey();
    for (const el of Array.from(document.querySelectorAll("*"))) {
      for (const attr of Array.from(el.attributes)) {
        expect(attr.value).not.toContain("FAKE-KEY-NOT-REAL");
      }
    }
  });
});
