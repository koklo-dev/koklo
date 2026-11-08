import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADD_BUTTON,
  button,
  inRow,
  openAddForm,
  openProviders,
  PRIMARY,
  provider,
  SECOND,
  serveProviders,
} from "./support/ai-providers.tsx";
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

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  localStorage.clear();
  serveProviders("owner");
});

/** TK-141 lot C : l'écran Fournisseurs d'IA reprend la maquette 24 avec les composants de packages/ui. */
const pill = (el: HTMLElement) => el.closest<HTMLElement>("[data-slot=pill]");
const usageRow = () => screen.getByRole("listitem", { name: /Cadrage de l'idée/ });

describe("C1 pastilles", () => {
  it("Principal, Secours, Vérifiée (succès) et Intermédiaire sont des Pill sm", async () => {
    await openProviders([PRIMARY, SECOND, provider("openrouter")]);
    const main = pill(inRow(/Anthropic/).getByText("Principal"));
    expect(main).toHaveAttribute("data-size", "sm");
    expect(main).toHaveAttribute("data-tone", "primary");
    expect(pill(inRow(/OpenAI/).getByText("Secours"))).toHaveAttribute("data-tone", "soft");
    const ok = pill(inRow(/Anthropic/).getByText("Vérifiée"));
    expect(ok).toHaveAttribute("data-tone", "success");
    expect(ok?.querySelector("[data-icon=check_circle]")).not.toBeNull();
    const relay = pill(inRow(/OpenRouter/).getByText("Intermédiaire"));
    expect(relay).toHaveAttribute("data-tone", "warning");
    expect(relay?.querySelector("[data-icon=swap_horiz]")).not.toBeNull();
  });
  it("Non vérifiée et Refusée gardent leur ton et leur icône", async () => {
    await openProviders([
      PRIMARY,
      provider("openai", { status: "unverified" }),
      provider("google", { status: "invalid" }),
    ]);
    const unverified = pill(inRow(/OpenAI/).getByText("Non vérifiée"));
    expect(unverified).toHaveAttribute("data-tone", "soft");
    expect(unverified?.querySelector("[data-icon=schedule]")).not.toBeNull();
    const refused = pill(inRow(/Google/).getByText("Refusée"));
    expect(refused).toHaveAttribute("data-tone", "danger");
    expect(refused?.querySelector("[data-icon=error]")).not.toBeNull();
  });
});

describe("C2 boutons et tuile", () => {
  it("boutons de ligne sm dès md, Retirer ghost, Ajouter en lg avec icône add", async () => {
    await openProviders([PRIMARY, SECOND]);
    const row = inRow(/OpenAI/);
    expect(row.getByRole("button", { name: /^Vérifier/ })).toHaveClass("md:h-8");
    const remove = row.getByRole("button", { name: /^Retirer/ });
    expect(remove).toHaveClass("md:h-8");
    expect(remove).not.toHaveClass("border-input");
    const add = button(ADD_BUTTON);
    expect(add).toHaveClass("md:h-10");
    expect(add.querySelector("[data-icon=add]")).not.toBeNull();
  });
  it("Annuler du formulaire d'ajout est ghost", async () => {
    await openProviders([PRIMARY]);
    await openAddForm();
    await userEvent.click(screen.getByRole("radio", { name: /Mistral/ }));
    expect(button("Annuler")).not.toHaveClass("border-input");
  });
  it("tuile Avatar soft 36 à initiales en casse mixte, nom en 600", async () => {
    await openProviders([PRIMARY, SECOND]);
    const row = inRow(/Anthropic/);
    const tile = within(row.getByText("An").closest<HTMLElement>("[data-size]") as HTMLElement);
    expect(tile.getByText("An")).toBeInTheDocument();
    const box = row.getByText("An").closest<HTMLElement>("[data-size]");
    expect(box).toHaveAttribute("data-shape", "tile");
    expect(box).toHaveAttribute("data-tone", "soft");
    expect(box).toHaveAttribute("data-size", "36");
    expect(row.getByText("Anthropic")).toHaveClass("font-semibold");
  });
});

describe("C3 modèle par usage", () => {
  it("modèle courant en IdTag pill avec préfixe, Changer ghost sm avec flèche", async () => {
    procedures.aiSettingsGet.mockResolvedValue({
      fallbackEnabled: false,
      usages: [
        {
          usage: "idea_space",
          isDefault: false,
          provider: "anthropic",
          model: "claude-test-sonnet",
        },
      ],
    });
    await openProviders();
    const tag = within(usageRow()).getByText("claude-test-sonnet").closest("[data-slot=id-tag]");
    expect(tag).not.toBeNull();
    expect(tag).toHaveTextContent("Anthropic · claude-test-sonnet");
    const change = within(usageRow()).getByRole("button", { name: /^Changer/ });
    expect(change).not.toHaveClass("border-input");
    expect(change).toHaveClass("md:h-8");
    expect(change.querySelector("[data-icon=keyboard_arrow_down]")).not.toBeNull();
  });
  it("options en OptionChip ; économique en Pill xs succès", async () => {
    await openProviders();
    await userEvent.click(within(usageRow()).getByRole("button", { name: /^Changer/ }));
    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    for (const option of options) expect(option).toHaveAttribute("data-slot", "option-chip");
    const cheap = pill(screen.getByText("économique"));
    expect(cheap).toHaveAttribute("data-size", "xs");
    expect(cheap).toHaveAttribute("data-tone", "success");
  });
});

describe("C4 secours et consommation", () => {
  it("le secours est un Switch ui : Espace bascule, aria-checked suit", async () => {
    await openProviders();
    const toggle = await screen.findByRole("switch");
    expect(toggle).toHaveAttribute("data-slot", "switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");
    toggle.focus();
    await userEvent.keyboard(" ");
    await waitFor(() => expect(procedures.aiSettingsUpdate).toHaveBeenCalled());
  });
  it("désactivé sous deux fournisseurs, avec la raison visible", async () => {
    await openProviders([PRIMARY]);
    expect(await screen.findByRole("switch")).toBeDisabled();
    expect(
      screen.getByText("Ajoutez un deuxième fournisseur pour activer le secours."),
    ).toBeVisible();
  });
  it("la consommation par fournisseur est une ProgressBar avec jetons et coût", async () => {
    await openProviders();
    const bars = await screen.findAllByRole("progressbar");
    expect(bars).toHaveLength(2);
    expect(bars[0]).toHaveAttribute("aria-valuenow", "65");
    const card = screen.getByRole("region", { name: /^Consommation/ });
    expect(card.textContent?.replace(/\s/g, " ")).toMatch(/Anthropic.*48 k.*≈ 8,10 €/);
  });
  it("total et résumé de jetons sur une ligne alignée sur la base", async () => {
    await openProviders();
    const total = await screen.findByText("≈ 12,40 €");
    expect(total.parentElement).toHaveClass("items-baseline");
  });
});

describe("C5 cartes, icônes et volet d'ajout", () => {
  it("les sections sont des Card panel", async () => {
    await openProviders();
    for (const name of [
      /^Fournisseurs$/,
      /^Modèle par usage$/,
      /^À quoi servent/,
      /^Consommation/,
    ]) {
      const region = await screen.findByRole("region", { name });
      expect(region).toHaveAttribute("data-slot", "card");
      expect(region).toHaveAttribute("data-variant", "panel");
    }
  });
  it("À quoi servent : coches en succès, interdit en danger", async () => {
    await openProviders();
    const card = await screen.findByRole("region", { name: /^À quoi servent/ });
    expect(card.querySelector("[data-icon=check]")).toHaveClass("text-status-validated-foreground");
    expect(card.querySelector("[data-icon=block]")).toHaveClass("text-destructive");
  });
  it("la mention de chiffrement n'apparaît que dans le volet d'ajout", async () => {
    await openProviders();
    expect(screen.queryByText(/Chaque clé est chiffrée/)).not.toBeInTheDocument();
    await openAddForm();
    expect(screen.getByText(/Chaque clé est chiffrée/)).toBeInTheDocument();
  });
  it("cartes radio dans la grille auto-fill 220", async () => {
    await openProviders([PRIMARY]);
    await openAddForm();
    const group = screen.getByRole("radiogroup", { name: "Fournisseur à ajouter" });
    expect(group).toHaveClass("grid-cols-[repeat(auto-fill,minmax(220px,1fr))]");
    expect(screen.getAllByRole("radio")[0]).toHaveAttribute("data-slot", "radio-card");
  });
});

describe("C6 confirmations et titre", () => {
  it("la confirmation passe par un toast, pas par un paragraphe d'écran", async () => {
    await openProviders([PRIMARY, SECOND]);
    await userEvent.click(inRow(/Anthropic/).getByRole("button", { name: /^Vérifier/ }));
    const title = await screen.findByText("Clé vérifiée.");
    expect(title.closest("[data-slot=toast]")).not.toBeNull();
    expect(document.querySelector("p[role=status]")).toBeNull();
  });
  it("h2 20 px, intro sans BYOK, largeur 820", async () => {
    await openProviders();
    const root = screen.getByTestId("ai-settings-page");
    expect(root).toHaveClass("max-w-[820px]");
    expect(within(root).getByRole("heading", { level: 2 })).toHaveClass("text-settings-title");
    expect(root.textContent).not.toMatch(/BYOK/);
  });
});
