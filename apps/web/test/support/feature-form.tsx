import type { FeatureDetail } from "@koklo/contract";
import { act, type BoundFunctions, type queries, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, vi } from "vitest";
import {
  DETAIL,
  FEATURES,
  head,
  inputsOf,
  list,
  type Role,
  renderFeatures,
  serve,
  summary,
} from "./features.tsx";
import { findNamed, findRole } from "./wait.ts";
import { procedures } from "./web-mocks.ts";

/**
 * Support des tests du formulaire d'une fonctionnalité (TK-48 / 48e : création et modification en 48e-1, suppression en 48e-2).
 * Les `vi.mock` restent dans chaque fichier (voir features.tsx). Contrat des libellés et des sélecteurs :
 * .workflow/TK-48/03-red-48e.md.
 */
/** La fiche de test, typée comme la réponse du contrat. */
export const DETAIL_TYPED = DETAIL as FeatureDetail;
export type Panel = BoundFunctions<typeof queries>;
export const BATCH_ID = "01900000-0000-7000-8000-0000000000d1";
export const NEW_SHA = "b2c3d4e5f60718293a4b5c6d7e8f9012345678ab";
export const NEW_SHORT_SHA = "b2c3d4e";
export const CREATED_ID = "F-004";
export const NEW_TITLE = "Notifications par e-mail";

export const batch = (over: Record<string, unknown> = {}) => ({
  id: BATCH_ID,
  branch: "main",
  status: "committed",
  idempotencyKey: "feature-x",
  baseSha: null,
  commitSha: NEW_SHA,
  errorCode: null,
  report: null,
  results: [{ position: 0, kind: "feature.create", specId: CREATED_ID }],
  enqueuedAt: "2026-10-31T12:00:00.000Z",
  committedAt: "2026-10-31T12:00:02.000Z",
  ...over,
});
export const queuedBatch = (over: Record<string, unknown> = {}) =>
  batch({ status: "queued", commitSha: null, committedAt: null, ...over });
export const committingBatch = () => queuedBatch({ status: "committing" });
export const updatedBatch = (specId = "F-001", over: Record<string, unknown> = {}) =>
  batch({
    baseSha: head().commitSha,
    results: [{ position: 0, kind: "feature.update", specId }],
    ...over,
  });
export const failedBatch = (errorCode: string, over: Record<string, unknown> = {}) =>
  batch({ status: "failed", commitSha: null, committedAt: null, errorCode, ...over });
export const conflictBatch = (errorCode: string) =>
  batch({ status: "conflict", commitSha: null, committedAt: null, errorCode });

/** Une page de la liste qui contient la fonctionnalité créée (F-004). */
export const listWithCreated = (title = NEW_TITLE) =>
  list([...FEATURES, summary(4, { title, status: "brouillon", priority: "should" })]);

/** Après l'écriture, l'index a rattrapé le commit et la liste contient la fonctionnalité créée. */
export function indexCatchesUp(title = NEW_TITLE): void {
  procedures.specHead.mockResolvedValue(head({ commitSha: NEW_SHA }));
  procedures.specListFeatures.mockResolvedValue(listWithCreated(title));
}

/** Lot de suppression : `feature.delete` de F-001, `baseSha` = version lue à l'ouverture (48e-2). */
export const deletedBatch = (specId = "F-001", over: Record<string, unknown> = {}) =>
  batch({
    baseSha: head().commitSha,
    results: [{ position: 0, kind: "feature.delete", specId }],
    ...over,
  });
/** La liste d'après la suppression de F-001 (les deux autres restent). */
export const listWithoutF001 = () => list(FEATURES.slice(1));

/** Après la suppression, l'index a rattrapé le commit et la liste ne contient plus F-001. */
export function indexCatchesUpAfterDelete(): void {
  procedures.specHead.mockResolvedValue(
    head({ commitSha: NEW_SHA, counts: { features: 2, tables: 2, endpoints: 4 } }),
  );
  procedures.specListFeatures.mockResolvedValue(listWithoutF001());
}

export function serveWrite(role: Role = "owner"): void {
  serve(role);
  procedures.specBatchSubmit.mockResolvedValue(batch());
  procedures.specBatchGet.mockResolvedValue(batch());
}

// biome-ignore lint/suspicious/noExplicitAny: entrées simulées lues librement par les assertions
export type Loose = Record<string, any>;
export const submitInputs = (): Loose[] => inputsOf(procedures.specBatchSubmit);
export const lastSubmit = (): Loose => submitInputs().at(-1) ?? {};
export const operationOf = (input: Loose = lastSubmit()): Loose => input.operations?.[0] ?? {};

/** Les régions d'état de l'écran, accessibles ou non : la fiche modale en masque le reste aux lecteurs d'écran. */
export const statusRegions = (): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="status"], output')).filter(
    // Le toast de fin d'écriture (maquette 16 l.106) est une notification à part, pas la région d'état de l'écran.
    // (Radix pose l'annonce du toast, un `role="status"`, directement sous <body>.)
    (region) =>
      region.parentElement !== document.body &&
      !region.closest('[data-slot="toast"], [aria-label^="Notifications"]'),
  );
/** La région d'état unique (S-feature-form §7) : échoue s'il y en a zéro ou plusieurs. */
export function liveRegion(): HTMLElement {
  const regions = statusRegions();
  if (regions.length !== 1) throw new Error(`${regions.length} régions d'état au lieu d'une`);
  return regions[0] as HTMLElement;
}
export const liveText = (): string => (liveRegion().textContent ?? "").replace(/\s+/g, " ");

export const dialog = (): Promise<HTMLElement> => findRole("dialog");
export const form = async () => within(await dialog());

/** Rend la page, attend la liste et ouvre le formulaire de création par son bouton. */
export async function openCreate(user: { click: (element: Element) => Promise<void> } = userEvent) {
  renderFeatures();
  await findNamed("list", "Fonctionnalités", { text: "Connexion par e-mail", hidden: true });
  await user.click(await findNamed("button", "Nouvelle fonctionnalité"));
  return form();
}

/** Ouvre le formulaire de modification de F-001 par l'adresse. */
export async function openEdit(search = "?edit=F-001") {
  renderFeatures({ search });
  // Le panneau de chargement est remplacé par le formulaire une fois la fiche lue : on relit le dialogue ensuite.
  await screen.findByDisplayValue("Connexion par e-mail", undefined, { timeout: 8_000 });
  return form();
}

export const DELETE_BUTTON = "Supprimer";
export const CONFIRM_GROUP = "Confirmer la suppression";
export const CONFIRM_TITLE = "Supprimer F-001 « Connexion par e-mail » ?";
export const CONFIRM_TEXT =
  "Ses critères d'acceptation seront supprimés avec elle. Si d'autres éléments de la spec y renvoient (par exemple un scénario de test), la suppression sera refusée et vous verrez pourquoi.";

/** Demande la suppression : le pied est remplacé par la confirmation en ligne (S-feature-form §4.8). */
export async function askDelete(
  panel: Panel,
  user: { click: (e: Element) => Promise<void> } = userEvent,
) {
  await user.click(panel.getByRole("button", { name: DELETE_BUTTON }));
  return within(await panel.findByRole("group", { name: CONFIRM_GROUP }));
}
/** Demande puis confirme la suppression (bouton « Supprimer » de la confirmation). */
export async function confirmDelete(
  panel: Panel,
  user: { click: (e: Element) => Promise<void> } = userEvent,
) {
  const confirmation = await askDelete(panel, user);
  await user.click(confirmation.getByRole("button", { name: "Supprimer" }));
  return confirmation;
}
/** Ouvre la modification de F-001 (par l'adresse) et confirme la suppression. */
export async function deleteF001(user: { click: (e: Element) => Promise<void> } = userEvent) {
  const panel = await openEdit();
  await confirmDelete(panel, user);
  return panel;
}

export async function pick(panel: Panel, label: string | RegExp, option: string) {
  const group = panel.queryByRole("radiogroup", {
    name: typeof label === "string" ? new RegExp(`^${label}`) : label,
  });
  if (group) {
    await userEvent.click(within(group).getByRole("radio", { name: option }));
    return;
  }
  await userEvent.click(panel.getByRole("combobox", { name: label }));
  await userEvent.click(await findNamed("option", option));
}

export async function setText(field: HTMLElement, value: string) {
  await userEvent.clear(field);
  if (value) await userEvent.click(field);
  if (value) await userEvent.paste(value);
}

export const titleField = (panel: Panel) =>
  panel.getByRole("textbox", { name: /^Titre\s*obligatoire$/ });

/** Saisit un titre et une priorité (le minimum d'une création). */
export async function fillMinimum(panel: Panel, title = NEW_TITLE, priority = "Importante") {
  await setText(titleField(panel), title);
  await pick(panel, /^Priorité\s*obligatoire$/, priority);
}

/**
 * Ferme le panneau par « Annuler » : une saisie changée demande d'abord « Fermer sans enregistrer ? » (TK-101),
 * confirmée ici. Le brouillon est gardé comme avant.
 */
export async function closePanel(
  panel: Panel,
  user: { click: (element: Element) => Promise<void> } = userEvent,
): Promise<void> {
  await user.click(await panel.findByRole("button", { name: "Annuler" }));
  const confirm = screen.queryByRole("alertdialog");
  if (confirm) {
    await user.click(within(confirm).getByRole("button", { name: "Fermer sans enregistrer" }));
  }
}

/** La pastille de priorité choisie (`RadioPill` cochée). */
export function expectPriority(panel: Panel, label: string): void {
  const radio = within(panel.getByRole("radiogroup", { name: /^Priorité/ })).getByRole("radio", {
    name: label,
  });
  expect(radio).toBeChecked();
}

export const saveButton = (panel: Panel) =>
  panel.getByRole("button", { name: /^Enregistre(r|ment…)/ });
export const clickSave = (panel: Panel) =>
  userEvent.click(panel.getByRole("button", { name: /^Enregistrer/ }));

/** Saisie à puces « Liens » (une seule pour les six listes du schéma). */
export const linksInput = (panel: Panel) =>
  panel.getByRole("combobox", { name: "Liens : ajouter" });
export const linkField = (panel: Panel, _label?: string) => linksInput(panel);
/** Ajoute des liens, un par Entrée. */
export async function addLinks(panel: Panel, tags: string[]): Promise<void> {
  for (const tag of tags) await userEvent.type(linksInput(panel), `${tag}{Enter}`);
}
/** Retire toutes les puces de liens. */
export async function clearLinks(panel: Panel): Promise<void> {
  for (const button of panel.queryAllByRole("button", { name: /^Retirer (S|RL|R|T|E|NFR)-/ })) {
    await userEvent.click(button);
  }
}

/** Visibilité de l'onglet (les relectures sont suspendues onglet masqué). */
export function setTabVisibility(visible: boolean): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (visible ? "visible" : "hidden"),
  });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => !visible });
  document.dispatchEvent(new Event("visibilitychange"));
}

export const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
/** Appels reçus par une procédure simulée. */
export const callCount = (fn: { mock: { calls: unknown[][] } }): number => fn.mock.calls.length;

/** Réponse en attente : la promesse d'un appel réseau que le test résout ou rejette plus tard. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export { screen, within };
