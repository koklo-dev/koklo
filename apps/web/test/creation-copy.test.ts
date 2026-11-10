import type { CreationErrorCode } from "@koklo/contract";
import { describe, expect, it } from "vitest";
import {
  ASK_ADMIN,
  type CreationAction,
  describeCreationFailure,
  INVITATION_FAILED_TEXT,
} from "../src/lib/creation-copy.ts";

const view = (code: CreationErrorCode, extra: object = {}, canAct = true) =>
  describeCreationFailure({ code, ...extra }, canAct);

/** Un cas par code d'échec de S-projects v7 §4.2 : phrase exacte et actions proposées (owner/admin). */
const CASES: [CreationErrorCode, object, string, CreationAction[]][] = [
  [
    "no_account",
    {},
    "Aucun compte GitHub n'est relié. Le dépôt de spec attendra que vous installiez l'application.",
    ["relink", "retry"],
  ],
  [
    "name_taken",
    { repoName: "atelier-spec", ownerLogin: "acme-corp" },
    "Le nom « atelier-spec » est déjà pris sur acme-corp.",
    ["rename"],
  ],
  [
    "user_token_required",
    {},
    "Koklo a besoin de votre autorisation GitHub pour créer ce dépôt.",
    ["authorize"],
  ],
  ["auth_expired_user", {}, "L'autorisation GitHub a expiré.", ["reauthorize"]],
  [
    "auth_expired_installation",
    {},
    "L'accès de Koklo à ce compte GitHub a expiré. Réinstallez l'application depuis la page GitHub.",
    ["openGithub", "retry"],
  ],
  [
    "resource_not_accessible",
    { ownerLogin: "acme-corp" },
    "GitHub refuse la création d'un dépôt sur acme-corp. Un propriétaire du compte doit accorder ce droit à l'application.",
    ["retry"],
  ],
  [
    "provider_unavailable",
    {},
    "GitHub ne répond pas. Votre projet est enregistré ; réessayez plus tard.",
    ["retry"],
  ],
  [
    "rate_limited",
    { retryAfterMs: 12_300 },
    "GitHub limite temporairement les demandes. Réessayez dans environ 13 secondes.",
    ["retry"],
  ],
  [
    "account_unavailable",
    {},
    "Ce compte GitHub n'est plus disponible. Choisissez-en un autre.",
    ["pickAccount"],
  ],
  ["invalid_name", { repoName: "mauvais nom" }, "Le nom du dépôt n'est pas accepté.", ["rename"]],
  [
    "forbidden",
    {},
    "Vous n'avez plus le droit de créer un dépôt. Demandez à un propriétaire ou à un administrateur.",
    [],
  ],
  ["unknown", {}, "Le dépôt de spec n'a pas pu être créé. Une erreur est survenue.", ["retry"]],
];

describe("describeCreationFailure", () => {
  it.each(CASES)("%s : phrase et actions", (code, extra, text, actions) => {
    const result = view(code, extra);
    expect(result.text).toBe(text);
    expect(result.actions).toEqual(actions);
    expect(result.askAdmin).toBe(false);
  });

  it("rate_limited : une seconde au singulier, un instant sans délai", () => {
    expect(view("rate_limited", { retryAfterMs: 400 }).text).toMatch(/environ 1 seconde\.$/);
    expect(view("rate_limited").text).toMatch(/dans un instant\.$/);
  });

  it("name_taken sans nom ni compte connus : phrase sans valeur inventée", () => {
    expect(view("name_taken").text).toBe("Le nom du dépôt est déjà pris sur ce compte GitHub.");
  });

  it("invalid_name : message du nom sous le champ", () => {
    expect(view("invalid_name").fieldError).toMatch(/lettres, chiffres/);
  });

  it("sans droit d'agir : aucune action, « Demandez à un administrateur » (sauf forbidden)", () => {
    for (const [code, extra] of CASES) {
      const result = view(code, extra, false);
      expect(result.actions).toEqual([]);
      expect(result.askAdmin).toBe(code !== "forbidden");
    }
    expect(ASK_ADMIN).toBe("Demandez à un propriétaire ou à un administrateur.");
  });

  it("jamais de vocabulaire technique dans les phrases", () => {
    for (const [code, extra] of CASES) {
      expect(view(code, extra).text).not.toMatch(/jeton|token|oauth|repository/i);
    }
    expect(INVITATION_FAILED_TEXT).toBe(
      "L'invitation n'a pas pu être envoyée. Invitez le client depuis Réglages > Membres.",
    );
  });
});
