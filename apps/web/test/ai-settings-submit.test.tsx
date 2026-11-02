import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  alertEl,
  argsOf,
  button,
  credential,
  GENERIC_SAVE_FAILURE,
  KEY_FIELD,
  keyField,
  openAiSettings,
  queryButton,
  REMOVE,
  SAVE_VERIFY,
  SECRET,
  saveKey,
  serveAiSettings,
  statusText,
  typeKey,
  VERIFY_AGAIN,
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
 * Réglages de l'IA, parcours « Enregistrer et vérifier » (S-ai-settings §2, §4.6 à §4.8, §5) : `set` puis `verify`
 * (un clic = deux appels, dans cet ordre), un message par issue, jamais le message du fournisseur ni la clé.
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  localStorage.clear();
  serveAiSettings("owner");
});
afterEach(() => vi.useRealTimers());

/** Après un `set` réussi, la liste rechargée montre la clé enregistrée. */
const savedAfterSet = () =>
  procedures.llmCredentialSet.mockImplementation(async () => {
    procedures.llmCredentialList.mockResolvedValue({ items: [credential()] });
    return credential();
  });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même écran, un test par comportement
describe("parcours nominal", () => {
  it("set appelé UNE fois avec la clé exacte, puis verify UNE fois, dans cet ordre", async () => {
    const order: string[] = [];
    procedures.llmCredentialSet.mockImplementation(async () => {
      order.push("set");
      return credential();
    });
    procedures.llmCredentialVerify.mockImplementation(async () => {
      order.push("verify");
      return { ok: true, model: "claude-test-1", checkedAt: "2026-11-02T10:00:00.000Z" };
    });
    await openAiSettings([]);
    await saveKey();
    await screen.findByText(/Clé enregistrée et vérifiée/);
    expect(order).toEqual(["set", "verify"]);
    expect(argsOf(procedures.llmCredentialSet)).toEqual([
      { provider: "anthropic", apiKey: SECRET },
    ]);
    expect(argsOf(procedures.llmCredentialVerify)).toEqual([{ provider: "anthropic" }]);
  });

  it("le modèle par défaut (Avancé) part dans set, rogné ; vide = absent de l'entrée", async () => {
    await openAiSettings([]);
    await userEvent.click(screen.getByRole("button", { name: "Avancé" }));
    await userEvent.type(
      screen.getByLabelText("Modèle par défaut (facultatif)"),
      "  claude-custom  ",
    );
    await saveKey();
    await screen.findByText(/Clé enregistrée et vérifiée/);
    expect(argsOf(procedures.llmCredentialSet)).toEqual([
      { provider: "anthropic", apiKey: SECRET, defaultModel: "claude-custom" },
    ]);
  });

  it("succès : « Clé enregistrée et vérifiée (modèle claude-test-1). » dans la région d'état, list rechargée", async () => {
    savedAfterSet();
    await openAiSettings([]);
    const before = procedures.llmCredentialList.mock.calls.length;
    await saveKey();
    expect(
      await screen.findByText(/Clé enregistrée et vérifiée \(modèle claude-test-1\)\./),
    ).toBeInTheDocument();
    expect(statusText()).toMatch(/Clé enregistrée et vérifiée \(modèle claude-test-1\)\./);
    expect(await screen.findByText("Configurée", { exact: true })).toBeInTheDocument();
    expect(
      screen.getByText(/Vérifiée à l'instant avec le modèle claude-test-1/),
    ).toBeInTheDocument();
    expect(procedures.llmCredentialList.mock.calls.length).toBeGreaterThan(before);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("pendant l'envoi : bouton désactivé aria-busy « Enregistrement et vérification… », région d'état, autres boutons désactivés", async () => {
    procedures.llmCredentialSet.mockReturnValue(new Promise(() => undefined));
    await openAiSettings([]);
    await saveKey();
    const busy = await screen.findByRole("button", { name: "Enregistrement et vérification…" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(statusText()).toContain(
      "Enregistrement de la clé puis vérification. Cela peut prendre quelques secondes.",
    );
  });

  it("libellé « Vérification… » une fois set terminé", async () => {
    procedures.llmCredentialVerify.mockReturnValue(new Promise(() => undefined));
    await openAiSettings([]);
    await saveKey();
    expect(await screen.findByRole("button", { name: "Vérification…" })).toBeDisabled();
  });

  it("double clic : un seul set (drapeau d'envoi immédiat)", async () => {
    procedures.llmCredentialSet.mockReturnValue(new Promise(() => undefined));
    await openAiSettings([]);
    await typeKey();
    await userEvent.dblClick(button(SAVE_VERIFY));
    expect(procedures.llmCredentialSet).toHaveBeenCalledTimes(1);
  });

  it("Entrée dans le champ envoie une seule fois, comme le bouton", async () => {
    await openAiSettings([]);
    await typeKey();
    await userEvent.keyboard("{Enter}");
    await screen.findByText(/Clé enregistrée et vérifiée/);
    expect(procedures.llmCredentialSet).toHaveBeenCalledTimes(1);
  });

  it("remplacement : même parcours (set puis verify), le champ est vide à l'ouverture", async () => {
    await openAiSettings([credential()]);
    await userEvent.click(button("Remplacer la clé"));
    expect(keyField()).toHaveValue("");
    await saveKey();
    await screen.findByText(/Clé enregistrée et vérifiée/);
    expect(argsOf(procedures.llmCredentialSet)).toEqual([
      { provider: "anthropic", apiKey: SECRET },
    ]);
    expect(procedures.llmCredentialVerify).toHaveBeenCalledTimes(1);
  });
});

describe("validation locale (§4.2) : aucun appel, aucun écho de la valeur ni de sa longueur", () => {
  const field = () => keyField();

  it("clé vide : « Saisissez la clé. », focus dans le champ, aria-invalid et aria-describedby", async () => {
    await openAiSettings([]);
    await userEvent.click(button(SAVE_VERIFY));
    const error = await screen.findByText("Saisissez la clé.");
    expect(field()).toHaveFocus();
    expect(field()).toHaveAttribute("aria-invalid", "true");
    expect((field().getAttribute("aria-describedby") ?? "").split(" ")).toContain(error.id);
    expect(procedures.llmCredentialSet).not.toHaveBeenCalled();
  });

  it("espaces seuls : même refus, champ vidé", async () => {
    await openAiSettings([]);
    await typeKey("     ");
    await userEvent.click(button(SAVE_VERIFY));
    expect(await screen.findByText("Saisissez la clé.")).toBeInTheDocument();
    expect(field()).toHaveValue("");
    expect(procedures.llmCredentialSet).not.toHaveBeenCalled();
  });

  it("plus de 512 caractères : « Cette clé n'est pas valide. », sans longueur, champ vidé", async () => {
    await openAiSettings([]);
    fireEvent.change(field(), { target: { value: `${SECRET}${"z".repeat(600)}` } });
    await userEvent.click(button(SAVE_VERIFY));
    expect(await screen.findByText("Cette clé n'est pas valide.")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/512|6\d\d caract/);
    expect(document.body.textContent).not.toContain(SECRET.slice(0, 16));
    expect(field()).toHaveValue("");
    expect(procedures.llmCredentialSet).not.toHaveBeenCalled();
  });

  it("caractère de contrôle : même message générique, aucun appel", async () => {
    await openAiSettings([]);
    fireEvent.change(field(), { target: { value: `${SECRET}\u0001` } });
    await userEvent.click(button(SAVE_VERIFY));
    expect(await screen.findByText("Cette clé n'est pas valide.")).toBeInTheDocument();
    expect(procedures.llmCredentialSet).not.toHaveBeenCalled();
  });

  it("modèle par défaut invalide (« / » ou « .. ») : refus local, aucun appel", async () => {
    await openAiSettings([]);
    await userEvent.click(screen.getByRole("button", { name: "Avancé" }));
    await userEvent.type(screen.getByLabelText("Modèle par défaut (facultatif)"), "a/b");
    await typeKey();
    await userEvent.click(button(SAVE_VERIFY));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(procedures.llmCredentialSet).not.toHaveBeenCalled();
  });
});

describe("clé enregistrée mais refusée (§4.7)", () => {
  it("LLM_PROVIDER_ERROR auth : titre dédié, texte, formulaire de remplacement ouvert, Retirer disponible", async () => {
    savedAfterSet();
    procedures.llmCredentialVerify.mockRejectedValue(
      apiError("LLM_PROVIDER_ERROR", { reason: "auth" }),
    );
    await openAiSettings([]);
    await saveKey();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Clé enregistrée, mais refusée par le fournisseur");
    expect(alert).toHaveTextContent(
      "Vérifiez que la clé est correcte et active, puis saisissez-la de nouveau. Vous pouvez aussi la retirer.",
    );
    expect(await screen.findByLabelText(KEY_FIELD)).toHaveValue("");
    expect(button(REMOVE)).toBeEnabled();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});

describe("autres raisons du fournisseur : la clé reste enregistrée, « Vérifier à nouveau », formulaire fermé", () => {
  it.each([
    [
      "quota",
      "Le crédit du compte du fournisseur est épuisé : à vérifier sur votre compte Anthropic.",
    ],
    ["timeout", "Le fournisseur n'a pas répondu à temps. Réessayez."],
    ["unavailable", "Le service d'IA est momentanément indisponible."],
    [
      "model_not_found",
      "Le modèle indiqué n'existe pas. Corrigez-le dans « Avancé » ou videz le champ.",
    ],
    ["aborted", "La vérification a échoué. Réessayez."],
    ["budget", "La vérification a échoué. Réessayez."],
    ["context_too_long", "La vérification a échoué. Réessayez."],
    ["refused", "La vérification a échoué. Réessayez."],
  ])("raison %s", async (reason, text) => {
    savedAfterSet();
    procedures.llmCredentialVerify.mockRejectedValue(
      Object.assign(apiError("LLM_PROVIDER_ERROR", { reason }), {
        message: "message brut du fournisseur : sk-brut",
      }),
    );
    await openAiSettings([]);
    await saveKey();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(text);
    expect(alert.textContent).not.toMatch(/message brut|sk-brut/);
    expect(await screen.findByRole("button", { name: VERIFY_AGAIN })).toBeEnabled();
    expect(screen.getByText(/5 par heure/)).toBeInTheDocument();
    expect(screen.queryByLabelText(KEY_FIELD)).not.toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("après un échec de verify seul, la clé n'est pas à ressaisir : « Vérifier à nouveau » rappelle verify, jamais set", async () => {
    savedAfterSet();
    procedures.llmCredentialVerify.mockRejectedValueOnce(
      apiError("LLM_PROVIDER_ERROR", { reason: "timeout" }),
    );
    await openAiSettings([]);
    await saveKey();
    await screen.findByRole("alert");
    await userEvent.click(await screen.findByRole("button", { name: VERIFY_AGAIN }));
    await screen.findByText(/Vérifiée à l'instant/);
    expect(procedures.llmCredentialSet).toHaveBeenCalledTimes(1);
    expect(procedures.llmCredentialVerify).toHaveBeenCalledTimes(2);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même écran, un test par comportement
describe("quota de vérification (429) : la clé est enregistrée (§4.7)", () => {
  async function limited(seconds: number) {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    savedAfterSet();
    procedures.llmCredentialVerify.mockRejectedValue(
      apiError("LLM_RATE_LIMITED", { retryAfterSeconds: seconds }),
    );
    await openAiSettings([]);
    await saveKey();
    return screen.findByRole("alert");
  }
  const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

  it("texte avec secondes, mention que la clé est enregistrée, « Vérifier à nouveau » désactivé", async () => {
    const alert = await limited(30);
    expect(alert).toHaveTextContent("Trop de vérifications pour le moment. Réessayez dans 30 s.");
    expect(alert).toHaveTextContent(
      "Votre clé a bien été enregistrée ; seule la vérification est reportée.",
    );
    expect(alert.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    expect(await screen.findByRole("button", { name: VERIFY_AGAIN })).toBeDisabled();
    expect(procedures.llmCredentialSet).toHaveBeenCalledTimes(1);
  });

  it("le chiffre visible baisse chaque seconde sans être annoncé ; palier de 15 s annoncé ; échéance annoncée", async () => {
    const alert = await limited(30);
    await tick(1000);
    expect(alert).toHaveTextContent("Réessayez dans 29 s.");
    expect(statusText()).not.toMatch(/29 s/);
    await tick(14_000);
    expect(statusText()).toMatch(/Réessayez dans 15 s/);
    await tick(15_000);
    expect(statusText()).toContain("Vous pouvez réessayer.");
  });

  it("à l'échéance « Vérifier à nouveau » est réactivé", async () => {
    await limited(5);
    expect(await screen.findByRole("button", { name: VERIFY_AGAIN })).toBeDisabled();
    await tick(5000);
    await waitFor(() => expect(screen.getByRole("button", { name: VERIFY_AGAIN })).toBeEnabled());
  });

  it("au-delà de 60 s : « environ N min »", async () => {
    const alert = await limited(120);
    expect(alert).toHaveTextContent("environ 2 min");
  });

  it("en remplacement, « Enregistrer et vérifier » est désactivé jusqu'à l'échéance", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    procedures.llmCredentialVerify.mockRejectedValue(
      apiError("LLM_RATE_LIMITED", { retryAfterSeconds: 30 }),
    );
    await openAiSettings([credential()]);
    await userEvent.click(button("Remplacer la clé"));
    await saveKey();
    await screen.findByRole("alert");
    const save = queryButton(SAVE_VERIFY);
    if (save) expect(save).toBeDisabled();
    await tick(30_000);
    await waitFor(() => expect(screen.getByText(/Vous pouvez réessayer/)).toBeInTheDocument());
  });
});

describe("coffre indisponible et validation serveur", () => {
  it("503 de set : message dédié, rien d'enregistré, verify jamais appelé, champ vidé", async () => {
    procedures.llmCredentialSet.mockRejectedValue(apiError("ENCRYPTION_UNAVAILABLE"));
    await openAiSettings([]);
    const field = await saveKey();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le coffre des clés n'est pas disponible. Réessayez plus tard.",
    );
    expect(procedures.llmCredentialVerify).not.toHaveBeenCalled();
    expect(field).toHaveValue("");
  });

  it("503 de verify : même message, la clé reste enregistrée (Vérifier à nouveau)", async () => {
    savedAfterSet();
    procedures.llmCredentialVerify.mockRejectedValue(apiError("ENCRYPTION_UNAVAILABLE"));
    await openAiSettings([]);
    await saveKey();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le coffre des clés n'est pas disponible. Réessayez plus tard.",
    );
    expect(await screen.findByRole("button", { name: VERIFY_AGAIN })).toBeEnabled();
  });

  it("422 de set : message générique du champ, sans écho, verify jamais appelé", async () => {
    procedures.llmCredentialSet.mockRejectedValue(
      Object.assign(apiError("VALIDATION", { field: "apiKey", message: `invalide ${SECRET}` }), {
        message: `invalide ${SECRET}`,
      }),
    );
    await openAiSettings([]);
    await saveKey();
    expect(await screen.findByText("Cette clé n'est pas valide.")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(SECRET.slice(0, 16));
    expect(keyField()).toHaveValue("");
    expect(procedures.llmCredentialVerify).not.toHaveBeenCalled();
  });
});

describe("échec réseau ou 500 de set : ressaisie obligatoire (§4.8)", () => {
  it.each([
    ["réseau coupé", new TypeError("Failed to fetch")],
    ["500", apiError("INTERNAL")],
  ])(
    "%s : message dédié, liste rechargée, aucun « Réessayer », verify jamais appelé",
    async (_n, error) => {
      procedures.llmCredentialSet.mockRejectedValue(error);
      await openAiSettings([]);
      const before = procedures.llmCredentialList.mock.calls.length;
      const field = await saveKey();
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(GENERIC_SAVE_FAILURE);
      expect(within(alert).queryByRole("button")).toBeNull();
      expect(screen.queryByRole("button", { name: /Réessayer/ })).not.toBeInTheDocument();
      expect(field).toHaveValue("");
      expect(procedures.llmCredentialVerify).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(procedures.llmCredentialList.mock.calls.length).toBeGreaterThan(before),
      );
    },
  );

  it("l'envoi n'est jamais rejoué : un seul appel set, même après l'échec", async () => {
    procedures.llmCredentialSet.mockRejectedValue(new TypeError("Failed to fetch"));
    await openAiSettings([]);
    await saveKey();
    await screen.findByRole("alert");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(procedures.llmCredentialSet).toHaveBeenCalledTimes(1);
  });

  it("ressaisir et renvoyer fonctionne : nouvel appel avec la nouvelle valeur", async () => {
    procedures.llmCredentialSet.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await openAiSettings([]);
    await saveKey();
    await screen.findByRole("alert");
    await saveKey(`${SECRET}-2`);
    await screen.findByText(/Clé enregistrée et vérifiée/);
    expect(argsOf(procedures.llmCredentialSet)).toEqual([
      { provider: "anthropic", apiKey: SECRET },
      { provider: "anthropic", apiKey: `${SECRET}-2` },
    ]);
  });

  it("une seule alerte à la fois : une nouvelle tentative remplace la précédente", async () => {
    procedures.llmCredentialSet.mockRejectedValue(apiError("ENCRYPTION_UNAVAILABLE"));
    await openAiSettings([]);
    await saveKey();
    await screen.findByRole("alert");
    procedures.llmCredentialSet.mockRejectedValue(new TypeError("Failed to fetch"));
    await saveKey();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(GENERIC_SAVE_FAILURE));
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(alertEl()).not.toHaveTextContent("coffre");
  });
});
