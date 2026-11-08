import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  AXE_TAGS,
  CAPTURES_DIR,
  ideaChatsSeen,
  releaseIdeaStream,
  setScenario,
  settle,
} from "./support/helpers.ts";
import { IDEA_PROJECT_ID, type IdeaMode } from "./support/stub-idea-agent.ts";

/**
 * TK-90 lot B, panneau de l'agent de l'espace Idée (design/screens/S-idea.md v2). Pile locale : faux API avec modèle
 * SIMULÉ (support/stub-idea-agent.ts), navigateur réel, jamais d'appel d'IA. Chaque état : axe sans violation et
 * captures clair, sombre et 375 px dans design/screens/captures/S-idea/agent-<état>-<thème>.png.
 */
const PATH = `/projects/${IDEA_PROJECT_ID}/idea?page=05-perimetre`;
const FRAME = "Proposition de l'agent";
type Role = "owner" | "client" | "business";

async function open(page: Page, idea: IdeaMode, role: Role = "owner") {
  await setScenario({ session: true, projects: "data", idea, role });
  await page.goto(PATH);
  await expect(page.getByRole("textbox", { name: "Titre de la page" })).toHaveValue("Périmètre");
}
const frame = (page: Page) => page.getByRole("region", { name: FRAME });
const composer = (page: Page) => page.getByRole("textbox", { name: "Message à l'agent" });
const send = (page: Page) => page.getByRole("button", { name: "Envoyer" });

async function noViolations(page: Page) {
  await settle(page);
  const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const found = result.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 300)}`);
  expect(found).toEqual([]);
}

interface State {
  name: string;
  idea: IdeaMode;
  role?: Role;
  /** Amène l'écran à l'état à capturer (avant lui, le monde simulé est neuf). */
  reach?: (page: Page) => Promise<void>;
  ready: (page: Page) => Promise<void>;
}

/** Axe puis capture de l'état courant sous le nom `agent-<état>-<suffixe>.png`. */
async function shoot(page: Page, name: string, suffix: string) {
  await noViolations(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `${CAPTURES_DIR}/S-idea/agent-${name}-${suffix}.png`,
    fullPage: true,
  });
}

async function reach(page: Page, state: State) {
  await open(page, state.idea, state.role);
  await state.reach?.(page);
  await state.ready(page);
}

/** Clair et sombre au bureau (classe `dark` comme la bascule de thème), puis 375 px en clair. */
async function captureAll(page: Page, state: State) {
  await reach(page, state);
  await shoot(page, state.name, "clair");
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await shoot(page, state.name, "sombre");
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.setViewportSize({ width: 375, height: 812 });
  await reach(page, state);
  await shoot(page, state.name, "375");
}

const STATES: State[] = [
  {
    name: "vide",
    idea: "empty",
    ready: (p) => expect(p.getByText(/Qu'est-ce que ce produit change/)).toBeVisible(),
  },
  {
    name: "fil",
    idea: "thread",
    ready: (p) => expect(p.getByText(/Sur place au début/)).toBeVisible(),
  },
  { name: "proposition", idea: "proposal", ready: (p) => expect(frame(p)).toBeVisible() },
  {
    name: "propositions",
    idea: "proposals",
    ready: (p) => expect(p.getByText("Proposition 3 sur 3")).toBeVisible(),
  },
  {
    name: "remplacement",
    idea: "replace",
    ready: (p) => expect(p.getByText("Texte remplacé")).toBeAttached(),
  },
  {
    name: "page-proposee",
    idea: "pagePending",
    ready: (p) => expect(p.getByRole("group", { name: "Page proposée par l'agent" })).toBeVisible(),
  },
  {
    name: "perimee",
    idea: "stale",
    ready: (p) => expect(p.getByText("Le texte a changé depuis cette proposition.")).toBeVisible(),
  },
  { name: "hostile", idea: "hostile", ready: (p) => expect(frame(p)).toBeVisible() },
  {
    name: "sans-cle",
    idea: "notConfigured",
    ready: (p) => expect(p.getByText(/aucune clé d'IA/)).toBeVisible(),
  },
  {
    name: "flux",
    idea: "streaming",
    reach: async (p) => {
      await composer(p).fill("Bonjour");
      await send(p).click();
    },
    ready: (p) => expect(p.getByRole("button", { name: "Arrêter" })).toBeVisible(),
  },
  {
    name: "limite",
    idea: "rateLimited",
    reach: async (p) => {
      await composer(p).fill("Ma réponse");
      await send(p).click();
    },
    ready: (p) => expect(p.getByText("Trop de demandes pour le moment.")).toBeVisible(),
  },
  {
    name: "client",
    idea: "thread",
    role: "client",
    ready: (p) => expect(p.getByRole("complementary", { name: "Agent" })).toBeVisible(),
  },
];

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: une suite d'e2e, un test par comportement
test.describe("Panneau de l'agent (TK-90)", () => {
  for (const state of STATES) {
    test(`état ${state.name} : axe et captures`, async ({ page }) => {
      await open(page, state.idea);
      await captureAll(page, state);
    });
  }

  test("1280 × 720, document long : saisie et mention visibles sans défilement (F1)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page, "proposals");
    await expect(page.getByText("Proposition 3 sur 3")).toBeAttached();
    const inView = async (locator: ReturnType<Page["getByRole"]>) => {
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(720);
    };
    await inView(composer(page));
    await inView(page.getByRole("note"));
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      720,
    );
    await noViolations(page);
    await page.screenshot({ path: `${CAPTURES_DIR}/S-idea/agent-fenetre-clair.png` });
  });

  test("sélection dans l'article défilé : barre flottante visible, texte immobile (F14)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page, "proposals");
    const article = page.getByRole("article", { name: "Page du dossier" });
    await article.evaluate((el) => {
      el.scrollTop = 400;
    });
    const target = page.getByText("Annuler une réservation").first();
    const top = async () => (await target.boundingBox())?.y ?? Number.NaN;
    const before = await top();
    await target.dblclick();
    const develop = page.getByRole("button", { name: "Développer" });
    await expect(develop).toBeVisible();
    const inside = async (outer: Locator) => {
      const [a, b] = await Promise.all([develop.boundingBox(), outer.boundingBox()]);
      expect(a && b).toBeTruthy();
      if (!a || !b) return;
      expect(a.y).toBeGreaterThanOrEqual(b.y);
      expect(a.y + a.height).toBeLessThanOrEqual(b.y + b.height);
    };
    await inside(page.locator("html"));
    await inside(article);
    expect(Math.abs((await top()) - before)).toBeLessThanOrEqual(2);
    await noViolations(page);
    await page.screenshot({ path: `${CAPTURES_DIR}/S-idea/agent-selection-defilee-clair.png` });
  });

  test("clavier : Alt+F10, flèches, Échap, premier Tab depuis un paragraphe (F15, F16)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page, "proposals");
    const editor = page.getByRole("textbox", { name: /Contenu de la page/ });
    await expect(editor).toHaveAttribute("aria-keyshortcuts", "Alt+F10");
    const bar = page.getByRole("toolbar", { name: "Mise en forme" });
    const selected = () => page.evaluate(() => window.getSelection()?.toString() ?? "");

    await page.getByText("Annuler une réservation").first().dblclick();
    await expect(bar).toBeVisible();
    const before = await selected();
    await page.keyboard.press("Alt+F10");
    await expect(page.getByRole("button", { name: "Gras" })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("button", { name: "Italique" })).toBeFocused();
    await noViolations(page);
    await page.keyboard.press("Escape");
    await expect(bar).toBeHidden();
    await expect(editor).toBeFocused();
    expect(await selected()).toBe(before);

    // Depuis un paragraphe (sans proposition entre lui et la barre) : le premier Tab s'arrête sur « Gras »,
    // pas sur l'enveloppe du menu.
    await open(page, "thread");
    await page.getByText("Ce qui entre dans la première version du portail.").dblclick();
    await expect(bar).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Gras" })).toBeFocused();
  });

  test("Échap ne ferme la barre que pour la sélection en cours (F17)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page, "proposals");
    const bar = page.getByRole("toolbar", { name: "Mise en forme" });
    const bold = page.getByRole("button", { name: "Gras" });
    await page.getByText("Annuler une réservation").first().dblclick();
    await expect(bar).toBeVisible();
    await page.keyboard.press("Alt+F10");
    await expect(bold).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(bar).toBeHidden();
    // Alt+F10 juste après Échap : la barre revient et prend le focus.
    await page.keyboard.press("Alt+F10");
    await expect(bar).toBeVisible();
    await expect(bold).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(bar).toBeHidden();
    // Nouvelle sélection à la souris : la barre revient.
    await page.getByText("Ce qui entre dans la première version du portail.").dblclick();
    await expect(bar).toBeVisible();
    await noViolations(page);
  });

  test("375 px : la barre flottante ne déborde pas de l'écran (F14)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, "proposals");
    await page.getByText("Annuler une réservation").first().dblclick();
    const bar = page.getByRole("toolbar", { name: "Mise en forme" });
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 999)).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      375,
    );
  });

  test("envoyer un message : flux, réponse, saisie vidée, aucun fournisseur nommé", async ({
    page,
  }) => {
    await open(page, "empty");
    await composer(page).fill("Pour les clients qui réservent du téléphone.");
    await send(page).click();
    await expect(page.getByText(/je reviens avec une proposition/).first()).toBeVisible();
    await expect(composer(page)).toHaveValue("");
    expect((await ideaChatsSeen())[0]).toMatchObject({
      mode: "interview",
      text: "Pour les clients qui réservent du téléphone.",
    });
    expect((await page.locator("body").textContent()) ?? "").not.toMatch(/anthropic/i);
  });

  test("Arrêter pendant le flux, puis la saisie redevient disponible", async ({ page }) => {
    await open(page, "streaming");
    await composer(page).fill("Bonjour");
    await send(page).click();
    await expect(page.getByRole("button", { name: "Arrêter" })).toBeVisible();
    await page.getByRole("button", { name: "Arrêter" }).click();
    await expect(page.getByRole("button", { name: "Envoyer" })).toBeVisible();
    await expect(composer(page)).toBeFocused();
    await releaseIdeaStream();
  });

  test("limite atteinte : alerte et saisie conservée", async ({ page }) => {
    await open(page, "rateLimited");
    await composer(page).fill("Ma réponse");
    await send(page).click();
    await expect(page.getByText("Trop de demandes pour le moment.")).toBeVisible();
    await expect(composer(page)).toHaveValue("Ma réponse");
  });

  test("proposition : Accepter insère le texte, « Annuler » le retire", async ({ page }) => {
    await open(page, "proposal");
    const inserted = page.locator(".ProseMirror > h3", { hasText: "Hors périmètre" });
    await frame(page)
      .getByRole("button", { name: /Accepter/ })
      .click();
    await expect(page.getByRole("status").filter({ hasText: "acceptée par vous" })).toBeVisible();
    await expect(inserted).toHaveCount(1);
    await expect(frame(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Annuler" }).click();
    await expect(inserted).toHaveCount(0);
    await expect(frame(page)).toBeVisible();
  });

  test("raccourci R rejette quand le focus est dans la proposition", async ({ page }) => {
    await open(page, "proposal");
    await frame(page).getByRole("button", { name: "Modifier" }).focus();
    await page.keyboard.press("r");
    await expect(
      page.getByRole("status").filter({ hasText: "Proposition rejetée." }),
    ).toBeVisible();
    await expect(frame(page)).toHaveCount(0);
  });

  test("focus après une décision : Annuler, puis le cadre rétabli (F18)", async ({ page }) => {
    await open(page, "proposal");
    const undo = page.getByRole("button", { name: "Annuler" });
    await frame(page).getByRole("button", { name: "Modifier" }).focus();
    await page.keyboard.press("a");
    await expect(undo).toBeFocused();
    await noViolations(page);
    await page.keyboard.press("Enter");
    await expect(frame(page)).toBeFocused();
    await page.keyboard.press("r");
    await expect(undo).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(frame(page)).toBeFocused();
    await noViolations(page);
  });

  test("proposition périmée : Rejeter la retire, le focus va à Annuler (F19, F18)", async ({
    page,
  }) => {
    await open(page, "stale");
    await frame(page).getByRole("button", { name: "Rejeter" }).focus();
    await page.keyboard.press("Enter");
    await expect(frame(page)).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({ hasText: "Proposition rejetée." }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Annuler" })).toBeFocused();
    await noViolations(page);
  });

  for (const width of [1280, 375]) {
    test(`carte de page proposée à ${width} px : le focus ne tombe jamais sur <body> (F20)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 720 });
      const card = page.getByRole("group", { name: "Page proposée par l'agent" });
      const inTree = () =>
        page.evaluate(
          () => !!document.activeElement?.closest("nav[aria-label='Pages du dossier']"),
        );

      await open(page, "pagePending");
      await card.getByRole("button", { name: "Ignorer" }).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("button", { name: "Annuler" })).toBeFocused();
      await noViolations(page);

      await open(page, "pagePending");
      await card.getByRole("button", { name: "Ajouter la page" }).focus();
      await page.keyboard.press("Enter");
      await expect(card).toHaveCount(0);
      await expect.poll(inTree).toBe(true);
      await noViolations(page);
    });
  }

  test("contenu hostile : texte littéral, aucun lien actif, Modifier n'en active aucun", async ({
    page,
  }) => {
    await open(page, "hostile");
    await expect(frame(page).getByRole("link")).toHaveCount(0);
    await expect(frame(page).locator("img, script")).toHaveCount(0);
    await frame(page).getByRole("button", { name: "Modifier" }).click();
    await expect(
      frame(page).getByRole("textbox", { name: "Texte de la proposition" }),
    ).toBeVisible();
    await expect(frame(page).getByRole("link")).toHaveCount(0);
  });

  test("page proposée : Ajouter la page crée la page", async ({ page }) => {
    await open(page, "pagePending");
    await page
      .getByRole("group", { name: "Page proposée par l'agent" })
      .getByRole("button", { name: "Ajouter la page" })
      .click();
    await expect(page.getByRole("status").filter({ hasText: "ajoutée" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Page proposée par l'agent" })).toHaveCount(0);
  });

  test("action sur la sélection : Développer envoie la consigne et fait apparaître une proposition", async ({
    page,
  }) => {
    await open(page, "thread");
    await page.getByText("Annuler une réservation").dblclick();
    await page.getByRole("button", { name: "Développer" }).click();
    await expect(frame(page)).toBeVisible();
    const call = (await ideaChatsSeen()).at(-1);
    expect(call).toMatchObject({ action: "develop" });
  });

  test("sans clé : l'éditeur reste utilisable, lien pour configurer", async ({ page }) => {
    await open(page, "notConfigured");
    await expect(page.getByRole("link", { name: "Configurer l'IA" })).toHaveAttribute(
      "href",
      "/settings/ai",
    );
    await expect(composer(page)).toHaveCount(0);
    await page.getByRole("textbox", { name: /Contenu de la page/ }).click();
    await page.keyboard.type(" Ajout.");
    await expect(page.getByText("Ajout.")).toBeVisible();
  });

  test("client : mêmes droits sur l'agent ; business : pas de panneau", async ({ page }) => {
    await open(page, "thread", "client");
    await expect(page.getByRole("complementary", { name: "Agent" })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, "thread", "business");
    await expect(page.getByRole("complementary", { name: "Agent" })).toHaveCount(0);
  });
});

/**
 * Inventaire du focus (F21, WCAG 2.4.3) : chaque action qui retire, masque, remplace ou rétablit un élément pouvant
 * porter le focus doit le laisser dans la page, jamais sur <body>. Tableau action -> cible dans 04-correction-1.md.
 */
interface FocusCase {
  name: string;
  idea: IdeaMode;
  act: (page: Page) => Promise<void>;
  /** Cible précise quand il y en a une (sinon : jamais <body>). */
  target?: (page: Page) => Locator;
}

const card = (page: Page) => page.getByRole("group", { name: "Page proposée par l'agent" });
const button = (page: Page, name: string | RegExp) => page.getByRole("button", { name });
const barFor = async (page: Page, text: string) => {
  await page.getByText(text).first().dblclick();
  await expect(page.getByRole("toolbar", { name: "Mise en forme" })).toBeVisible();
};

const FOCUS_CASES: FocusCase[] = [
  {
    name: "proposition : A",
    idea: "proposal",
    act: async (p) => {
      await frame(p).getByRole("button", { name: "Modifier" }).focus();
      await p.keyboard.press("a");
    },
    target: (p) => button(p, "Annuler"),
  },
  {
    name: "proposition : R",
    idea: "proposal",
    act: async (p) => {
      await frame(p).getByRole("button", { name: "Modifier" }).focus();
      await p.keyboard.press("r");
    },
    target: (p) => button(p, "Annuler"),
  },
  {
    name: "proposition : clic sur Accepter",
    idea: "proposal",
    act: (p) =>
      frame(p)
        .getByRole("button", { name: /Accepter/ })
        .click(),
    target: (p) => button(p, "Annuler"),
  },
  {
    name: "proposition : clic sur Rejeter",
    idea: "proposal",
    act: (p) =>
      frame(p)
        .getByRole("button", { name: /Rejeter/ })
        .click(),
    target: (p) => button(p, "Annuler"),
  },
  {
    name: "proposition : Modifier ouvre le champ",
    idea: "proposal",
    act: (p) => frame(p).getByRole("button", { name: "Modifier" }).click(),
    target: (p) => p.getByRole("textbox", { name: "Texte de la proposition" }),
  },
  {
    name: "proposition : Modifier puis Échap",
    idea: "proposal",
    act: async (p) => {
      await frame(p).getByRole("button", { name: "Modifier" }).click();
      await p.getByRole("textbox", { name: "Texte de la proposition" }).press("Escape");
    },
    target: (p) => frame(p).getByRole("button", { name: "Modifier" }),
  },
  {
    name: "proposition : Modifier puis Modifier (annuler la modification)",
    idea: "proposal",
    act: async (p) => {
      await frame(p).getByRole("button", { name: "Modifier" }).click();
      await frame(p).getByRole("button", { name: "Modifier" }).click();
    },
  },
  {
    name: "proposition : Modifier puis Accepter (enregistrer)",
    idea: "proposal",
    act: async (p) => {
      await frame(p).getByRole("button", { name: "Modifier" }).click();
      await frame(p)
        .getByRole("button", { name: /Accepter/ })
        .click();
    },
    target: (p) => button(p, "Annuler"),
  },
  {
    name: "proposition : Accepter puis Annuler de la trace",
    idea: "proposal",
    act: async (p) => {
      await frame(p)
        .getByRole("button", { name: /Accepter/ })
        .click();
      await button(p, "Annuler").click();
    },
    target: (p) => frame(p),
  },
  {
    name: "propositions : navigation suivante",
    idea: "proposals",
    act: (p) => button(p, "Proposition suivante").first().click(),
  },
  {
    name: "propositions : navigation précédente",
    idea: "proposals",
    act: async (p) => {
      await button(p, "Proposition suivante").first().click();
      await button(p, "Proposition précédente").nth(1).click();
    },
  },
  {
    name: "périmée : Redemander à l'agent",
    idea: "stale",
    act: (p) => button(p, "Redemander à l'agent").click(),
  },
  {
    name: "périmée : Rejeter",
    idea: "stale",
    act: (p) => frame(p).getByRole("button", { name: "Rejeter" }).click(),
    target: (p) => button(p, "Annuler"),
  },
  {
    name: "carte de page : Ajouter la page",
    idea: "pagePending",
    act: (p) => card(p).getByRole("button", { name: "Ajouter la page" }).click(),
  },
  {
    name: "carte de page : Ignorer",
    idea: "pagePending",
    act: (p) => card(p).getByRole("button", { name: "Ignorer" }).click(),
    target: (p) => button(p, "Annuler"),
  },
  {
    name: "carte de page : Ignorer puis Annuler",
    idea: "pagePending",
    act: async (p) => {
      await card(p).getByRole("button", { name: "Ignorer" }).click();
      await button(p, "Annuler").click();
    },
    target: (p) => card(p).getByRole("button", { name: "Ajouter la page" }),
  },
  {
    name: "cartes de page : « 2 autres »",
    idea: "pagesMany",
    act: (p) => button(p, /autres?$/).click(),
    target: (p) => card(p).nth(3).getByRole("button", { name: "Ajouter la page" }),
  },
  {
    name: "agent : Envoyer (flux en cours)",
    idea: "streaming",
    act: async (p) => {
      await composer(p).fill("Bonjour");
      await send(p).click();
    },
    target: (p) => composer(p),
  },
  {
    name: "agent : Envoyer (réponse terminée)",
    idea: "thread",
    act: async (p) => {
      await composer(p).fill("Bonjour");
      await send(p).click();
      await expect(p.getByText("Bonjour").first()).toBeVisible();
    },
    target: (p) => composer(p),
  },
  {
    name: "agent : Arrêter",
    idea: "streaming",
    act: async (p) => {
      await composer(p).fill("Bonjour");
      await send(p).click();
      await button(p, "Arrêter").click();
    },
    target: (p) => composer(p),
  },
  {
    name: "agent : bascule Libre",
    idea: "thread",
    act: (p) => button(p, "Libre").click(),
  },
  {
    name: "agent : Voir ce qui manque",
    idea: "thread",
    act: (p) => button(p, "Voir ce qui manque").click(),
    target: (p) => p.getByRole("region", { name: "Manques détectés" }).getByRole("button").first(),
  },
  {
    name: "agent : Explorer",
    idea: "thread",
    act: async (p) => {
      await button(p, "Voir ce qui manque").click();
      await p.getByRole("button", { name: "Explorer" }).first().click();
    },
  },
  {
    name: "agent : Proposer une page",
    idea: "thread",
    act: async (p) => {
      await button(p, "Voir ce qui manque").click();
      await p.getByRole("button", { name: "Proposer une page" }).first().click();
    },
  },
  {
    name: "agent : Détails de la mention",
    idea: "thread",
    act: (p) => button(p, "Détails").click(),
  },
  {
    name: "agent : Envoyer puis limite atteinte (alerte)",
    idea: "rateLimited",
    act: async (p) => {
      await composer(p).fill("Ma réponse");
      await send(p).click();
      await expect(p.getByText("Trop de demandes pour le moment.")).toBeVisible();
    },
    target: (p) => composer(p),
  },
  ...["Développer", "Challenger", "Simplifier", "Trouver les trous", "En faire une page"].map(
    (label): FocusCase => ({
      name: `barre : ${label}`,
      idea: "thread",
      act: async (p) => {
        await barFor(p, "Annuler une réservation");
        await button(p, label).click();
      },
    }),
  ),
  {
    name: "barre : Gras",
    idea: "thread",
    act: async (p) => {
      await barFor(p, "Annuler une réservation");
      await button(p, "Gras").click();
    },
  },
  {
    name: "barre : Lien puis Poser le lien",
    idea: "thread",
    act: async (p) => {
      await barFor(p, "Annuler une réservation");
      await button(p, "Lien").click();
      await p.getByRole("textbox", { name: "Adresse du lien" }).fill("https://exemple.fr");
      await button(p, "Poser le lien").click();
    },
  },
];

test.describe("Inventaire du focus (F21)", () => {
  for (const width of [1280, 375]) {
    for (const item of FOCUS_CASES) {
      test(`${item.name} (${width} px) : le focus reste dans la page`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 375 ? 812 : 720 });
        await open(page, item.idea);
        await item.act(page);
        await page.waitForTimeout(600);
        if (item.target) await expect(item.target(page).first()).toBeFocused();
        const tag = await page.evaluate(() => document.activeElement?.tagName ?? "NONE");
        expect(["BODY", "HTML", "NONE"]).not.toContain(tag);
        await noViolations(page);
      });
    }
  }
});

test.describe("Trace qui s'efface (F21)", () => {
  for (const width of [1280, 375]) {
    test(`fin des 10 s avec le focus sur Annuler (${width} px) : le focus passe à l'éditeur`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 720 });
      await page.clock.install();
      await open(page, "proposal");
      await frame(page)
        .getByRole("button", { name: /Accepter/ })
        .click();
      await expect(button(page, "Annuler")).toBeFocused();
      await page.clock.runFor(11_000);
      await expect(button(page, "Annuler")).toHaveCount(0);
      await expect(page.getByRole("textbox", { name: /Contenu de la page/ })).toBeFocused();
      await noViolations(page);
    });
  }
});
