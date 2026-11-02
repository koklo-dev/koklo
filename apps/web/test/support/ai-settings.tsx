import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { AiSettingsPage } from "../../src/components/ai-settings-page.tsx";
import { asRole } from "./github-fixtures.ts";
import { findNamed } from "./wait.ts";
import { procedures } from "./web-mocks.ts";

/**
 * Support des tests de l'écran des réglages de l'IA (design/screens/S-ai-settings.md). Les `vi.mock` restent dans
 * chaque fichier (voir github-page.test.tsx). Contrat des noms et des libellés : .workflow/AI-SETTINGS/02-decisions.md.
 */

/**
 * Clé sentinelle : clairement factice, jamais une forme réaliste de clé de fournisseur. Les fragments de bord
 * (début et fin) comptent aussi comme une fuite.
 */
export const SECRET = "FAKE-KEY-NOT-REAL-7f3a9c2e41d85b60";
export const SECRET_FRAGMENTS = [SECRET, SECRET.slice(0, 16), SECRET.slice(-16)] as const;
export const MODEL = "claude-test-1";
export const CHECKED_AT = "2026-11-02T10:00:00.000Z";

export const SAVE_VERIFY = "Enregistrer et vérifier";
export const KEY_FIELD = "Clé API Anthropic";
export const VERIFY_AGAIN = "Vérifier à nouveau";
export const REPLACE = "Remplacer la clé";
export const REMOVE = "Retirer la clé";
export const KEEP = "Garder la clé";
export const CONFIRM_GROUP = "Confirmer le retrait de la clé";
export const GENERIC_SAVE_FAILURE =
  "Impossible d'enregistrer la clé. Vérifiez votre connexion puis saisissez de nouveau la clé : par sécurité, elle n'est jamais conservée sur cet écran.";

/** `Status` du contrat : jamais la clé, ni aucun indice sur elle. */
export const credential = (over: Record<string, unknown> = {}) => ({
  provider: "anthropic",
  configured: true,
  invalid: false,
  createdAt: "2026-10-20T12:00:00.000Z",
  updatedAt: "2026-10-20T12:00:00.000Z",
  ...over,
});

/** `list` répond `items` ; `set`, `verify` et `remove` réussissent. À appeler dans `beforeEach` après `resetWebMocks()`. */
export function serveAiSettings(role = "owner", items: unknown[] = []): void {
  asRole(role);
  procedures.llmCredentialList.mockResolvedValue({ items });
  procedures.llmCredentialSet.mockResolvedValue(credential());
  procedures.llmCredentialVerify.mockResolvedValue({
    ok: true,
    model: MODEL,
    checkedAt: CHECKED_AT,
  });
  procedures.llmCredentialRemove.mockResolvedValue({ removed: true });
}

/** Rend la page avec un client TanStack exposé (les tests inspectent son cache). */
export function renderAiSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <AiSettingsPage />
    </QueryClientProvider>,
  );
  return { client, ...view };
}

/** Rend la page et attend la carte « Anthropic » (h2). */
export async function openAiSettings(items?: unknown[], role = "owner") {
  // Seule la liste change : les réponses de set / verify / remove déjà préparées par le test restent en place.
  if (items) {
    asRole(role);
    procedures.llmCredentialList.mockResolvedValue({ items });
  }
  const view = renderAiSettings();
  await findNamed("heading", "Anthropic", { level: 2 });
  return view;
}

export const keyField = (): HTMLInputElement =>
  screen.getByLabelText(KEY_FIELD) as HTMLInputElement;
export const queryKeyField = (): HTMLInputElement | null =>
  screen.queryByLabelText(KEY_FIELD) as HTMLInputElement | null;
export const button = (name: string | RegExp) => screen.getByRole("button", { name });
export const queryButton = (name: string | RegExp) => screen.queryByRole("button", { name });

export async function typeKey(value = SECRET) {
  const field = keyField();
  await userEvent.click(field);
  await userEvent.paste(value);
  return field;
}
/** Saisit la clé et clique « Enregistrer et vérifier ». */
export async function saveKey(value = SECRET) {
  const field = await typeKey(value);
  await userEvent.click(button(SAVE_VERIFY));
  return field;
}

/** Arguments reçus par les procédures simulées, dans l'ordre. */
export const argsOf = (fn: (typeof procedures)[keyof typeof procedures]): unknown[] =>
  fn.mock.calls.map((call: unknown[]) => call[0]);
export const llmCalls = () =>
  [
    procedures.llmCredentialList,
    procedures.llmCredentialSet,
    procedures.llmCredentialVerify,
    procedures.llmCredentialRemove,
  ].reduce((total, fn) => total + fn.mock.calls.length, 0);

/** Région d'état unique (`role="status"`) : échoue s'il y en a zéro ou plusieurs rendues. */
export const statusText = (): string =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="status"], output'))
    .map((el) => el.textContent ?? "")
    .join(" ")
    .replace(/\s+/g, " ");
export const alertEl = (): HTMLElement => screen.getByRole("alert");
export const flush = () => act(async () => void (await Promise.resolve()));

/** Tout ce qui est lisible du document : DOM, URL, stockages. */
export function surfaces(): string[] {
  const storage = (area: Storage) =>
    Object.keys(area)
      .map((key) => `${key}=${area.getItem(key)}`)
      .join("\n");
  const values = Array.from(document.querySelectorAll<HTMLInputElement>("input, textarea"))
    .map((field) => field.value)
    .join("\n");
  return [
    document.documentElement.outerHTML,
    values,
    document.body.textContent ?? "",
    window.location.href,
    storage(localStorage),
    storage(sessionStorage),
  ];
}
