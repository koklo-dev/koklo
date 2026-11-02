import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROJECT_ID } from "./support/features.tsx";
import {
  accept,
  card,
  feature,
  generateBrief,
  inCard,
  liveText,
  META,
  openFraming,
  PROPOSALS_OUTPUT,
  PROPOSE,
  proposeCalls,
  proposeFeatures,
  reject,
  saveBar,
  serveFraming,
  stepThree,
  submits,
  T1,
  T2,
  T3,
} from "./support/framing.tsx";
import { findNamed } from "./support/wait.ts";
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

/**
 * TK-59 / 59b, étape 3 « Les propositions » (S-framing §3.5, §4.4, §5.2) : cartes À relire / Acceptée / Rejetée,
 * rien d'accepté par défaut, doublons non bloquants, remplacement confirmé en ligne.
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
  serveFraming();
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Liste des propositions", () => {
  it("une phrase de consigne, une ol, un li par proposition, un h3 par titre, dans l'ordre reçu", async () => {
    await openFraming();
    await proposeFeatures();
    expect(
      screen.getByText("Relisez chaque proposition. Rien n'est accepté par défaut."),
    ).toBeVisible();
    const list = stepThree().getByRole("list");
    expect(list.tagName).toBe("OL");
    const titles = within(list)
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(titles).toEqual([T1, T2, T3]);
  });

  it("rien n'est accepté par défaut : trois « À relire », aucun appel d'écriture", async () => {
    await openFraming();
    await proposeFeatures();
    for (const title of [T1, T2, T3]) {
      expect(inCard(title).getByText("À relire")).toBeVisible();
      expect(inCard(title).queryByText("Acceptée")).not.toBeInTheDocument();
    }
    expect(submits()).toHaveLength(0);
  });

  it("la carte porte la priorité en mots, le badge « Proposé par l'IA » et le statut en badge outline icône + texte", async () => {
    await openFraming();
    await proposeFeatures();
    expect(inCard(T1).getByText("Indispensable")).toBeVisible();
    expect(inCard(T2).getByText("Importante")).toBeVisible();
    expect(inCard(T3).getByText("Souhaitable")).toBeVisible();
    expect(inCard(T1).getByText("Proposé par l'IA")).toBeVisible();
    const badge = inCard(T1).getByText("À relire").closest("[data-slot='badge']") as HTMLElement;
    expect(badge).not.toBeNull();
    expect(badge.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    expect(badge.className).not.toMatch(/status-|bg-primary|violet|purple/);
  });

  it("description à retours à la ligne conservés (pre-wrap), repliée avec « Afficher la suite » / « Réduire »", async () => {
    procedures.aiProposeFeatures.mockResolvedValue({
      ...PROPOSALS_OUTPUT,
      features: [
        feature(T1, "must", {
          description: Array.from({ length: 8 }, (_, i) => `Ligne ${i + 1}`).join("\n"),
        }),
        feature(T2),
      ],
      duplicates: [],
    });
    await openFraming();
    await proposeFeatures();
    const toggle = inCard(T1).getByRole("button", { name: "Afficher la suite" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const description = inCard(T1).getByText(/Ligne 1/);
    expect(description.className).toMatch(/whitespace-pre-wrap/);
    expect(description.textContent).toContain("Ligne 1\nLigne 2");
    await userEvent.click(toggle);
    expect(inCard(T1).getByRole("button", { name: "Réduire" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("critères d'acceptation dans un accordéon fermé : « 2 critères d'acceptation », étapes avec mot d'ouverture en gras", async () => {
    await openFraming();
    await proposeFeatures();
    const trigger = inCard(T1).getByRole("button", { name: "2 critères d'acceptation" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    const criteria = inCard(T1)
      .getAllByRole("list")
      .find((l) => l.tagName === "OL");
    expect(criteria).toBeDefined();
    const first = within(criteria as HTMLElement).getAllByRole("listitem")[0] as HTMLElement;
    expect(first).toHaveTextContent("Cas nominal de Réserver un créneau");
    const opening = Array.from(first.querySelectorAll("strong")).map((s) => s.textContent);
    expect(opening).toEqual(["Étant donné", "Quand", "Alors"]);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Accepter, rejeter, reprendre", () => {
  it("« Accepter » : badge « Acceptée », le bouton cliqué devient « Reprendre » et GARDE le focus, annonce de la région d'état", async () => {
    await openFraming();
    await proposeFeatures();
    await accept(T1);
    expect(inCard(T1).getByText("Acceptée")).toBeVisible();
    const again = inCard(T1).getByRole("button", { name: "Reprendre" });
    expect(again).toHaveFocus();
    expect(liveText()).toContain("Proposition « Réserver un créneau » acceptée.");
  });

  it("« Rejeter » : badge « Rejetée », « Rejeter » devient « Reprendre », contenu lisible conservé", async () => {
    await openFraming();
    await proposeFeatures();
    await reject(T2);
    expect(inCard(T2).getByText("Rejetée")).toBeVisible();
    expect(inCard(T2).getByRole("button", { name: "Reprendre" })).toHaveFocus();
    expect(inCard(T2).getByText(/Description de Annuler une réservation/)).toBeVisible();
    expect(liveText()).toContain("Proposition « Annuler une réservation » rejetée.");
  });

  it("« Reprendre » remet la carte à relire", async () => {
    await openFraming();
    await proposeFeatures();
    await reject(T2);
    await userEvent.click(inCard(T2).getByRole("button", { name: "Reprendre" }));
    expect(inCard(T2).getByText("À relire")).toBeVisible();
    expect(inCard(T2).getByRole("button", { name: "Rejeter" })).toBeVisible();
  });

  it("une carte rejetée peut être acceptée directement", async () => {
    await openFraming();
    await proposeFeatures();
    await reject(T2);
    await accept(T2);
    expect(inCard(T2).getByText("Acceptée")).toBeVisible();
  });

  it("le titre annoncé est tronqué à 60 caractères", async () => {
    const long = "T".repeat(90);
    procedures.aiProposeFeatures.mockResolvedValue({
      ...PROPOSALS_OUTPUT,
      features: [feature(long)],
      duplicates: [],
    });
    await openFraming();
    await generateBrief();
    await userEvent.click(screen.getByRole("button", { name: PROPOSE }));
    await findNamed("heading", long, { level: 3 });
    await accept(long);
    expect(liveText()).toContain(`« ${"T".repeat(60)}`);
    expect(liveText()).not.toContain("T".repeat(61));
  });

  it("compteur dans la région d'état : « N acceptée(s) sur M » puis « K rejetée(s) »", async () => {
    await openFraming();
    await proposeFeatures();
    await accept(T1);
    expect(liveText()).toMatch(/1 acceptée sur 3/);
    await accept(T2);
    await reject(T3);
    expect(liveText()).toMatch(/2 acceptées sur 3/);
    expect(liveText()).toMatch(/1 rejetée/);
  });

  it("actions de chaque carte : vrais boutons « Accepter », « Rejeter », « Modifier » dans cet ordre", async () => {
    await openFraming();
    await proposeFeatures();
    const names = within(card(T1))
      .getAllByRole("button")
      .map((b) => b.textContent);
    const order = names.filter((n) => ["Accepter", "Rejeter", "Modifier"].includes(n ?? ""));
    expect(order).toEqual(["Accepter", "Rejeter", "Modifier"]);
  });
});

describe("Doublons (non bloquants)", () => {
  it("« Titre déjà présent : F-003 » avec icône + lien « Voir F-003 » construit par l'application", async () => {
    await openFraming();
    await proposeFeatures();
    const line = inCard(T3).getByText("Titre déjà présent : F-003");
    expect(line.closest("div,p,li")?.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    expect(inCard(T3).getByRole("link", { name: "Voir F-003" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/features?feature=F-003`,
    );
    expect(within(card(T1)).queryByText(/déjà présent/)).not.toBeInTheDocument();
  });

  it("un doublon peut quand même être accepté", async () => {
    await openFraming();
    await proposeFeatures();
    await accept(T3);
    expect(inCard(T3).getByText("Acceptée")).toBeVisible();
  });

  it("un index de doublon hors de la liste est ignoré sans casser l'écran", async () => {
    procedures.aiProposeFeatures.mockResolvedValue({
      ...PROPOSALS_OUTPUT,
      duplicates: [{ index: 9, specId: "F-009" }],
    });
    await openFraming();
    await proposeFeatures();
    expect(screen.queryByText(/déjà présent/)).not.toBeInTheDocument();
  });

  it("toutes en doublon : note (pas d'alerte, réservée à l'échec d'un appel) « Toutes ces propositions ressemblent à des fonctionnalités existantes. », liste conservée", async () => {
    procedures.aiProposeFeatures.mockResolvedValue({
      ...PROPOSALS_OUTPUT,
      features: PROPOSALS_OUTPUT.features.slice(0, 2),
      duplicates: [
        { index: 0, specId: "F-001" },
        { index: 1, specId: "F-002" },
      ],
    });
    await openFraming();
    await proposeFeatures();
    expect(screen.getByRole("note")).toHaveTextContent(
      "Toutes ces propositions ressemblent à des fonctionnalités existantes.",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(
      expect.arrayContaining([T1, T2]),
    );
  });
});

describe("Aucune proposition (§4.4)", () => {
  it("carte « L'IA n'a proposé aucune fonctionnalité nouvelle. », conseil et « Revenir au brief »", async () => {
    procedures.aiProposeFeatures.mockResolvedValue({
      ...PROPOSALS_OUTPUT,
      features: [],
      duplicates: [],
    });
    await openFraming();
    await generateBrief();
    await userEvent.click(screen.getByRole("button", { name: PROPOSE }));
    expect(
      await screen.findByText("L'IA n'a proposé aucune fonctionnalité nouvelle."),
    ).toBeVisible();
    expect(screen.getByText("Précisez le brief et réessayez.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Revenir au brief" }));
    expect(await screen.findByRole("textbox", { name: /^Titre/ })).toBeVisible();
    expect(saveBar()).toBeNull();
  });
});

describe("« Proposer d'autres fonctionnalités » (§3.5)", () => {
  const again = () => screen.getByRole("button", { name: "Proposer d'autres fonctionnalités" });

  it("avec des propositions : confirmation en ligne « Les propositions actuelles seront remplacées. », focus sur « Garder », aucun appel", async () => {
    await openFraming();
    await proposeFeatures();
    await userEvent.click(again());
    expect(screen.getByText("Les propositions actuelles seront remplacées.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Garder" })).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(proposeCalls()).toHaveLength(1);
  });

  it("« Garder » referme sans appel ; propositions et statuts intacts", async () => {
    await openFraming();
    await proposeFeatures();
    await accept(T1);
    await userEvent.click(again());
    await userEvent.click(screen.getByRole("button", { name: "Garder" }));
    expect(
      screen.queryByText("Les propositions actuelles seront remplacées."),
    ).not.toBeInTheDocument();
    expect(proposeCalls()).toHaveLength(1);
    expect(inCard(T1).getByText("Acceptée")).toBeVisible();
  });

  it("« Remplacer » relance proposeFeatures et remet tout à relire", async () => {
    await openFraming();
    await proposeFeatures();
    await accept(T1);
    procedures.aiProposeFeatures.mockResolvedValue({
      ...PROPOSALS_OUTPUT,
      features: [feature("Nouvelle idée")],
      duplicates: [],
      meta: META,
    });
    await userEvent.click(again());
    await userEvent.click(screen.getByRole("button", { name: "Remplacer" }));
    await findNamed("heading", "Nouvelle idée", { level: 3 });
    expect(proposeCalls()).toHaveLength(2);
    expect(screen.queryByRole("heading", { name: T1, level: 3 })).not.toBeInTheDocument();
    expect(inCard("Nouvelle idée").getByText("À relire")).toBeVisible();
  });

  it("un échec de la relance conserve les propositions actuelles", async () => {
    await openFraming();
    await proposeFeatures();
    procedures.aiProposeFeatures.mockRejectedValue(
      Object.assign(new Error("x"), { code: "LLM_OUTPUT_INVALID" }),
    );
    await userEvent.click(again());
    await userEvent.click(screen.getByRole("button", { name: "Remplacer" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
    expect(screen.getByRole("heading", { name: T1, level: 3 })).toBeVisible();
  });
});
