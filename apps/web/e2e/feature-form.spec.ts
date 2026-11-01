import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  CAPTURES_DIR,
  type KanbanRole,
  releaseHeld,
  setScenario,
  settle,
  specWritesSeen,
  type Theme,
} from "./support/helpers.ts";
import { BASE_SHA, type WriteMode } from "./support/stub-feature-write.ts";
import { FEATURE_PROJECT_ID } from "./support/stub-features.ts";

/**
 * TK-48 / 48e, formulaire de fonctionnalité : création et modification (48e-1), suppression (48e-2)
 * (design/screens/S-feature-form.md §4.8, §11, §12). Pile locale : faux API (support/stub-feature-write.ts),
 * navigateur réel ; jamais github.com ni Postgres. La suppression ajoute l'état `delete-confirm` (clair, sombre,
 * 375 px) et les parcours du bloc « Suppression (48e-2) » en fin de fichier. Captures dans design/screens/captures/S-feature-form/<état>-<thème>.png (+ -mobile à 375 px) ; le Red n'en
 * écrit aucune, le Green/Refactor les génère.
 */
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa"];
const PATH = `/projects/${FEATURE_PROJECT_ID}/features`;
const TITLE = "Notifications par e-mail";
const KEY_PATTERN = /^feature-[A-Za-z0-9-]+$/;
const dialogOf = (page: Page) => page.getByRole("dialog");

async function scenario(
  options: { write?: WriteMode; role?: KanbanRole; feature?: "loading" } = {},
) {
  await setScenario({
    session: true,
    projects: "data",
    ...(options.write ? { write: options.write } : {}),
    ...(options.role ? { role: options.role } : {}),
    ...(options.feature ? { feature: options.feature } : {}),
  });
}

async function chooseOption(page: Page, label: string, option: string): Promise<void> {
  await dialogOf(page).getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
async function fillCreate(page: Page, title = TITLE): Promise<void> {
  const dialog = dialogOf(page);
  await dialog.getByRole("textbox", { name: "Titre (obligatoire)" }).fill(title);
  await chooseOption(page, "Priorité (obligatoire)", "Importante");
}
async function fillRich(page: Page): Promise<void> {
  await fillCreate(page);
  const dialog = dialogOf(page);
  await dialog
    .getByRole("textbox", { name: "Description" })
    .fill("Un e-mail est envoyé à chaque changement.\n\nLe contenu reste en texte brut.");
  await dialog.getByRole("button", { name: "Ajouter un critère" }).click();
  await dialog.getByRole("textbox", { name: "Titre du critère" }).fill("E-mail reçu");
  await dialog.getByRole("button", { name: "Ajouter une étape" }).click();
  await dialog.getByRole("textbox", { name: "Texte de l'étape" }).fill("un abonnement actif");
}
async function linkScreen(page: Page, id = "S-login"): Promise<void> {
  const dialog = dialogOf(page);
  const trigger = dialog.getByRole("button", { name: /Éléments liés/ });
  if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
  await dialog.getByRole("textbox", { name: "Écrans" }).fill(id);
}
const DELETE = "Supprimer cette fonctionnalité";
const askDelete = (page: Page) => dialogOf(page).getByRole("button", { name: DELETE }).click();
const confirmGroup = (page: Page) =>
  dialogOf(page).getByRole("group", { name: "Confirmer la suppression" });
const confirmDeletion = (page: Page) =>
  confirmGroup(page).getByRole("button", { name: "Supprimer", exact: true }).click();
const titleBox = (page: Page) =>
  dialogOf(page).getByRole("textbox", { name: "Titre (obligatoire)" });
/** Ouvre la modification de F-001 et attend le préremplissage. */
async function openF001(page: Page): Promise<void> {
  await page.goto(`${PATH}?edit=F-001`);
  await expect(titleBox(page)).toHaveValue("Connexion par e-mail");
}
const submitsSeen = async () => (await specWritesSeen()).filter((entry) => entry.kind === "submit");
const save = (page: Page) => dialogOf(page).getByRole("button", { name: "Enregistrer" }).click();
const region = (page: Page) => page.locator('[role="status"], output');

async function capture(page: Page, name: string, theme: Theme, suffix = ""): Promise<void> {
  await settle(page);
  await page.screenshot({
    path: `${CAPTURES_DIR}/S-feature-form/${name}-${theme}${suffix}.png`,
    fullPage: true,
  });
}
async function noAxeViolation(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations, JSON.stringify(results.violations.map((v) => v.id))).toEqual([]);
}
const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

interface State {
  name: string;
  write?: WriteMode;
  role?: KanbanRole;
  feature?: "loading";
  path?: string;
  /** Horloge simulée (les états qui supposent 30 ou 60 s d'attente). */
  clock?: boolean;
  /** Action après le chargement et la bascule de thème. */
  act?: (page: Page) => Promise<void>;
  visible: (page: Page) => Promise<void> | Locator | unknown;
}
const see = (locator: (page: Page) => Locator) => async (page: Page) =>
  expect(locator(page)).toBeVisible();

const STATES: State[] = [
  {
    name: "create-empty",
    path: `${PATH}?new=1`,
    visible: see((p) => dialogOf(p).getByRole("heading", { name: "Nouvelle fonctionnalité" })),
  },
  {
    name: "create-filled",
    path: `${PATH}?new=1`,
    act: async (page) => {
      await dialogOf(page).waitFor();
      await fillRich(page);
    },
    visible: see((p) => dialogOf(p).getByRole("group", { name: /^Critère 1/ })),
  },
  {
    name: "create-invalid",
    path: `${PATH}?new=1`,
    act: async (page) => {
      await dialogOf(page).waitFor();
      await save(page);
    },
    visible: see((p) => dialogOf(p).getByText("Corrigez 2 points avant d'enregistrer")),
  },
  {
    name: "edit-prefilled",
    path: `${PATH}?edit=F-001`,
    visible: async (page) =>
      expect(dialogOf(page).getByRole("textbox", { name: "Titre (obligatoire)" })).toHaveValue(
        "Connexion par e-mail",
      ),
  },
  {
    name: "edit-loading",
    path: `${PATH}?edit=F-001`,
    feature: "loading",
    visible: see((p) => dialogOf(p).getByText("Chargement de la fonctionnalité…")),
  },
  {
    name: "sending",
    path: `${PATH}?new=1`,
    write: "hold",
    act: async (page) => {
      await dialogOf(page).waitFor();
      await fillCreate(page);
      await save(page);
    },
    visible: see((p) => dialogOf(p).getByRole("button", { name: "Enregistrement…" })),
  },
  {
    name: "queued",
    path: `${PATH}?new=1`,
    write: "queuedForever",
    act: async (page) => {
      await dialogOf(page).waitFor();
      await fillCreate(page);
      await save(page);
    },
    visible: see((p) => dialogOf(p).getByRole("list", { name: "Avancement de l'enregistrement" })),
  },
  {
    name: "slow",
    path: `${PATH}?new=1`,
    write: "queuedForever",
    clock: true,
    act: async (page) => {
      await dialogOf(page).waitFor();
      await fillCreate(page);
      await save(page);
      await expect(dialogOf(page).getByText("En attente de son tour").first()).toBeVisible();
      await page.clock.fastForward(61_000);
    },
    visible: see((p) => dialogOf(p).getByText(/L'enregistrement prend plus de temps que prévu/)),
  },
  {
    name: "saved-index-pending",
    path: `${PATH}?new=1`,
    write: "indexLate",
    clock: true,
    act: async (page) => {
      await dialogOf(page).waitFor();
      await fillCreate(page);
      await save(page);
      await expect(dialogOf(page).getByText("La liste se met à jour…")).toBeVisible();
      await page.clock.fastForward(31_000);
    },
    visible: see((p) =>
      dialogOf(p)
        .getByText(/Pas encore à jour/)
        .first(),
    ),
  },
  {
    name: "error-spec-invalid",
    path: `${PATH}?new=1`,
    write: "invalid",
    act: async (page) => {
      await dialogOf(page).waitFor();
      await fillCreate(page);
      await save(page);
    },
    visible: see((p) => dialogOf(p).getByText("La spec obtenue ne serait pas valide")),
  },
  {
    name: "error-conflict",
    path: `${PATH}?edit=F-001`,
    write: "conflictOnce",
    act: async (page) => {
      const dialog = dialogOf(page);
      await expect(dialog.getByRole("textbox", { name: "Titre (obligatoire)" })).toHaveValue(
        "Connexion par e-mail",
      );
      await dialog.getByRole("textbox", { name: "Titre (obligatoire)" }).fill("Mon titre");
      await save(page);
    },
    visible: see((p) =>
      dialogOf(p).getByText("La spec a changé depuis que vous avez ouvert ce formulaire"),
    ),
  },
  {
    name: "error-provider",
    path: `${PATH}?new=1`,
    write: "provider",
    act: async (page) => {
      await dialogOf(page).waitFor();
      await fillCreate(page);
      await save(page);
    },
    visible: see((p) => dialogOf(p).getByText("GitHub est momentanément indisponible")),
  },
  {
    name: "error-forbidden-designer",
    path: `${PATH}?new=1`,
    write: "forbidden",
    role: "designer",
    act: async (page) => {
      await dialogOf(page).waitFor();
      await fillCreate(page);
      await linkScreen(page);
      await save(page);
    },
    visible: see((p) =>
      dialogOf(p).getByText("Vous ne pouvez enregistrer que les fonctionnalités liées à un écran"),
    ),
  },
  {
    name: "draft-resumed",
    path: `${PATH}?new=1`,
    act: async (page) => {
      await dialogOf(page).waitFor();
      await fillCreate(page);
      await page.waitForTimeout(800);
      await page.reload();
    },
    visible: see((p) => dialogOf(p).getByText(/^Brouillon repris, enregistré le/)),
  },
  {
    name: "delete-confirm",
    path: `${PATH}?edit=F-001`,
    act: async (page) => {
      await expect(
        dialogOf(page).getByRole("textbox", { name: "Titre (obligatoire)" }),
      ).toHaveValue("Connexion par e-mail");
      await askDelete(page);
    },
    visible: see((p) => dialogOf(p).getByRole("group", { name: "Confirmer la suppression" })),
  },
  {
    name: "list-after-save",
    path: `${PATH}?new=1`,
    write: "ok",
    act: async (page) => {
      await dialogOf(page).waitFor();
      await fillCreate(page);
      await save(page);
      await expect(dialogOf(page)).toBeHidden({ timeout: 20_000 });
    },
    visible: see((p) => region(p).filter({ hasText: `F-004 « ${TITLE} » créée.` })),
  },
];

async function arrive(page: Page, state: State, theme: Theme): Promise<void> {
  await scenario({
    ...(state.write ? { write: state.write } : {}),
    ...(state.role ? { role: state.role } : {}),
    ...(state.feature ? { feature: state.feature } : {}),
  });
  // Stockage vidé une seule fois par test (pas à chaque rechargement : « draft-resumed » recharge la page avec son
  // brouillon) ; le thème sombre est posé avant le rendu, car sous un panneau modal (`?new=1`, `?edit=`) le menu
  // utilisateur est masqué et inatteignable.
  await page.addInitScript((dark) => {
    if (sessionStorage.getItem("e2e-storage-cleared")) return;
    sessionStorage.setItem("e2e-storage-cleared", "1");
    localStorage.clear();
    if (dark) localStorage.setItem("koklo-theme", "dark");
  }, theme === "dark");
  if (state.clock) await page.clock.install();
  await page.goto(state.path ?? PATH);
  if (state.act) await state.act(page);
  await state.visible(page);
}

for (const theme of ["light", "dark"] as Theme[]) {
  for (const state of STATES) {
    test(`S-feature-form ${state.name} (${theme}) : état visible, axe sans violation, capture`, async ({
      page,
    }) => {
      test.setTimeout(60_000);
      await arrive(page, state, theme);
      await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^((?!dark).)*$/);
      await capture(page, state.name, theme);
      await noAxeViolation(page);
      await releaseHeld();
    });
  }
}

test("S-feature-form : création, la fonctionnalité est dans la liste relue, annonce et focus (AC-48-24)", async ({
  page,
}) => {
  await scenario({ write: "ok" });
  await page.goto(`${PATH}?new=1`);
  await fillRich(page);
  await save(page);
  await expect(region(page).filter({ hasText: `F-004 « ${TITLE} » créée.` })).toBeVisible({
    timeout: 20_000,
  });
  await expect(dialogOf(page)).toBeHidden();
  await expect(page).not.toHaveURL(/new=/);
  await expect(page.getByRole("link", { name: TITLE })).toBeFocused();
  await expect(page.getByRole("row")).toHaveCount(5);
  const submits = (await specWritesSeen()).filter((entry) => entry.kind === "submit");
  expect(submits).toHaveLength(1);
  const [body] = submits;
  expect(body?.idempotencyKey).toMatch(KEY_PATTERN);
  expect(body).not.toHaveProperty("baseSha");
  expect(body).not.toHaveProperty("message");
  expect(body?.operations).toHaveLength(1);
  expect(body?.operations?.[0]).toMatchObject({
    kind: "feature.create",
    title: TITLE,
    priority: "should",
    description: "Un e-mail est envoyé à chaque changement.\n\nLe contenu reste en texte brut.",
    criteria: [
      { title: "E-mail reçu", steps: [{ type: "etant_donne", text: "un abonnement actif" }] },
    ],
  });
});

test("S-feature-form : modification, patch minimal avec baseSha, liste à jour", async ({
  page,
}) => {
  await scenario({ write: "ok" });
  await page.goto(`${PATH}?edit=F-001`);
  const title = dialogOf(page).getByRole("textbox", { name: "Titre (obligatoire)" });
  await expect(title).toHaveValue("Connexion par e-mail");
  await expect(dialogOf(page).getByRole("button", { name: "Enregistrer" })).toBeDisabled();
  await title.fill("Connexion sans mot de passe");
  await save(page);
  await expect(
    region(page).filter({ hasText: "F-001 « Connexion sans mot de passe » enregistrée." }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("link", { name: "Connexion sans mot de passe" })).toBeFocused();
  const [body] = (await specWritesSeen()).filter((entry) => entry.kind === "submit");
  expect(body?.baseSha).toBe(BASE_SHA);
  expect(body?.operations).toEqual([
    { kind: "feature.update", specId: "F-001", title: "Connexion sans mot de passe" },
  ]);
});

test("S-feature-form : fiche puis « Modifier », Retour revient à la fiche", async ({ page }) => {
  await scenario({ write: "ok" });
  await page.goto(`${PATH}?feature=F-001`);
  await page
    .getByRole("dialog", { name: "Connexion par e-mail" })
    .getByRole("button", { name: "Modifier" })
    .click();
  await expect(page.getByRole("dialog", { name: "Modifier F-001" })).toBeVisible();
  await expect(page).toHaveURL(/edit=F-001/);
  await page.goBack();
  await expect(page.getByRole("dialog", { name: "Connexion par e-mail" })).toBeVisible();
});

test("S-feature-form : lot en attente, fermer, suivi par la page puis reprise après rechargement sans nouvel envoi", async ({
  page,
}) => {
  await scenario({ write: "queued" });
  await page.goto(`${PATH}?new=1`);
  await fillCreate(page);
  await save(page);
  await expect(dialogOf(page).getByText("En attente de son tour").first()).toBeVisible();
  await dialogOf(page).getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(
    region(page).filter({ hasText: `Enregistrement de « ${TITLE} » en cours…` }),
  ).toBeVisible();
  await page.reload();
  await expect(region(page).filter({ hasText: `F-004 « ${TITLE} » créée.` })).toBeVisible({
    timeout: 30_000,
  });
  const writes = await specWritesSeen();
  expect(writes.filter((entry) => entry.kind === "submit")).toHaveLength(1);
  expect(writes.some((entry) => entry.kind === "get")).toBe(true);
});

test("S-feature-form : double clic sur « Enregistrer », un seul envoi", async ({ page }) => {
  await scenario({ write: "hold" });
  await page.goto(`${PATH}?new=1`);
  await fillCreate(page);
  await dialogOf(page).getByRole("button", { name: "Enregistrer" }).dblclick();
  await expect(dialogOf(page).getByRole("button", { name: "Enregistrement…" })).toBeVisible();
  await releaseHeld();
  await expect(region(page).filter({ hasText: "créée." })).toBeVisible({ timeout: 20_000 });
  expect((await specWritesSeen()).filter((entry) => entry.kind === "submit")).toHaveLength(1);
});

test("S-feature-form : conflit stale_base, rechargement, nouvel envoi réussi (AC-48-26)", async ({
  page,
}) => {
  await scenario({ write: "conflictOnce" });
  await page.goto(`${PATH}?edit=F-001`);
  const title = dialogOf(page).getByRole("textbox", { name: "Titre (obligatoire)" });
  await expect(title).toHaveValue("Connexion par e-mail");
  await title.fill("Mon titre");
  await save(page);
  await dialogOf(page).getByRole("button", { name: "Recharger la version actuelle" }).click();
  await expect(
    dialogOf(page).getByText(/Ces champs ont aussi changé dans la spec : Titre\./),
  ).toBeVisible();
  await expect(
    dialogOf(page).getByText("Valeur actuelle dans la spec : Titre de la spec"),
  ).toBeVisible();
  await expect(title).toHaveValue("Mon titre");
  await save(page);
  await expect(region(page).filter({ hasText: "F-001 « Mon titre » enregistrée." })).toBeVisible({
    timeout: 20_000,
  });
  const submits = (await specWritesSeen()).filter((entry) => entry.kind === "submit");
  expect(submits).toHaveLength(2);
  expect(submits[1]?.baseSha).not.toBe(submits[0]?.baseSha);
  expect(submits[1]?.idempotencyKey).not.toBe(submits[0]?.idempotencyKey);
});

test("S-feature-form : SPEC_INVALID, le diagnostic mène au champ, saisie conservée (AC-48-26)", async ({
  page,
}) => {
  await scenario({ write: "invalid" });
  await page.goto(`${PATH}?new=1`);
  await fillCreate(page);
  await save(page);
  const dialog = dialogOf(page);
  await expect(dialog.getByRole("alert")).toContainText("La spec obtenue ne serait pas valide");
  await dialog.getByRole("link", { name: /L'écran S-inconnu n'existe pas/ }).click();
  await expect(dialog.getByRole("textbox", { name: "Écrans" })).toBeFocused();
  await expect(dialog.getByRole("textbox", { name: "Écrans" })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(dialog.getByRole("textbox", { name: "Titre (obligatoire)" })).toHaveValue(TITLE);
});

test("S-feature-form : brouillon gardé à la fermeture, repris après rechargement, abandon confirmé en ligne", async ({
  page,
}) => {
  await scenario();
  await page.goto(`${PATH}?new=1`);
  await fillCreate(page);
  await page.waitForTimeout(800);
  await dialogOf(page).getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(dialogOf(page)).toBeHidden();
  await expect(region(page).filter({ hasText: "Brouillon gardé sur cet appareil." })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Nouvelle fonctionnalité" }).click();
  const dialog = dialogOf(page);
  await expect(dialog.getByText(/^Brouillon repris, enregistré le/)).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Titre (obligatoire)" })).toHaveValue(TITLE);
  await dialog.getByRole("button", { name: "Abandonner le brouillon" }).click();
  await expect(
    dialog.getByText("Abandonner ce brouillon ? Votre saisie sera effacée."),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Garder", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "Abandonner", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Titre (obligatoire)" })).toHaveValue("");
  await expect(region(page).filter({ hasText: "Brouillon abandonné." })).toBeVisible();
});

test("S-feature-form : validation côté client, résumé d'erreurs, liens vers les champs, aucun appel", async ({
  page,
}) => {
  await scenario({ write: "ok" });
  await page.goto(`${PATH}?new=1`);
  await save(page);
  const dialog = dialogOf(page);
  await expect(dialog.getByRole("alert")).toContainText("Corrigez 2 points avant d'enregistrer");
  await dialog.getByRole("link", { name: "Saisissez un titre." }).click();
  await expect(dialog.getByRole("textbox", { name: "Titre (obligatoire)" })).toBeFocused();
  expect((await specWritesSeen()).filter((entry) => entry.kind === "submit")).toHaveLength(0);
});

test.describe("rôles", () => {
  test("développeur : crée sans écran lié", async ({ page }) => {
    await scenario({ write: "ok", role: "dev" });
    await page.goto(PATH);
    await page.getByRole("button", { name: "Nouvelle fonctionnalité" }).click();
    await fillCreate(page);
    await save(page);
    await expect(region(page).filter({ hasText: "créée." })).toBeVisible({ timeout: 20_000 });
  });

  test("designer : « Éléments liés » ouvert, aide, refus préalable sans écran puis envoi avec un écran", async ({
    page,
  }) => {
    await scenario({ write: "ok", role: "designer" });
    await page.goto(`${PATH}?new=1`);
    const dialog = dialogOf(page);
    await expect(dialog.getByText(/En tant que designer, vous pouvez enregistrer/)).toBeVisible();
    await fillCreate(page);
    await save(page);
    await expect(
      dialog.getByRole("link", {
        name: "Liez au moins un écran pour enregistrer cette fonctionnalité.",
      }),
    ).toBeVisible();
    expect((await specWritesSeen()).filter((entry) => entry.kind === "submit")).toHaveLength(0);
    await linkScreen(page);
    await save(page);
    await expect(region(page).filter({ hasText: "créée." })).toBeVisible({ timeout: 20_000 });
  });

  for (const role of ["client", "business"] as KanbanRole[]) {
    test(`${role} : aucun bouton d'écriture, ?new=1 et ?edit=F-001 ignorés, aucun appel d'écriture (AC-48-27)`, async ({
      page,
    }) => {
      await scenario({ write: "ok", role });
      await page.goto(`${PATH}?new=1`);
      await expect(page.getByRole("table", { name: /^Fonctionnalités du projet/ })).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page).not.toHaveURL(/new=/);
      await expect(
        page.getByRole("button", { name: /Nouvelle fonctionnalité|Modifier/ }),
      ).toHaveCount(0);
      await page.goto(`${PATH}?edit=F-001`);
      await expect(page.getByRole("dialog", { name: "Connexion par e-mail" })).toBeVisible();
      await expect(page.getByRole("textbox")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Modifier" })).toHaveCount(0);
      expect(await specWritesSeen()).toEqual([]);
      const html = await page.content();
      expect(html).not.toMatch(/feature-draft|feature-pending|idempotency/i);
    });
  }
});

test("S-feature-form : clavier, Tab dans l'ordre, Échap ferme et rend le focus au bouton", async ({
  page,
}) => {
  await scenario();
  await page.goto(PATH);
  const trigger = page.getByRole("button", { name: "Nouvelle fonctionnalité" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = dialogOf(page);
  await expect(dialog.getByRole("textbox", { name: "Titre (obligatoire)" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("combobox", { name: "Priorité (obligatoire)" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("S-feature-form : la région d'état unique reste dans l'arbre d'accessibilité sous le panneau modal", async ({
  page,
}) => {
  await scenario();
  await page.goto(`${PATH}?new=1`);
  await dialogOf(page).waitFor();
  // `getByRole` ignore les éléments masqués aux technologies d'assistance (aria-hidden posé par le dialogue).
  await expect(page.getByRole("status")).toHaveCount(1);
  await expect(dialogOf(page).getByRole("status")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialogOf(page)).toBeHidden();
  await expect(page.getByRole("status")).toHaveCount(1);
});

test("S-feature-form : mouvement réduit, aucune animation infinie dans le formulaire", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await scenario({ feature: "loading" });
  await page.goto(`${PATH}?edit=F-001`);
  await expect(dialogOf(page).getByText("Chargement de la fonctionnalité…")).toBeVisible();
  const infinite = await page.evaluate(
    () =>
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations === Number.POSITIVE_INFINITY).length,
  );
  expect(infinite).toBe(0);
  await releaseHeld();
});

test.describe("375 px", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("create-filled-mobile : pleine largeur, pied à deux boutons empilés, aucun défilement horizontal, capture", async ({
    page,
  }) => {
    await scenario();
    await page.goto(`${PATH}?new=1`);
    await fillRich(page);
    await settle(page);
    const box = await dialogOf(page).boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(370);
    const saveBox = await dialogOf(page).getByRole("button", { name: "Enregistrer" }).boundingBox();
    const closeBox = await dialogOf(page)
      .getByRole("button", { name: "Fermer", exact: true })
      .boundingBox();
    expect(saveBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(saveBox?.y ?? 0).toBeLessThan(closeBox?.y ?? 0);
    expect(await noHorizontalScroll(page)).toBe(true);
    await capture(page, "create-filled", "light", "-mobile");
    await noAxeViolation(page);
  });

  test("error-spec-invalid-mobile : diagnostics pleine largeur, capture", async ({ page }) => {
    await scenario({ write: "invalid" });
    await page.goto(`${PATH}?new=1`);
    await fillCreate(page);
    await save(page);
    await expect(dialogOf(page).getByText("La spec obtenue ne serait pas valide")).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    await capture(page, "error-spec-invalid", "light", "-mobile");
    await noAxeViolation(page);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
test.describe("Suppression (48e-2)", () => {
  test("confirmation en ligne : texte, deux boutons, focus sur « Garder », aucun dialogue empilé, aucun appel", async ({
    page,
  }) => {
    await scenario({ write: "ok" });
    await openF001(page);
    await askDelete(page);
    const group = confirmGroup(page);
    // Deux copies du titre : l'une masquée (lue en entier), l'autre visible avec l'identifiant en mono.
    await expect(group.locator("p[aria-hidden='true']")).toHaveText(
      "Supprimer F-001 « Connexion par e-mail » ?",
    );
    await expect(group.locator("p[aria-hidden='true'] .font-mono")).toHaveText("F-001");
    await expect(group).toContainText("Ses critères d'acceptation seront supprimés avec elle.");
    await expect(group.getByRole("button", { name: "Garder", exact: true })).toBeFocused();
    await expect(group.getByRole("button", { name: "Supprimer", exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(dialogOf(page).getByRole("button", { name: "Enregistrer" })).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveCount(1);
    expect(await specWritesSeen()).toEqual([]);
  });

  test("« Garder » : retour au pied, focus sur « Supprimer cette fonctionnalité », aucun envoi, saisie gardée", async ({
    page,
  }) => {
    await scenario({ write: "ok" });
    await openF001(page);
    await titleBox(page).fill("Titre en cours");
    await askDelete(page);
    await confirmGroup(page).getByRole("button", { name: "Garder", exact: true }).click();
    await expect(confirmGroup(page)).toHaveCount(0);
    await expect(dialogOf(page).getByRole("button", { name: DELETE })).toBeFocused();
    await expect(titleBox(page)).toHaveValue("Titre en cours");
    expect(await specWritesSeen()).toEqual([]);
  });

  test("suppression nominale : une opération feature.delete, F-001 disparaît de la liste relue, annonce, focus sur le h1 (AC-48-24)", async ({
    page,
  }) => {
    await scenario({ write: "ok" });
    await openF001(page);
    await askDelete(page);
    await confirmDeletion(page);
    await expect(region(page).filter({ hasText: "F-001 supprimée." })).toBeVisible({
      timeout: 20_000,
    });
    await expect(dialogOf(page)).toBeHidden();
    await expect(page).not.toHaveURL(/edit=/);
    await expect(page.getByRole("link", { name: "Connexion par e-mail" })).toHaveCount(0);
    await expect(page.getByRole("row")).toHaveCount(3);
    await expect(page.getByRole("heading", { level: 1, name: "Fonctionnalités" })).toBeFocused();
    await expect(page.getByRole("status")).toHaveCount(1);
    const submits = await submitsSeen();
    expect(submits).toHaveLength(1);
    const [body] = submits;
    expect(body?.idempotencyKey).toMatch(KEY_PATTERN);
    expect(body?.baseSha).toBe(BASE_SHA);
    expect(body).not.toHaveProperty("message");
    expect(body?.operations).toEqual([{ kind: "feature.delete", specId: "F-001" }]);
  });

  test("l'adresse d'une fonctionnalité supprimée dit qu'elle n'existe plus et n'offre pas de suppression", async ({
    page,
  }) => {
    await scenario({ write: "ok" });
    await openF001(page);
    await askDelete(page);
    await confirmDeletion(page);
    await expect(region(page).filter({ hasText: "F-001 supprimée." })).toBeVisible({
      timeout: 20_000,
    });
    await page.goto(`${PATH}?edit=F-001`);
    await expect(
      dialogOf(page).getByText("Cette fonctionnalité n'existe plus dans la spec."),
    ).toBeVisible();
    await expect(dialogOf(page).getByRole("button", { name: DELETE })).toHaveCount(0);
  });

  test("suppression refusée (SPEC_INVALID, une référence) : diagnostic lisible, F-001 reste dans la liste", async ({
    page,
  }) => {
    await scenario({ write: "invalid" });
    await openF001(page);
    await askDelete(page);
    await confirmDeletion(page);
    const alert = dialogOf(page).getByRole("alert");
    await expect(alert).toContainText("La spec obtenue ne serait pas valide");
    await expect(alert).toContainText("La fonctionnalité reste dans la spec");
    await expect(alert).not.toContainText("Corrigez");
    await expect(alert).toContainText("Le scénario TS-001 renvoie à F-001, qui n'existerait plus.");
    await expect(dialogOf(page).getByRole("button", { name: DELETE })).toBeVisible();
    await dialogOf(page).getByRole("button", { name: "Fermer", exact: true }).click();
    await expect(page.getByRole("link", { name: "Connexion par e-mail" })).toBeVisible();
  });

  test("GitHub indisponible (503) : « Réessayer » renvoie la suppression avec une nouvelle clé", async ({
    page,
  }) => {
    await scenario({ write: "provider" });
    await openF001(page);
    await askDelete(page);
    await confirmDeletion(page);
    await expect(dialogOf(page).getByRole("alert")).toContainText(
      "GitHub est momentanément indisponible",
    );
    await dialogOf(page).getByRole("button", { name: "Réessayer" }).click();
    await expect.poll(async () => (await submitsSeen()).length).toBe(2);
    const [first, second] = await submitsSeen();
    expect(second?.idempotencyKey).not.toBe(first?.idempotencyKey);
    expect(second?.operations).toEqual([{ kind: "feature.delete", specId: "F-001" }]);
  });

  test("lot en attente, fermer, rechargement : suivi par la page, sans second envoi, puis « F-001 supprimée. »", async ({
    page,
  }) => {
    await scenario({ write: "queued" });
    await openF001(page);
    await askDelete(page);
    await confirmDeletion(page);
    await expect(dialogOf(page).getByText("En attente de son tour").first()).toBeVisible();
    await dialogOf(page).getByRole("button", { name: "Fermer", exact: true }).click();
    await expect(
      region(page).filter({ hasText: "Suppression de « Connexion par e-mail » en cours…" }),
    ).toBeVisible();
    await page.reload();
    await expect(region(page).filter({ hasText: "F-001 supprimée." })).toBeVisible({
      timeout: 30_000,
    });
    const writes = await specWritesSeen();
    expect(writes.filter((entry) => entry.kind === "submit")).toHaveLength(1);
    expect(writes.some((entry) => entry.kind === "get")).toBe(true);
    await expect(page.getByRole("link", { name: "Connexion par e-mail" })).toHaveCount(0);
  });

  test("double clic sur « Supprimer » : un seul envoi", async ({ page }) => {
    await scenario({ write: "hold" });
    await openF001(page);
    await askDelete(page);
    await confirmGroup(page).getByRole("button", { name: "Supprimer", exact: true }).dblclick();
    await expect(dialogOf(page).getByRole("button", { name: "Suppression…" })).toBeVisible();
    await releaseHeld();
    await expect(region(page).filter({ hasText: "supprimée." })).toBeVisible({ timeout: 20_000 });
    expect(await submitsSeen()).toHaveLength(1);
  });

  test("clavier : Entrée ouvre la confirmation, focus sur « Garder », Tab reste dans le panneau, Entrée sur « Garder » annule", async ({
    page,
  }) => {
    await scenario({ write: "ok" });
    await openF001(page);
    await dialogOf(page).getByRole("button", { name: DELETE }).focus();
    await page.keyboard.press("Enter");
    const keep = confirmGroup(page).getByRole("button", { name: "Garder", exact: true });
    await expect(keep).toBeFocused();
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(
        true,
      );
    }
    await keep.focus();
    await page.keyboard.press("Enter");
    await expect(confirmGroup(page)).toHaveCount(0);
    expect(await specWritesSeen()).toEqual([]);
  });

  for (const role of ["dev", "designer"] as KanbanRole[]) {
    test(`${role} : peut supprimer une fonctionnalité liée à un écran`, async ({ page }) => {
      await scenario({ write: "ok", role });
      await openF001(page);
      await askDelete(page);
      await confirmDeletion(page);
      await expect(region(page).filter({ hasText: "F-001 supprimée." })).toBeVisible({
        timeout: 20_000,
      });
    });
  }

  test("designer, serveur qui refuse (FORBIDDEN) : règle de l'écran affichée, F-001 reste", async ({
    page,
  }) => {
    await scenario({ write: "forbidden", role: "designer" });
    await openF001(page);
    await askDelete(page);
    await confirmDeletion(page);
    await expect(dialogOf(page).getByRole("alert")).toContainText(
      "Vous ne pouvez enregistrer que les fonctionnalités liées à un écran",
    );
  });

  for (const role of ["client", "business"] as KanbanRole[]) {
    test(`${role} : aucune suppression, ni bouton ni confirmation, aucun appel d'écriture (AC-48-27, AC-48-28)`, async ({
      page,
    }) => {
      await scenario({ write: "ok", role });
      await page.goto(`${PATH}?edit=F-001`);
      await expect(page.getByRole("dialog", { name: "Connexion par e-mail" })).toBeVisible();
      await expect(page.getByRole("button", { name: /Supprimer|Modifier/ })).toHaveCount(0);
      await expect(page.getByRole("group", { name: "Confirmer la suppression" })).toHaveCount(0);
      expect(await specWritesSeen()).toEqual([]);
      const html = await page.content();
      expect(html).not.toMatch(/Supprimer cette fonctionnalité|feature-draft|feature-pending/i);
    });
  }

  test.describe("375 px", () => {
    test.use({ viewport: { width: 375, height: 800 } });

    test("delete-confirm-mobile : boutons pleine largeur de 44 px, aucun défilement horizontal, capture", async ({
      page,
    }) => {
      await scenario({ write: "ok" });
      await openF001(page);
      await askDelete(page);
      await settle(page);
      const confirm = await confirmGroup(page)
        .getByRole("button", { name: "Supprimer", exact: true })
        .boundingBox();
      const keep = await confirmGroup(page)
        .getByRole("button", { name: "Garder", exact: true })
        .boundingBox();
      expect(confirm?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(keep?.height ?? 0).toBeGreaterThanOrEqual(44);
      // Pleine largeur de la colonne de la confirmation (l'icône en prend une part à gauche : ~264 px à 375 px).
      const column = await confirmGroup(page)
        .getByRole("button", { name: "Garder", exact: true })
        .evaluate((el) => el.parentElement?.getBoundingClientRect().width ?? 0);
      expect(confirm?.width ?? 0).toBeGreaterThanOrEqual(column - 1);
      expect(confirm?.width ?? 0).toBeGreaterThanOrEqual(240);
      expect(await noHorizontalScroll(page)).toBe(true);
      await capture(page, "delete-confirm", "light", "-mobile");
      await noAxeViolation(page);
    });
  });
});
