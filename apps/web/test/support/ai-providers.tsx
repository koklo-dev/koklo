import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { AiSettingsPage } from "../../src/components/ai-settings-page.tsx";
import { asRole } from "./github-fixtures.ts";
import { findNamed } from "./wait.ts";
import { procedures } from "./web-mocks.ts";

/**
 * Support des tests de l'écran « Fournisseurs d'IA » (design/screens/S-ai-settings.md v2, contrat 2.3.0). Les
 * `vi.mock` restent dans chaque fichier. Clé sentinelle clairement factice, jamais une forme réaliste.
 */
export const SECRET = "FAKE-KEY-NOT-REAL-7f3a9c2e41d85b60";
export const SECRET_FRAGMENTS = [SECRET, SECRET.slice(0, 16), SECRET.slice(-16)] as const;
export const CHECKED_AT = "2026-11-02T10:00:00.000Z";
export const ADD_BUTTON = "Ajouter un fournisseur";
export const SUBMIT = "Vérifier et enregistrer";
export const RESTRICTED =
  "Cette page est réservée aux propriétaires et aux administrateurs. Demandez à l'un d'eux de configurer l'IA.";

export const provider = (name: string, over: Record<string, unknown> = {}) => ({
  provider: name,
  role: null,
  status: "verified",
  lastUsedAt: CHECKED_AT,
  intermediary: name === "openrouter",
  euEligible: name !== "openrouter",
  baseUrlRequired: name === "openai_compatible",
  ...over,
});
export const PRIMARY = provider("anthropic", { role: "primary" });
export const SECOND = provider("openai", { role: "fallback" });

const ALL_USAGES = ["idea_space", "spec_deliverables", "baseline_summary", "ticket_breakdown"];
export const MODELS = [
  { provider: "anthropic", model: "claude-test-sonnet", usages: ALL_USAGES, economy: false },
  { provider: "anthropic", model: "claude-test-haiku", usages: ALL_USAGES, economy: true },
  { provider: "openai", model: "gpt-test-1", usages: ALL_USAGES, economy: false },
];
export const SETTINGS = {
  fallbackEnabled: false,
  usages: ALL_USAGES.map((usage) => ({ usage, isDefault: true })),
};
export const REPORT = {
  month: "2026-11",
  providers: [
    {
      provider: "anthropic",
      calls: 12,
      inputTokens: 40_000,
      outputTokens: 8_000,
      costMicroUsd: 8_100_000,
    },
    {
      provider: "openai",
      calls: 3,
      inputTokens: 5_000,
      outputTokens: 1_000,
      costMicroUsd: 4_300_000,
    },
  ],
  totalCostMicroUsd: 12_400_000,
  capState: "ok",
};

/** Toutes les lectures répondent ; les écritures réussissent. À appeler dans `beforeEach` après `resetWebMocks()`. */
export function serveProviders(role = "owner", items: unknown[] = [PRIMARY, SECOND]): void {
  asRole(role);
  procedures.aiProviderList.mockResolvedValue({ items });
  procedures.aiModelListQualified.mockResolvedValue({ items: MODELS });
  procedures.aiSettingsGet.mockResolvedValue(SETTINGS);
  procedures.aiUsageReport.mockResolvedValue(REPORT);
  procedures.aiProviderAdd.mockResolvedValue(provider("mistral"));
  procedures.aiProviderVerify.mockResolvedValue({ ok: true, model: "m", checkedAt: CHECKED_AT });
  procedures.aiProviderReplaceKey.mockResolvedValue(PRIMARY);
  procedures.aiProviderRemove.mockResolvedValue({ removed: true });
  procedures.aiProviderSetPrimary.mockResolvedValue(SECOND);
  procedures.aiUsageSet.mockResolvedValue({ usage: "idea_space", isDefault: false });
  procedures.aiSettingsUpdate.mockResolvedValue({ ...SETTINGS, fallbackEnabled: true });
}

export function renderAiSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <AiSettingsPage />
    </QueryClientProvider>,
  );
  return { client, ...view };
}

/** Rend la page et attend la liste des fournisseurs (h3 « Fournisseurs »). */
export async function openProviders(items?: unknown[], role = "owner") {
  // Seule la liste change : les réponses déjà préparées par le test restent en place.
  if (items) {
    asRole(role);
    procedures.aiProviderList.mockResolvedValue({ items });
  }
  const view = renderAiSettings();
  await findNamed("heading", "Fournisseurs", { level: 3 });
  return view;
}

export const button = (name: string | RegExp) => screen.getByRole("button", { name });
export const queryButton = (name: string | RegExp) => screen.queryByRole("button", { name });
export const row = (name: string | RegExp) => screen.getByRole("listitem", { name });
export const inRow = (name: string | RegExp) => within(row(name));

/** Ouvre le formulaire d'ajout. */
export async function openAddForm() {
  await userEvent.click(button(ADD_BUTTON));
}
export const keyField = (): HTMLInputElement =>
  screen.getByLabelText(/^Clé [A-ZÀ-Ý]/) as HTMLInputElement;

/** Choisit un fournisseur, saisit la clé et envoie. */
export async function addProvider(name: string, value = SECRET) {
  await userEvent.click(screen.getByRole("radio", { name: new RegExp(name) }));
  await userEvent.click(keyField());
  await userEvent.paste(value);
  await userEvent.click(button(SUBMIT));
}

export const calls = (fn: (typeof procedures)[keyof typeof procedures]): unknown[] =>
  fn.mock.calls.map((call: unknown[]) => call[0]);

export const WRITES = [
  procedures.aiProviderAdd,
  procedures.aiProviderVerify,
  procedures.aiProviderReplaceKey,
  procedures.aiProviderRemove,
  procedures.aiProviderSetPrimary,
  procedures.aiUsageSet,
  procedures.aiSettingsUpdate,
];
export const READS = [
  procedures.aiProviderList,
  procedures.aiModelListQualified,
  procedures.aiSettingsGet,
  procedures.aiUsageReport,
];
export const allCalls = () =>
  [...READS, ...WRITES].reduce((total, fn) => total + fn.mock.calls.length, 0);

/** Texte de toute la page, espaces normalisés (insécables compris). */
export const pageText = (): string => (document.body.textContent ?? "").replace(/\s+/g, " ");

/** Tout ce qui est lisible du document : DOM, valeurs, URL, stockages. */
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
