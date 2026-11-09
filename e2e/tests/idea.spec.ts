import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import {
  apiAs,
  createProjectWithSpecRepo,
  createR2Workspace,
  linkClientToProject,
  ORPC,
  type R2Member,
  type R2Workspace,
  SESSION_COOKIE,
} from "../support/r2-workspace.ts";

/**
 * TK-89 · lot C : l'espace Idée de bout en bout contre la vraie pile (API, worker avec le faux fournisseur Git, web,
 * Postgres). Équipe : ouvrir, écrire, réordonner au clavier, ajouter, renommer, supprimer, restaurer, publier. Client : mêmes
 * droits sans publication. Business : lecture seule. Axe sur chaque état ; captures de S-idea (clair, sombre, 375 px).
 */
const CAPTURES = resolve(import.meta.dirname, "../../design/screens/captures/S-idea");
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const OPEN_PAGE = "Périmètre";

let baseURL: string;
test.beforeEach(({ baseURL: url }) => {
  baseURL = url as string;
});

interface Space {
  workspace: R2Workspace;
  owner: APIRequestContext;
  projectId: string;
}

async function space(): Promise<Space> {
  const workspace = await createR2Workspace();
  const owner = await apiAs(baseURL, workspace.owner);
  const { projectId } = await createProjectWithSpecRepo(owner, workspace, "Portail de réservation");
  return { workspace, owner, projectId };
}

async function signIn(page: Page, member: R2Member, theme: "light" | "dark" = "light") {
  await page.context().addCookies([{ name: SESSION_COOKIE, value: member.cookie, url: baseURL }]);
  await page.addInitScript((value) => localStorage.setItem("koklo-theme", value), theme);
}

const ideaUrl = (projectId: string, slug = "perimetre") =>
  `/projects/${projectId}/idea?page=${slug}`;
const editorOf = (page: Page) =>
  page.getByRole("textbox", { name: `Contenu de la page ${OPEN_PAGE}` });
const saved = (page: Page) =>
  page.waitForResponse(
    (r) => r.request().method() === "PUT" && /\/idea\/pages\/[^/]+\/content$/.test(r.url()),
  );

async function open(page: Page, projectId: string, slug = "perimetre") {
  await page.goto(ideaUrl(projectId, slug));
  await expect(page.getByRole("heading", { level: 1, name: "Dossier d'idée" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Titre de la page" })).toBeVisible();
}

async function violations(page: Page) {
  return (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations;
}

async function capture(page: Page, name: string): Promise<void> {
  mkdirSync(CAPTURES, { recursive: true });
  // Expression en chaîne : ce paquet n'a pas la bibliothèque DOM.
  await page.evaluate(
    "Promise.all(document.getAnimations().filter((a) => a.effect.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined)))",
  );
  await page.screenshot({ path: `${CAPTURES}/${name}.png`, fullPage: true });
}

async function write(page: Page, text: string): Promise<void> {
  const answered = saved(page);
  await editorOf(page).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(text);
  await answered;
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de parcours, un test par comportement
test.describe("équipe", () => {
  test("ouvrir, écrire, enregistrer automatiquement, relire", async ({ page }) => {
    const { workspace, projectId } = await space();
    await signIn(page, workspace.owner);
    await open(page, projectId);
    // Rail replié par défaut sur l'espace Idée.
    await expect(page.locator('[data-slot="app-shell-sidebar"]')).toHaveAttribute(
      "data-state",
      "collapsed",
    );
    await expect(
      page.getByRole("navigation", { name: "Pages du dossier" }).getByRole("link"),
    ).toHaveCount(11); // la Synthèse puis les dix pages du dossier
    await expect(page.getByText("idea/perimetre.md")).toBeVisible();
    await write(page, "Réserver un créneau sans compte.");
    await expect(page.getByText("Brouillon enregistré")).toBeVisible();
    await page.reload();
    await expect(editorOf(page)).toContainText("Réserver un créneau sans compte.");
    // Présence : la personne connectée figure dans la pile d'avatars.
    await expect(page.getByRole("list", { name: "Présents dans le dossier" })).toBeVisible();
  });

  test("sans clé d'IA : le panneau l'explique, l'éditeur et les pages restent utilisables (TK-90)", async ({
    page,
  }) => {
    const { workspace, projectId } = await space();
    await signIn(page, workspace.owner);
    await open(page, projectId);
    const agent = page.getByRole("complementary", { name: "Agent" });
    await expect(agent.getByText(/aucune clé d'IA/)).toBeVisible();
    await expect(agent.getByRole("link", { name: "Configurer l'IA" })).toHaveAttribute(
      "href",
      "/settings/ai",
    );
    await expect(agent.getByText("Qu'est-ce qui peut attendre ?")).toBeVisible();
    await expect(agent.getByRole("textbox", { name: "Message à l'agent" })).toHaveCount(0);
    await write(page, "Texte écrit sans l'agent.");
    await expect(page.getByText("Brouillon enregistré")).toBeVisible();
    await page.getByRole("button", { name: "Ajouter une page" }).click();
    await expect(page.getByRole("textbox", { name: "Titre de la page" })).toHaveValue(
      "Page sans titre",
    );
    expect(await violations(page)).toEqual([]);
  });

  test("réordonner au clavier (Alt + flèche) et retrouver l'ordre", async ({ page }) => {
    const { workspace, projectId } = await space();
    await signIn(page, workspace.owner);
    await open(page, projectId);
    const handle = page.getByRole("button", { name: "Déplacer 05 · Périmètre" });
    await handle.focus();
    await page.keyboard.press("Alt+ArrowUp");
    await expect(page.getByText("Périmètre déplacée en position 5 sur 10")).toBeAttached();
    await page.reload();
    await expect(page.getByRole("link", { name: /04 · Périmètre/ })).toBeVisible();
  });

  test("ajouter, renommer, supprimer puis restaurer une page", async ({ page }) => {
    const { workspace, projectId } = await space();
    await signIn(page, workspace.owner);
    await open(page, projectId);
    await page.getByRole("button", { name: "Ajouter une page" }).click();
    const title = page.getByRole("textbox", { name: "Titre de la page" });
    await expect(title).toHaveValue("Page sans titre");
    await title.fill("Concurrence");
    await title.press("Enter");
    await expect(page.getByRole("link", { name: /10 · Concurrence/ })).toBeVisible();
    await page.getByRole("button", { name: "Actions de la page 10 · Concurrence" }).click();
    await page.getByRole("menuitem", { name: "Supprimer" }).click();
    await expect(page.getByRole("button", { name: "Garder" })).toBeFocused();
    await page.getByRole("button", { name: "Supprimer" }).click();
    await expect(page.getByRole("link", { name: /Concurrence/ })).toHaveCount(0);
    await page.getByRole("button", { name: /^Corbeille \(1\)/ }).click();
    await page.getByRole("button", { name: "Restaurer la page Concurrence" }).click();
    await expect(page.getByRole("link", { name: /Concurrence/ })).toBeVisible();
  });

  test("une page requise ne se supprime pas", async ({ page }) => {
    const { workspace, projectId } = await space();
    await signIn(page, workspace.owner);
    await open(page, projectId);
    await page.getByRole("button", { name: "Actions de la page 05 · Périmètre" }).click();
    await expect(page.getByRole("menuitem", { name: "Supprimer" })).toHaveCount(0);
  });

  test("enregistrer une version publie dans le dépôt", async ({ page }) => {
    const { workspace, projectId } = await space();
    await signIn(page, workspace.owner);
    await open(page, projectId);
    await write(page, "Première version.");
    await page.getByRole("button", { name: "Enregistrer une version" }).click();
    await expect(page.getByText(/^Version publiée · [0-9a-f]{7}$/)).toBeVisible({
      timeout: 45_000,
    });
  });

  test("l'autre onglet modifie la page : conflit, saisie gardée, deux versions", async ({
    page,
  }) => {
    const { workspace, owner, projectId } = await space();
    await signIn(page, workspace.owner);
    await open(page, projectId);
    await write(page, "Ma première ligne.");
    const pages = (await (await owner.get(`${ORPC}/projects/${projectId}/idea/pages`)).json()) as {
      pages: Array<{ id: string; slug: string; version: number }>;
    };
    const target = pages.pages.find((p) => p.slug === "perimetre");
    if (!target) throw new Error("page périmètre introuvable");
    const other = await owner.put(`${ORPC}/projects/${projectId}/idea/pages/${target.id}/content`, {
      data: { baseVersion: target.version, contentMd: "Texte de l'autre onglet." },
    });
    expect(other.ok(), await other.text()).toBe(true);
    await editorOf(page).click();
    await page.keyboard.press("Control+End");
    const answered = saved(page);
    await page.keyboard.type(" Suite.");
    await answered;
    await expect(page.getByText(/a modifié cette page pendant que vous écriviez/)).toBeVisible();
    await expect(editorOf(page)).toContainText("Ma première ligne. Suite.");
    await page.getByRole("button", { name: "Voir les deux versions" }).click();
    await expect(page.getByRole("button", { name: "Garder la mienne" })).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await capture(page, "conflit-clair");
    await page.getByRole("button", { name: "Garder la mienne" }).click();
    await expect(page.getByText("Brouillon enregistré")).toBeVisible();
  });
});

test.describe("client", () => {
  test("rédige comme l'équipe, sans « Enregistrer une version »", async ({ page }) => {
    const { workspace, owner, projectId } = await space();
    await linkClientToProject(owner, projectId, workspace.client);
    await signIn(page, workspace.client, "dark");
    await open(page, projectId);
    await expect(page.getByRole("button", { name: "Enregistrer une version" })).toHaveCount(0);
    await write(page, "Je veux réserver depuis mon téléphone.");
    await page.reload();
    await expect(editorOf(page)).toContainText("Je veux réserver depuis mon téléphone.");
    await page.getByRole("button", { name: "Ajouter une page" }).click();
    await expect(page.getByRole("textbox", { name: "Titre de la page" })).toHaveValue(
      "Page sans titre",
    );
    await open(page, projectId);
    expect(await violations(page)).toEqual([]);
    await capture(page, "client-sombre");
  });

  test("sans clé d'IA, le client est renvoyé à un administrateur (TK-90)", async ({ page }) => {
    const { workspace, owner, projectId } = await space();
    await linkClientToProject(owner, projectId, workspace.client);
    await signIn(page, workspace.client);
    await open(page, projectId);
    const agent = page.getByRole("complementary", { name: "Agent" });
    await expect(
      agent.getByText("Demandez à un administrateur de l'organisation d'ajouter la clé."),
    ).toBeVisible();
    await expect(agent.getByRole("link", { name: "Configurer l'IA" })).toHaveCount(0);
  });

  test("un client non lié au projet n'y accède pas", async ({ page }) => {
    const { workspace, projectId } = await space();
    await signIn(page, workspace.client);
    await page.goto(ideaUrl(projectId));
    await expect(page.getByRole("heading", { name: "Projet introuvable" })).toBeVisible();
  });
});

test.describe("business", () => {
  test("lit sans pouvoir écrire", async ({ page }) => {
    const { workspace, projectId } = await space();
    await signIn(page, workspace.business);
    let presence = 0;
    page.on("request", (r) => {
      if (/\/idea\/presence$/.test(r.url())) presence += 1;
    });
    await page.goto(ideaUrl(projectId));
    await expect(page.getByRole("heading", { level: 1, name: "Dossier d'idée" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Titre de la page" })).toBeVisible();
    expect(presence).toBe(0);
    await expect(page.getByRole("button", { name: "Ajouter une page" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Déplacer / })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Enregistrer une version" })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Titre de la page" })).toHaveAttribute(
      "readonly",
      "",
    );
  });
});

test.describe("tâches et ouverture sans écriture", () => {
  const CONTENT =
    "### Première version\n\nTexte.\n\n- [x] Réserver un créneau\n- [ ] Agenda synchronisé\n";

  async function seeded() {
    const { workspace, owner, projectId } = await space();
    const list = (await (await owner.get(`${ORPC}/projects/${projectId}/idea/pages`)).json()) as {
      pages: Array<{ id: string; slug: string; version: number }>;
    };
    const target = list.pages.find((p) => p.slug === "perimetre");
    if (!target) throw new Error("page périmètre introuvable");
    const put = await owner.put(`${ORPC}/projects/${projectId}/idea/pages/${target.id}/content`, {
      data: { baseVersion: target.version, contentMd: CONTENT },
    });
    expect(put.ok(), await put.text()).toBe(true);
    return { workspace, projectId };
  }

  for (const [label, theme, width] of [
    ["clair", "light", 1280],
    ["sombre", "dark", 1280],
    ["375 px", "light", 375],
  ] as const) {
    test(`ouvrir une page à tâches (${label}) : aucune écriture, cases nommées, axe sans violation`, async ({
      page,
    }) => {
      const { workspace, projectId } = await seeded();
      await page.setViewportSize({ width, height: 900 });
      await signIn(page, workspace.owner, theme);
      let writes = 0;
      page.on("request", (r) => {
        if (r.method() === "PUT" && /\/idea\/pages\/[^/]+\/content$/.test(r.url())) writes += 1;
      });
      await open(page, projectId);
      const done = page.getByRole("checkbox", { name: "Réserver un créneau" });
      await expect(done).toHaveAttribute("aria-checked", "true");
      expect((await done.boundingBox())?.width).toBeGreaterThanOrEqual(24);
      await page.waitForTimeout(3000);
      expect(writes).toBe(0);
      expect(await violations(page)).toEqual([]);
    });
  }
});

test.describe("axe et captures", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`Périmètre en brouillon (${theme}) : axe sans violation, capture`, async ({ page }) => {
      const { workspace, projectId } = await space();
      await signIn(page, workspace.owner, theme);
      await open(page, projectId);
      await write(page, "ceux qui réservent, ceux qui accueillent.");
      await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^((?!dark).)*$/);
      expect(await violations(page)).toEqual([]);
      await capture(page, `perimetre-${theme === "dark" ? "sombre" : "clair"}`);
    });
  }

  test("dossier vide (clair) : état vide, axe, capture", async ({ page }) => {
    const { workspace, projectId } = await space();
    await signIn(page, workspace.owner);
    await page.goto(`/projects/${projectId}/idea`);
    await expect(page.getByText("Aucune idée encore")).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await capture(page, "vide-clair");
    await page.getByRole("button", { name: "Commencer le dossier" }).click();
    await expect(page.getByRole("textbox", { name: "Titre de la page" })).toHaveValue("Vision");
  });

  test("375 px : menu de pages, pas de défilement horizontal, cibles de 44 px", async ({
    page,
  }) => {
    const { workspace, projectId } = await space();
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page, workspace.owner);
    await open(page, projectId);
    const overflow = await page
      .locator("html")
      .evaluate((root) => root.scrollWidth - root.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const trigger = page.getByRole("button", { name: "05 · Périmètre", exact: true });
    expect((await trigger.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(await violations(page)).toEqual([]);
    await trigger.click();
    await expect(page.getByRole("menuitem", { name: "Ajouter une page" })).toBeVisible();
    // Menu ouvert : Radix masque le reste de la page, axe n'y voit plus qu'un contenu focalisable masqué (attendu).
    await capture(page, "menu-pages-375");
  });
});

const MODES = [
  ["clair", "light", 1280],
  ["sombre", "dark", 1280],
  ["375", "light", 375],
] as const;

async function putContent(owner: APIRequestContext, projectId: string, contentMd: string) {
  const list = (await (await owner.get(`${ORPC}/projects/${projectId}/idea/pages`)).json()) as {
    pages: Array<{ id: string; slug: string; version: number }>;
  };
  const target = list.pages.find((p) => p.slug === "perimetre");
  if (!target) throw new Error("page périmètre introuvable");
  const put = await owner.put(`${ORPC}/projects/${projectId}/idea/pages/${target.id}/content`, {
    data: { baseVersion: target.version, contentMd },
  });
  expect(put.ok(), await put.text()).toBe(true);
}

type Theme = "light" | "dark";
const STATES: Record<string, (page: Page, s: Space, theme: Theme) => Promise<void>> = {
  brouillon: async (page, { workspace, projectId }, theme) => {
    await signIn(page, workspace.owner, theme);
    await open(page, projectId);
    await write(page, "ceux qui réservent, ceux qui accueillent.");
  },
  taches: async (page, { workspace, owner, projectId }, theme) => {
    await putContent(
      owner,
      projectId,
      "### Première version\n\nTexte.\n\n- [x] Réserver un créneau\n- [ ] Agenda synchronisé\n",
    );
    await signIn(page, workspace.owner, theme);
    await open(page, projectId);
  },
  vide: async (page, { workspace, projectId }, theme) => {
    await signIn(page, workspace.owner, theme);
    await page.goto(`/projects/${projectId}/idea`);
    await expect(page.getByText("Aucune idée encore")).toBeVisible();
  },
  conflit: async (page, { workspace, owner, projectId }, theme) => {
    await signIn(page, workspace.owner, theme);
    await open(page, projectId);
    await write(page, "Ma première ligne.");
    await putContent(owner, projectId, "Texte de l'autre onglet.");
    await editorOf(page).click();
    await page.keyboard.press("Control+End");
    const answered = saved(page);
    await page.keyboard.type(" Suite.");
    await answered;
    await page.getByRole("button", { name: "Voir les deux versions" }).click();
    await expect(page.getByRole("button", { name: "Garder la mienne" })).toBeVisible();
  },
  client: async (page, { workspace, owner, projectId }, theme) => {
    await linkClientToProject(owner, projectId, workspace.client);
    await signIn(page, workspace.client, theme);
    await open(page, projectId);
  },
  lecture: async (page, { workspace, projectId }, theme) => {
    await signIn(page, workspace.business, theme);
    await open(page, projectId);
  },
};

/** Capture de chaque état de S-idea en clair, en sombre et à 375 px (critère du ticket), axe sans violation à chaque fois. */
test.describe("captures de chaque état", () => {
  for (const [state, run] of Object.entries(STATES)) {
    for (const [label, mode, width] of MODES) {
      test(`${state} (${label}) : axe sans violation, capture`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await run(page, await space(), mode);
        expect(await violations(page)).toEqual([]);
        await capture(page, `etat-${state}-${label}`);
      });
    }
  }
});

/** TK-91 lot B : maturité, passage au cadrage et Synthèse contre la vraie pile (faux fournisseur Git, sans clé d'IA). */
interface ListedIdea {
  pages: Array<{ id: string; required: boolean }>;
  maturity: { stable: number; total: number; missingRequired: string[] };
  version: { latest: { tag: string; commitSha: string } | null; modifiedSince: boolean };
}

async function listIdea(owner: APIRequestContext, projectId: string): Promise<ListedIdea> {
  return (await (await owner.get(`${ORPC}/projects/${projectId}/idea/pages`)).json()) as ListedIdea;
}

async function makeRequiredStable(owner: APIRequestContext, projectId: string): Promise<void> {
  const required = (await listIdea(owner, projectId)).pages.filter((p) => p.required);
  for (const page of required) {
    // Une page vide ne peut être qu'en brouillon : on lui donne un texte avant de la dire stable.
    const detail = (await (
      await owner.get(`${ORPC}/projects/${projectId}/idea/pages/${page.id}`)
    ).json()) as { version: number };
    const written = await owner.put(`${ORPC}/projects/${projectId}/idea/pages/${page.id}/content`, {
      data: { baseVersion: detail.version, contentMd: "Contenu de la page.\n" },
    });
    expect(written.ok(), await written.text()).toBe(true);
    const done = await owner.post(`${ORPC}/projects/${projectId}/idea/pages/${page.id}/status`, {
      data: { status: "stable" },
    });
    expect(done.ok(), await done.text()).toBe(true);
  }
}

test.describe("passage au cadrage (TK-91)", () => {
  test("équipe : seuil, passage, tag idea-v1, Spec · Fonctionnel, Synthèse non générée sans clé d'IA", async ({
    page,
  }) => {
    const { workspace, owner, projectId } = await space();
    await signIn(page, workspace.owner);
    await open(page, projectId);
    await expect(page.getByRole("button", { name: "Passer au cadrage" })).toBeDisabled();
    await expect(page.getByText(/Pour passer au cadrage, il manque : /)).toBeVisible();
    await makeRequiredStable(owner, projectId);
    await page.reload();
    const freeze = page.getByRole("button", { name: "Passer au cadrage" });
    await expect(freeze).toBeEnabled();
    expect(await violations(page)).toEqual([]);
    await freeze.click();
    const confirm = page.getByRole("button", { name: "Passer quand même" });
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await page.waitForURL(`**/projects/${projectId}/spec/functional**`, { timeout: 60_000 });
    const listed = await listIdea(owner, projectId);
    expect(listed.version.latest?.tag).toBe("idea-v1");
    expect(listed.version.latest?.commitSha).toMatch(/^[0-9a-f]{7,40}$/);
    expect(listed.version.modifiedSince).toBe(false);
    await page.goto(ideaUrl(projectId, "synthese"));
    await expect(page.getByText(/n'a pas été générée avec idea-v1/)).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await capture(page, "cadrage-synthese-reelle");
  });

  test("client : jauge seule, ni bouton ni Régénérer, et le serveur refuse le passage", async ({
    page,
  }) => {
    const { workspace, owner, projectId } = await space();
    await linkClientToProject(owner, projectId, workspace.client);
    await makeRequiredStable(owner, projectId);
    await signIn(page, workspace.client);
    await open(page, projectId);
    await expect(page.getByRole("meter", { name: "Maturité du dossier" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Passer au cadrage" })).toHaveCount(0);
    const client = await apiAs(baseURL, workspace.client);
    const refused = await client.post(`${ORPC}/projects/${projectId}/idea/freeze`, {
      data: { idempotencyKey: "idea-freeze-client-forge" },
    });
    expect(refused.status()).toBe(403);
    const regenerate = await client.post(`${ORPC}/projects/${projectId}/ai/idea/synthesis`, {});
    expect(regenerate.status()).toBe(403);
  });
});
