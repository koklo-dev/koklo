import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { framingDraftKey } from "../src/lib/framing-draft.ts";
import { PROJECT_ID, SCOPE } from "./support/features.tsx";
import {
  accept,
  askConfirmation,
  BRIEF_OUTPUT,
  card,
  feature,
  generateBrief,
  META,
  openFraming,
  PROPOSALS_OUTPUT,
  PROPOSE,
  serveFraming,
  step,
  stepThree,
  stepTwo,
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
 * TK-59, TEXTE BRUT absolu (relecture de sécurité du ticket 54, non bloquant n°1 ; S-framing §3.5, §5.4) :
 * HTML, javascript:, liens Markdown par référence, //evil.com et images restent des nœuds texte inertes,
 * dans le brief, les propositions, le récapitulatif et le brouillon relu.
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  localStorage.clear();
  serveFraming();
});

const SCRIPT = "<script>window.__pwned = 1</script>";
const IMG = '<img src=x onerror="window.__pwned = 2">';
const REF = "[x][1]\n\n[1]: javascript:alert(1)";
const PROTO = "javascript:alert(1) ftp://evil.example //evil.com www.evil.com";
const MD = "**gras** # titre ![](http://evil.example/p.png) [lien](https://evil.example)";
const HOSTILE = [SCRIPT, IMG, REF, PROTO, MD].join("\n");

const hostileFeature = () =>
  feature(`Titre ${SCRIPT} ${MD}`, "must", {
    description: HOSTILE,
    criteria: [
      {
        title: `Critère ${IMG}`,
        steps: [step("etant_donne", REF), step("quand", PROTO), step("alors", MD)],
      },
    ],
  });
const HOSTILE_TITLE = `Titre ${SCRIPT} ${MD}`;

/** Aucun balisage, lien, image, script ni gestionnaire d'événement ne vient d'une sortie du modèle. */
function expectInert(root: HTMLElement, allowedHrefs: RegExp[] = []) {
  expect(root.querySelector("script, img, iframe, object, embed, svg image, form")).toBeNull();
  expect(root.querySelector("[onerror], [onclick], [onload], [style*='url(']")).toBeNull();
  for (const link of root.querySelectorAll("a[href]")) {
    const href = link.getAttribute("href") ?? "";
    expect(
      allowedHrefs.some((pattern) => pattern.test(href)),
      `lien inattendu : ${href}`,
    ).toBe(true);
  }
  expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
}
const ALLOWED = [/^\/projects(\/[0-9a-f-]{36}\/features(\?feature=F-\d{3})?)?$/];

describe("Propositions hostiles", () => {
  beforeEach(() => {
    procedures.aiProposeFeatures.mockResolvedValue({
      ...PROPOSALS_OUTPUT,
      features: [hostileFeature(), feature("Normale")],
      duplicates: [{ index: 0, specId: "F-003" }],
      meta: META,
    });
  });

  it("titre, description, critères et étapes sont rendus tels quels, sans aucun élément actif", async () => {
    await openFraming();
    await generateBrief();
    await userEvent.click(screen.getByRole("button", { name: PROPOSE }));
    const heading = await findNamed("heading", HOSTILE_TITLE, { level: 3 });
    expect(heading.textContent).toBe(HOSTILE_TITLE);
    const item = card(HOSTILE_TITLE);
    expect(item.textContent).toContain(HOSTILE);
    await userEvent.click(within(item).getByRole("button", { name: "1 critère d'acceptation" }));
    expect(item.textContent).toContain(`Critère ${IMG}`);
    expect(item.textContent).toContain(REF);
    expectInert(stepThree().getByRole("list"), ALLOWED);
  });

  it("le seul lien d'une carte est celui du doublon, construit à partir de F-nnn", async () => {
    await openFraming();
    await generateBrief();
    await userEvent.click(screen.getByRole("button", { name: PROPOSE }));
    await findNamed("heading", HOSTILE_TITLE, { level: 3 });
    const hrefs = Array.from(card(HOSTILE_TITLE).querySelectorAll("a[href]")).map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toEqual([`/projects/${PROJECT_ID}/features?feature=F-003`]);
  });

  it("le récapitulatif de confirmation affiche les titres hostiles en texte brut", async () => {
    await openFraming();
    await generateBrief();
    await userEvent.click(screen.getByRole("button", { name: PROPOSE }));
    await findNamed("heading", HOSTILE_TITLE, { level: 3 });
    await accept(HOSTILE_TITLE);
    const panel = await askConfirmation();
    expect(panel.getByText(HOSTILE_TITLE, { exact: false })).toBeVisible();
    expectInert(screen.getByRole("group", { name: "Confirmer l'enregistrement" }));
  });

  it("l'annonce de la région d'état reste du texte", async () => {
    await openFraming();
    await generateBrief();
    await userEvent.click(screen.getByRole("button", { name: PROPOSE }));
    await findNamed("heading", HOSTILE_TITLE, { level: 3 });
    await accept(HOSTILE_TITLE);
    expectInert(screen.getByRole("status"));
  });
});

describe("Brief hostile", () => {
  it("champs et questions ouvertes d'un brief hostile : valeurs de champs, aucun balisage", async () => {
    procedures.aiDraftBrief.mockResolvedValue({
      brief: {
        ...BRIEF_OUTPUT.brief,
        title: SCRIPT,
        problem: HOSTILE,
        openQuestions: [REF, `${IMG} ?`, PROTO],
      },
      meta: META,
    });
    await openFraming();
    await generateBrief();
    expect(stepTwo().getByRole("textbox", { name: /^Titre/ })).toHaveValue(SCRIPT);
    expect(stepTwo().getByRole("textbox", { name: /^Problème/ })).toHaveValue(HOSTILE);
    expectInert(screen.getByRole("region", { name: /Le brief/ }), ALLOWED);
    await userEvent.click(screen.getByRole("button", { name: "Répondre aux questions" }));
    expectInert(screen.getByRole("region", { name: /Le brief/ }), ALLOWED);
  });

  it("des questions ouvertes affichées comme texte (aide à la réponse) restent inertes", async () => {
    procedures.aiDraftBrief.mockResolvedValue({
      brief: { ...BRIEF_OUTPUT.brief, openQuestions: [REF, PROTO] },
      meta: META,
    });
    await openFraming();
    await generateBrief();
    await userEvent.click(screen.getByRole("button", { name: "Répondre aux questions" }));
    expect(document.body.textContent).toContain("javascript:alert(1)");
    expect(
      document.querySelector("a[href^='javascript'], a[href^='//'], a[href*='evil']"),
    ).toBeNull();
  });
});

describe("Brouillon relu du stockage : valeurs non fiables", () => {
  it("un brouillon bien formé mais hostile est rendu en texte brut", async () => {
    const hostile = hostileFeature();
    localStorage.setItem(
      framingDraftKey(PROJECT_ID),
      JSON.stringify({
        mode: "idea",
        idea: HOSTILE,
        clarifications: "",
        pastedBrief: "",
        brief: {
          title: SCRIPT,
          problem: IMG,
          users: REF,
          expectedOutcome: PROTO,
          constraints: MD,
          openQuestions: "",
        },
        answers: [],
        proposals: [
          { id: "p1", status: "to_review", value: hostile, original: hostile, duplicateOf: null },
        ],
        savedAt: new Date().toISOString(),
        ownerId: SCOPE.userId,
        organizationId: SCOPE.organizationId,
      }),
    );
    await openFraming();
    await findNamed("heading", HOSTILE_TITLE, { level: 3 });
    expect(screen.getByRole("textbox", { name: /^Votre idée/ })).toHaveValue(HOSTILE);
    expectInert(document.body, [...ALLOWED, /^#/]);
  });
});
