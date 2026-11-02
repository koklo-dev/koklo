import { inspect } from "node:util";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  button,
  credential,
  KEY_FIELD,
  keyField,
  openAiSettings,
  SAVE_VERIFY,
  SECRET,
  SECRET_FRAGMENTS,
  saveKey,
  serveAiSettings,
  surfaces,
  typeKey,
} from "./support/ai-settings.tsx";
import { apiError, polyfillRadix, procedures, resetWebMocks } from "./support/web-mocks.ts";

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

/**
 * TEST CENTRAL des réglages de l'IA (S-ai-settings §4.10, ADR 0013, vision §15) : la valeur de la clé n'existe
 * nulle part après l'envoi, réussi OU échoué : ni dans le DOM (valeurs de champs comprises), ni dans les
 * stockages, le cache TanStack (requêtes ET mutations), la console, l'URL, l'historique, les messages d'erreur,
 * ni dans un brouillon. La sentinelle est clairement factice (jamais une forme réaliste de clé de fournisseur).
 */
const consoleSpies = () =>
  (["log", "info", "warn", "error", "debug", "trace"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => undefined),
  );
let spies: ReturnType<typeof consoleSpies>;

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  localStorage.clear();
  sessionStorage.clear();
  serveAiSettings("owner");
  spies = consoleSpies();
});
afterEach(() => vi.restoreAllMocks());

/** Un texte d'issue de la fiche (succès, refus, quota, coffre, illisible, réservé, échec réseau). */
const ANY_OUTCOME =
  /Clé enregistrée|Impossible d'enregistrer|refusée par le fournisseur|Cette clé n'est pas valide|Trop de vérifications|coffre des clés|Illisible|réservée aux propriétaires|Une erreur est survenue/;
const hasSecret = (text: string) => SECRET_FRAGMENTS.some((fragment) => text.includes(fragment));
const dump = (value: unknown) => inspect(value, { depth: 12, maxStringLength: 100_000 });

/** Cache TanStack entier : requêtes (clés, données, erreurs) et mutations (clés, variables, données, erreurs). */
function cacheDump(
  client: ReturnType<typeof import("./support/ai-settings.tsx").renderAiSettings>["client"],
) {
  return dump({
    queries: client
      .getQueryCache()
      .getAll()
      .map((q) => [q.queryKey, q.state.data, q.state.error]),
    mutations: client
      .getMutationCache()
      .getAll()
      .map((m) => [
        m.options.mutationKey,
        m.state.variables,
        m.state.data,
        m.state.error,
        m.state.context,
      ]),
  });
}

function expectNoSecretAnywhere(client: Parameters<typeof cacheDump>[0]) {
  for (const surface of surfaces()) expect(hasSecret(surface)).toBe(false);
  expect(hasSecret(cacheDump(client))).toBe(false);
  expect(hasSecret(dump(window.history.state))).toBe(false);
  for (const spy of spies) expect(hasSecret(dump(spy.mock.calls))).toBe(false);
}

const hostile = (code: string, data?: unknown) =>
  Object.assign(apiError(code, data), { message: `le fournisseur répond : clé ${SECRET} refusée` });

const OUTCOMES: Array<[string, () => void]> = [
  ["succès", () => undefined],
  [
    "set : réseau coupé",
    () => procedures.llmCredentialSet.mockRejectedValue(new TypeError(`Failed ${SECRET}`)),
  ],
  ["set : 500", () => procedures.llmCredentialSet.mockRejectedValue(hostile("INTERNAL"))],
  [
    "set : 503",
    () => procedures.llmCredentialSet.mockRejectedValue(hostile("ENCRYPTION_UNAVAILABLE")),
  ],
  [
    "set : 422 qui répète la valeur",
    () =>
      procedures.llmCredentialSet.mockRejectedValue(
        hostile("VALIDATION", { field: "apiKey", message: SECRET }),
      ),
  ],
  ["set : 403", () => procedures.llmCredentialSet.mockRejectedValue(hostile("FORBIDDEN"))],
  [
    "verify : clé refusée (auth)",
    () =>
      procedures.llmCredentialVerify.mockRejectedValue(
        hostile("LLM_PROVIDER_ERROR", { reason: "auth" }),
      ),
  ],
  [
    "verify : 429",
    () =>
      procedures.llmCredentialVerify.mockRejectedValue(
        hostile("LLM_RATE_LIMITED", { retryAfterSeconds: 3600 }),
      ),
  ],
  [
    "verify : 503",
    () => procedures.llmCredentialVerify.mockRejectedValue(hostile("ENCRYPTION_UNAVAILABLE")),
  ],
  [
    "verify : 409 illisible",
    () =>
      procedures.llmCredentialVerify.mockRejectedValue(
        hostile("LLM_NOT_CONFIGURED", { reason: "undecryptable" }),
      ),
  ],
  [
    "verify : réseau coupé",
    () => procedures.llmCredentialVerify.mockRejectedValue(new TypeError(SECRET)),
  ],
];

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même écran, un test par comportement
describe("la valeur n'existe plus nulle part après l'envoi, réussi ou échoué", () => {
  it.each(OUTCOMES)("%s", async (_name, arrange) => {
    arrange();
    const { client } = await openAiSettings([]);
    const field = await saveKey();
    // L'issue est affichée (succès, alerte ou erreur de champ) : on attend qu'elle soit rendue.
    await waitFor(() => expect(ANY_OUTCOME.test(document.body.textContent ?? "")).toBe(true));
    await waitFor(() => expect(procedures.llmCredentialSet).toHaveBeenCalledTimes(1));
    // Le champ initial, tant qu'il est dans le document, est vide ; sinon il n'y est plus.
    if (field.isConnected) expect(field.value).toBe("");
    const current = document.querySelector<HTMLInputElement>(`input[type="password"]`);
    if (current) expect(current.value).toBe("");
    expectNoSecretAnywhere(client);
  });

  it("validation locale refusée (clé trop longue) : la valeur est vidée et absente partout", async () => {
    const { client } = await openAiSettings([]);
    fireEvent.change(keyField(), { target: { value: `${SECRET}${"z".repeat(600)}` } });
    await userEvent.click(button(SAVE_VERIFY));
    await screen.findByText("Cette clé n'est pas valide.");
    expect(keyField()).toHaveValue("");
    expectNoSecretAnywhere(client);
  });

  it("remplacement d'une clé existante : mêmes garanties", async () => {
    const { client } = await openAiSettings([credential()]);
    await userEvent.click(button("Remplacer la clé"));
    await saveKey(`${SECRET}-remplacement`);
    await screen.findByText(/Clé enregistrée et vérifiée/);
    expectNoSecretAnywhere(client);
    expect(procedures.llmCredentialSet.mock.calls[0]?.[0]).toMatchObject({
      apiKey: `${SECRET}-remplacement`,
    });
  });

  it("pendant l'envoi (réponse en attente) : la clé ne figure ni dans le DOM, ni dans le cache de requêtes", async () => {
    procedures.llmCredentialSet.mockReturnValue(new Promise(() => undefined));
    const { client } = await openAiSettings([]);
    await saveKey();
    await screen.findByRole("button", { name: "Enregistrement et vérification…" });
    for (const surface of surfaces()) expect(hasSecret(surface)).toBe(false);
    expect(
      hasSecret(
        dump(
          client
            .getQueryCache()
            .getAll()
            .map((q) => [q.queryKey, q.state.data]),
        ),
      ),
    ).toBe(false);
  });

  it("aucun brouillon : aucune clé de stockage n'est créée par la page, quelle que soit l'issue", async () => {
    procedures.llmCredentialSet.mockRejectedValue(new TypeError("Failed to fetch"));
    await openAiSettings([]);
    await saveKey();
    await screen.findByRole("alert");
    expect(Object.keys(localStorage)).toEqual([]);
    expect(Object.keys(sessionStorage)).toEqual([]);
  });

  it("la saisie en cours n'est jamais écrite non plus (pendant la frappe, avant l'envoi)", async () => {
    const { client } = await openAiSettings([]);
    await typeKey();
    expect(Object.keys(localStorage)).toEqual([]);
    expect(Object.keys(sessionStorage)).toEqual([]);
    expect(hasSecret(cacheDump(client))).toBe(false);
    expect(hasSecret(window.location.href)).toBe(false);
  });
});

describe("la valeur est vidée AVANT tout rendu d'issue (finally)", () => {
  it.each([
    ["succès", () => undefined],
    [
      "échec réseau de set",
      () => procedures.llmCredentialSet.mockRejectedValue(new TypeError("Failed to fetch")),
    ],
    [
      "refus de verify",
      () =>
        procedures.llmCredentialVerify.mockRejectedValue(
          apiError("LLM_PROVIDER_ERROR", { reason: "auth" }),
        ),
    ],
  ])(
    "%s : aucune mutation du DOM n'affiche une issue pendant que le champ contient la clé",
    async (_n, arrange) => {
      arrange();
      await openAiSettings([]);
      const field = keyField();
      const violations: string[] = [];
      const issue =
        /Clé enregistrée|Impossible d'enregistrer|refusée par le fournisseur|Cette clé n'est pas valide|Trop de/;
      const observer = new MutationObserver(() => {
        const text = document.body.textContent ?? "";
        if (issue.test(text) && field.isConnected && field.value !== "")
          violations.push(text.match(issue)?.[0] ?? "");
      });
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      });
      await saveKey();
      await waitFor(() => expect(issue.test(document.body.textContent ?? "")).toBe(true));
      observer.disconnect();
      expect(violations).toEqual([]);
    },
  );
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même écran, un test par comportement
describe("le champ de la clé (§4.2)", () => {
  it("type=password, name neutre, autocomplete=off, maxLength=512, attributs anti-gestionnaire de mots de passe", async () => {
    await openAiSettings([]);
    const field = keyField();
    expect(field.tagName).toBe("INPUT");
    expect(field).toHaveAttribute("type", "password");
    expect(field).toHaveAttribute("name", "llm-secret");
    expect(field).toHaveAttribute("autocomplete", "off");
    expect(field).toHaveAttribute("autocapitalize", "off");
    expect(field).toHaveAttribute("autocorrect", "off");
    expect(field).toHaveAttribute("spellcheck", "false");
    expect(field).toHaveAttribute("maxlength", "512");
    expect(field).toHaveAttribute("data-1p-ignore");
    expect(field).toHaveAttribute("data-lpignore", "true");
    expect(field.getAttribute("autocomplete")).not.toBe("new-password");
  });

  it("aucune valeur initiale, étiquette visible « Clé API Anthropic »", async () => {
    await openAiSettings([]);
    expect(keyField()).toHaveValue("");
    expect(keyField()).not.toHaveAttribute("value");
    expect(screen.getByText(KEY_FIELD, { selector: "label" })).toBeVisible();
  });

  it("jamais de masque de fin de clé ni de valeur par défaut, même quand une clé existe (remplacement)", async () => {
    await openAiSettings([credential({ defaultModel: "claude-x" })]);
    await userEvent.click(button("Remplacer la clé"));
    expect(keyField()).toHaveValue("");
    expect(keyField()).toHaveAttribute("type", "password");
    expect(document.body.textContent).not.toMatch(/•|\*{4}/);
  });

  it("formulaire method=post sans action : la soumission est interceptée (preventDefault), la clé ne peut pas partir dans l'URL", async () => {
    await openAiSettings([]);
    const form = keyField().closest("form") as HTMLFormElement;
    expect(form).not.toBeNull();
    expect(form.getAttribute("method")?.toLowerCase()).toBe("post");
    expect(form.hasAttribute("action")).toBe(false);
    await typeKey();
    const notPrevented = fireEvent.submit(form);
    expect(notPrevented).toBe(false);
    await waitFor(() => expect(procedures.llmCredentialSet).toHaveBeenCalled());
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
    expect(hasSecret(window.location.href)).toBe(false);
  });

  it("non contrôlé : changer la valeur sans événement React ne la fait pas écraser au rendu suivant", async () => {
    await openAiSettings([]);
    keyField().value = SECRET;
    // Un re-rendu quelconque de la page (ouverture de « Avancé ») ne doit pas réécrire le champ.
    await userEvent.click(screen.getByRole("button", { name: "Avancé" }));
    expect(keyField().value).toBe(SECRET);
    await userEvent.click(button(SAVE_VERIFY));
    await waitFor(() => expect(procedures.llmCredentialSet).toHaveBeenCalledTimes(1));
    expect(procedures.llmCredentialSet.mock.calls[0]?.[0]).toMatchObject({ apiKey: SECRET });
  });
});
