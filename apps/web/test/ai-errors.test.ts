import { describe, expect, it } from "vitest";
import { describeAiError, formatRetry } from "../src/lib/ai-errors.ts";
import { apiError } from "./support/web-mocks.ts";

/**
 * TK-59 / 59a, table des erreurs `LLM_*` (S-framing §4.5 à §4.9) : un cas par code et par raison, jamais le
 * message du fournisseur, jamais l'écho du texte saisi.
 */
const NOT_CONFIGURED = "L'IA n'est pas encore configurée pour votre organisation.";
const ASK_ADMIN = "Demandez à un administrateur de l'organisation d'ajouter la clé.";

describe("describeAiError : IA non configurée (4.5)", () => {
  it.each([
    ["missing", "Aucune clé n'a été enregistrée."],
    ["invalidated", "La clé enregistrée a été refusée par le fournisseur et a été désactivée."],
    ["undecryptable", "La clé enregistrée est illisible : il faut la saisir à nouveau."],
  ])("LLM_NOT_CONFIGURED %s", (reason, detail) => {
    expect(describeAiError(apiError("LLM_NOT_CONFIGURED", { reason }))).toMatchObject({
      kind: "not_configured",
      message: NOT_CONFIGURED,
      detail,
      action: ASK_ADMIN,
      icon: "lock",
      retryable: false,
    });
  });

  it("LLM_PROVIDER_ERROR auth : même alerte, clé désactivée jusqu'au remplacement", () => {
    expect(describeAiError(apiError("LLM_PROVIDER_ERROR", { reason: "auth" }))).toMatchObject({
      kind: "not_configured",
      message: NOT_CONFIGURED,
      detail:
        "Le fournisseur a refusé la clé de l'organisation. Elle est désactivée jusqu'à ce qu'un administrateur la remplace.",
      action: ASK_ADMIN,
      icon: "lock",
    });
  });
});

describe("describeAiError : limite atteinte (4.6)", () => {
  it("LLM_RATE_LIMITED : icône schedule, secondes à attendre, réessai possible", () => {
    expect(describeAiError(apiError("LLM_RATE_LIMITED", { retryAfterSeconds: 42 }))).toMatchObject({
      kind: "rate_limited",
      message: "Trop de demandes pour le moment.",
      icon: "schedule",
      retryAfterSeconds: 42,
    });
  });

  it("quota du fournisseur", () => {
    expect(describeAiError(apiError("LLM_PROVIDER_ERROR", { reason: "quota" }))).toMatchObject({
      kind: "provider",
      message: "Le crédit du compte du fournisseur est épuisé : à vérifier par un administrateur.",
      icon: "warning",
    });
  });

  it.each([
    [1, "1 s"],
    [42, "42 s"],
    [60, "60 s"],
    [61, "environ 2 min"],
    [120, "environ 2 min"],
    [150, "environ 3 min"],
  ])("formatRetry(%i) = %s", (seconds, text) => {
    expect(formatRetry(seconds)).toBe(text);
  });
});

describe("describeAiError : erreurs du fournisseur (4.7)", () => {
  it.each([
    ["timeout", "Le fournisseur n'a pas répondu à temps. Réessayez.", true],
    ["unavailable", "Le service d'IA est momentanément indisponible.", true],
    ["context_too_long", "Le texte est trop long pour le modèle : raccourcissez-le.", false],
    ["refused", "Le modèle a refusé de traiter ce texte. Reformulez.", false],
    [
      "model_not_found",
      "Le modèle configuré n'existe pas : à corriger par un administrateur.",
      false,
    ],
    [
      "budget",
      "Cette demande dépasserait le plafond de coût autorisé. Raccourcissez le texte.",
      false,
    ],
    ["aborted", "La demande a été annulée.", true],
  ])("LLM_PROVIDER_ERROR %s", (reason, message, retryable) => {
    expect(describeAiError(apiError("LLM_PROVIDER_ERROR", { reason }))).toMatchObject({
      kind: "provider",
      message,
      icon: "warning",
      retryable,
    });
  });

  it("une raison inconnue n'affiche jamais la valeur brute", () => {
    const view = describeAiError(apiError("LLM_PROVIDER_ERROR", { reason: "nouvelle_raison" }));
    expect(JSON.stringify(view)).not.toContain("nouvelle_raison");
    expect(view.kind).toBe("provider");
  });

  it("le message de l'erreur (potentiellement celui du fournisseur) n'est jamais repris", () => {
    const error = Object.assign(new Error("sk-ant-SECRET invalid x-api-key"), {
      code: "LLM_PROVIDER_ERROR",
      data: { reason: "unavailable" },
    });
    expect(JSON.stringify(describeAiError(error))).not.toMatch(/sk-ant|SECRET|x-api-key/);
  });
});

describe("describeAiError : sortie invalide, collision, autres", () => {
  it("LLM_OUTPUT_INVALID (4.8) : aucun contenu de la sortie rejetée", () => {
    expect(describeAiError(apiError("LLM_OUTPUT_INVALID"))).toMatchObject({
      kind: "output_invalid",
      message:
        "Le modèle a renvoyé une réponse inutilisable (par exemple un lien ou du code). Rien n'a été enregistré. Réessayez ou reformulez.",
      retryable: true,
    });
  });

  it("PROMPT_REJECTED rang 1 (4.9) : ni citation ni position, champ saisi concerné", () => {
    const view = describeAiError(apiError("PROMPT_REJECTED", { rank: 1 }));
    expect(view).toMatchObject({
      kind: "prompt_rejected",
      field: "input",
      message:
        "Votre texte contient une séquence réservée qui empêche l'envoi. Modifiez-le (par exemple retirez les blocs de code ou les lignes de balises) puis réessayez.",
    });
    expect(JSON.stringify(view)).not.toMatch(/rank|"1"|position/i);
  });

  it("PROMPT_REJECTED rang 2 : fonctionnalité existante, non modifiable ici, sans détail", () => {
    expect(describeAiError(apiError("PROMPT_REJECTED", { rank: 2 }))).toMatchObject({
      kind: "prompt_rejected",
      field: "existing",
      message:
        "Une fonctionnalité existante du projet contient une séquence réservée ; contactez un administrateur.",
    });
  });

  it("ENCRYPTION_UNAVAILABLE (503)", () => {
    expect(describeAiError(apiError("ENCRYPTION_UNAVAILABLE"))).toMatchObject({
      kind: "encryption",
      message: "Le coffre des clés n'est pas disponible. Réessayez plus tard.",
      retryable: true,
    });
  });

  it.each([
    ["NOT_FOUND", "not_found"],
    ["FORBIDDEN", "forbidden"],
    ["UNAUTHORIZED", "unauthorized"],
    ["INTERNAL", "generic"],
  ])("%s -> %s", (code, kind) => {
    expect(describeAiError(apiError(code)).kind).toBe(kind);
  });

  it("une erreur réseau (sans code) est générique et réessayable", () => {
    expect(describeAiError(new TypeError("fetch failed"))).toMatchObject({
      kind: "generic",
      retryable: true,
    });
  });
});
