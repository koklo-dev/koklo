import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROJECT_ID } from "./support/features.tsx";
import {
  BRIEF_OUTPUT,
  briefCalls,
  generateBrief,
  IDEA,
  liveText,
  openFraming,
  PROPOSE,
  paste,
  proposeCalls,
  serveFraming,
  stepTwo,
} from "./support/framing.tsx";
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
 * TK-59 / 59a, étape 2 « Le brief » (S-framing §3.4) : champs éditables, concaténation envoyée à
 * ai.proposeFeatures, badge « Proposé par l'IA », questions ouvertes, ligne technique réservée à l'équipe.
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
  serveFraming();
});

const FIELDS: Array<[RegExp, string]> = [
  [/^Titre/, BRIEF_OUTPUT.brief.title],
  [/^Problème/, BRIEF_OUTPUT.brief.problem],
  [/^Utilisateurs/, BRIEF_OUTPUT.brief.users],
  [/^Résultat attendu/, BRIEF_OUTPUT.brief.expectedOutcome],
  [/^Contraintes/, BRIEF_OUTPUT.brief.constraints],
  [/^Questions ouvertes/, BRIEF_OUTPUT.brief.openQuestions.join("\n")],
];

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Brief éditable", () => {
  it("six champs avec label visible, préremplis par la réponse, tous modifiables", async () => {
    await openFraming();
    await generateBrief();
    for (const [label, value] of FIELDS) {
      const field = stepTwo().getByRole("textbox", { name: label });
      expect(field).toHaveValue(value);
      expect(field).toBeEnabled();
      expect(field).not.toHaveAttribute("readonly");
    }
  });

  it("badge « Proposé par l'IA » (icône + texte), retiré dès la première modification du champ concerné", async () => {
    await openFraming();
    await generateBrief();
    const badges = () => stepTwo().queryAllByText("Proposé par l'IA");
    const before = badges().length;
    expect(before).toBeGreaterThan(0);
    await paste(stepTwo().getByRole("textbox", { name: /^Problème/ }), "Autre problème");
    expect(badges().length).toBeLessThan(before);
  });

  it("l'envoi à proposeFeatures concatène les champs édités en un seul texte (1 à 20 000 caractères)", async () => {
    await openFraming();
    await generateBrief();
    await paste(
      stepTwo().getByRole("textbox", { name: /^Problème/ }),
      "Problème corrigé par l'humain",
    );
    await userEvent.click(screen.getByRole("button", { name: PROPOSE }));
    await findNamed("heading", /^3\. Les propositions/);
    const [call] = proposeCalls();
    expect(call).toMatchObject({ projectId: PROJECT_ID });
    const brief = String(call?.brief);
    for (const part of [
      BRIEF_OUTPUT.brief.title,
      "Problème corrigé par l'humain",
      BRIEF_OUTPUT.brief.users,
      BRIEF_OUTPUT.brief.expectedOutcome,
      BRIEF_OUTPUT.brief.constraints,
      BRIEF_OUTPUT.brief.openQuestions[0] as string,
    ]) {
      expect(brief).toContain(part);
    }
    expect(brief).not.toContain(BRIEF_OUTPUT.brief.problem);
    expect(brief.length).toBeLessThanOrEqual(20_000);
    expect(call).not.toHaveProperty("maxFeatures");
  });

  it("un brief vidé de tout contenu ne peut pas partir : bouton d'appel inactif ou erreur liée, aucun appel", async () => {
    await openFraming();
    await generateBrief();
    for (const [label] of FIELDS) await paste(stepTwo().getByRole("textbox", { name: label }), "");
    await userEvent.click(screen.getByRole("button", { name: PROPOSE }));
    expect(proposeCalls()).toHaveLength(0);
  });

  it("le bloc « ce qui est envoyé » précède le bouton « Proposer des fonctionnalités avec l'IA »", async () => {
    await openFraming();
    await generateBrief();
    const headings = screen.getAllByRole("heading", {
      name: "Ce qui est envoyé à Anthropic",
      level: 3,
    });
    const button = screen.getByRole("button", { name: PROPOSE });
    const last = headings.at(-1) as HTMLElement;
    expect(last.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("« Revenir à l'idée » ramène à l'étape 1 avec l'idée conservée", async () => {
    await openFraming();
    await generateBrief();
    await userEvent.click(screen.getByRole("button", { name: "Revenir à l'idée" }));
    expect(await screen.findByRole("textbox", { name: /^Votre idée/ })).toHaveValue(IDEA);
  });
});

describe("Questions ouvertes (§3.4)", () => {
  it("texte d'aide, puis « Répondre aux questions » ouvre un champ de réponse par question", async () => {
    await openFraming();
    await generateBrief();
    expect(screen.getByText("Répondre à ces questions améliore le brief.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Répondre aux questions" }));
    expect(screen.getAllByRole("textbox", { name: /^Réponse/ })).toHaveLength(2);
  });

  it("« Régénérer le brief » relance draftBrief avec les réponses dans answers, jamais automatiquement", async () => {
    await openFraming();
    await generateBrief();
    expect(briefCalls()).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Répondre aux questions" }));
    const [first] = screen.getAllByRole("textbox", { name: /^Réponse/ });
    await paste(first as HTMLElement, "Oui, par carte");
    expect(briefCalls()).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Régénérer le brief" }));
    await findNamed("button", "Régénérer le brief");
    expect(briefCalls()).toHaveLength(2);
    expect(briefCalls()[1]).toMatchObject({
      projectId: PROJECT_ID,
      idea: IDEA,
      answers: expect.arrayContaining([expect.stringContaining("Oui, par carte")]),
    });
  });
});

describe("Régénérer après des corrections humaines", () => {
  async function editThenRegenerate() {
    await openFraming();
    await generateBrief();
    await paste(screen.getByRole("textbox", { name: /^Titre/ }), "Titre corrigé");
    await userEvent.click(screen.getByRole("button", { name: "Répondre aux questions" }));
    await userEvent.click(screen.getByRole("button", { name: "Régénérer le brief" }));
  }

  it("demande confirmation avant d'écraser : aucun appel tant que rien n'est confirmé", async () => {
    await editThenRegenerate();
    expect(screen.getByRole("group", { name: "Confirmer la régénération" })).toHaveTextContent(
      "Vos modifications du brief seront remplacées",
    );
    expect(briefCalls()).toHaveLength(1);
  });

  it("« Garder mon brief » conserve les corrections sans appel", async () => {
    await editThenRegenerate();
    await userEvent.click(screen.getByRole("button", { name: "Garder mon brief" }));
    expect(briefCalls()).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: /^Titre/ })).toHaveDisplayValue(/Titre corrigé/);
    expect(screen.queryByRole("group", { name: "Confirmer la régénération" })).toBeNull();
  });

  it("« Remplacer le brief » relance l'appel", async () => {
    await editThenRegenerate();
    await userEvent.click(screen.getByRole("button", { name: "Remplacer le brief" }));
    await waitFor(() => expect(briefCalls()).toHaveLength(2));
  });
});

/** La ligne technique est repliée (équipe seulement) : on ouvre « Détails techniques ». */
async function openTechnical() {
  await userEvent.click(await findNamed("button", /^Détails techniques/));
}

describe("Ligne technique repliée (§3.4)", () => {
  it("l'équipe lit « Modèle : claude-test-1 · 812 / 344 jetons », jamais de coût monétaire", async () => {
    await openFraming();
    await generateBrief();
    expect(screen.getByRole("button", { name: /^Détails techniques/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await openTechnical();
    const text = (document.body.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toMatch(/Modèle : claude-test-1 · 812 \/ 344 jetons/);
    expect(text).not.toMatch(/€|\$|\bUSD\b|\bEUR\b|coût de/i);
  });

  it("le mot « jetons » n'apparaît nulle part ailleurs que dans cette ligne", async () => {
    await openFraming();
    await generateBrief();
    await openTechnical();
    const text = (document.body.textContent ?? "").replace(/\s+/g, " ");
    expect(text.match(/jetons?/gi)).toHaveLength(1);
    expect(text).not.toMatch(/\b(prompt|token|commit|branche)\b/i);
  });
});

describe("Fin d'appel : focus et annonce (§4.3)", () => {
  it("le focus passe au h2 de l'étape 2 (tabindex -1) et la région d'état annonce « Brief prêt, relisez-le. »", async () => {
    await openFraming();
    await generateBrief();
    const h2 = screen.getByRole("heading", { name: /^2\. Le brief/, level: 2 });
    expect(h2).toHaveAttribute("tabindex", "-1");
    expect(h2).toHaveFocus();
    expect(liveText()).toContain("Brief prêt, relisez-le.");
  });

  it("l'annonce n'est faite qu'une fois", async () => {
    await openFraming();
    await generateBrief();
    await paste(
      within(screen.getByRole("region", { name: /Le brief/ })).getByRole("textbox", {
        name: /^Problème/,
      }),
      "x",
    );
    expect(liveText().match(/Brief prêt/g) ?? []).toHaveLength(1);
  });
});
