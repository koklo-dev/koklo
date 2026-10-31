import { describe, expect, it } from "vitest";
import { describeSpecRepoError } from "../src/lib/spec-repo-errors.ts";
import { SPEC_REPO_NAME_ERROR } from "../src/lib/spec-repo-name.ts";
import { apiError } from "./support/web-mocks.ts";

const CTX = { ownerLogin: "acme-corp", repoName: "" };
const TOKEN_TEXT =
  "Pour créer un dépôt sur le compte acme-corp, Koklo a besoin de votre autorisation. Vous serez redirigé vers GitHub, puis ramené ici.";

/** Un texte et une action par ligne du tableau d'erreurs de design/screens/S-projects.md §4.1 (AC-48-21). */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("describeSpecRepoError", () => {
  it("503 PROVIDER_UNAVAILABLE : réessayer", () => {
    expect(describeSpecRepoError(apiError("PROVIDER_UNAVAILABLE"), CTX)).toMatchObject({
      text: "GitHub ne répond pas, ou l'application GitHub n'est pas configurée sur cet environnement. Votre projet est enregistré ; réessayez plus tard.",
      action: "retry",
    });
  });

  it("403 USER_TOKEN_REQUIRED : autoriser, avec le login de l'erreur", () => {
    const view = describeSpecRepoError(
      apiError("USER_TOKEN_REQUIRED", { ownerLogin: "awa-kone" }),
      CTX,
    );
    expect(view.action).toBe("authorize");
    expect(view.text).toBe(TOKEN_TEXT.replace("acme-corp", "awa-kone"));
  });

  it("403 REPO_CREATION_FORBIDDEN missing-user-token : même texte et même action", () => {
    const view = describeSpecRepoError(
      apiError("REPO_CREATION_FORBIDDEN", {
        reason: "missing-user-token",
        ownerLogin: "acme-corp",
        ownerKind: "organization",
      }),
      CTX,
    );
    expect(view).toMatchObject({ text: TOKEN_TEXT, action: "authorize" });
  });

  it("403 REPO_CREATION_FORBIDDEN resource-not-accessible : réessayer après changement de droits", () => {
    expect(
      describeSpecRepoError(
        apiError("REPO_CREATION_FORBIDDEN", {
          reason: "resource-not-accessible",
          ownerLogin: "acme-corp",
          ownerKind: "organization",
        }),
        CTX,
      ),
    ).toMatchObject({
      text: "GitHub refuse la création d'un dépôt sur acme-corp. L'application GitHub n'a pas le droit d'y créer des dépôts : un propriétaire de ce compte doit le lui accorder dans les paramètres GitHub, ou vous pouvez choisir un autre compte.",
      action: "retry",
    });
  });

  it("403 PROVIDER_AUTH_EXPIRED kind user : réautoriser", () => {
    expect(
      describeSpecRepoError(
        apiError("PROVIDER_AUTH_EXPIRED", { kind: "user", refreshable: false }),
        CTX,
      ),
    ).toMatchObject({
      text: "Votre autorisation Koklo sur GitHub a expiré.",
      action: "reauthorize",
    });
  });

  it("403 PROVIDER_AUTH_EXPIRED kind installation : lien vers la page GitHub et réessayer", () => {
    expect(
      describeSpecRepoError(
        apiError("PROVIDER_AUTH_EXPIRED", { kind: "installation", refreshable: false }),
        CTX,
      ),
    ).toMatchObject({
      text: "L'accès de Koklo à ce compte GitHub a expiré. Réinstallez l'application depuis la page GitHub, puis revenez réessayer.",
      action: "retry",
      githubLink: true,
    });
  });

  it.each([
    [1500, "environ 2 secondes"],
    [1000, "environ 1 seconde"],
    [1001, "environ 2 secondes"],
    [30_000, "environ 30 secondes"],
  ])("429 retryAfterMs %i : %s (arrondi au supérieur)", (retryAfterMs, phrase) => {
    const view = describeSpecRepoError(apiError("PROVIDER_RATE_LIMITED", { retryAfterMs }), CTX);
    expect(view.text).toBe(`GitHub limite temporairement les demandes. Réessayez dans ${phrase}.`);
    expect(view.action).toBe("retry");
  });

  it("429 sans retryAfterMs : « dans un instant »", () => {
    expect(describeSpecRepoError(apiError("PROVIDER_RATE_LIMITED", {}), CTX).text).toBe(
      "GitHub limite temporairement les demandes. Réessayez dans un instant.",
    );
  });

  it("409 spec_repo_exists : un succès, pas une erreur", () => {
    expect(
      describeSpecRepoError(apiError("CONFLICT", { reason: "spec_repo_exists" }), CTX),
    ).toMatchObject({
      alreadyExists: true,
      action: "close",
    });
  });

  it("409 repo_name_taken avec un nom saisi : cite le nom, focus, relier un dépôt", () => {
    const view = describeSpecRepoError(apiError("CONFLICT", { reason: "repo_name_taken" }), {
      ownerLogin: "acme-corp",
      repoName: "mon-depot",
    });
    expect(view).toMatchObject({
      text: "Un dépôt nommé « mon-depot » existe déjà sur acme-corp. Il peut venir d'une tentative précédente. Choisissez un autre nom puis réessayez, ou reliez ce dépôt s'il est déjà prêt.",
      action: "retry",
      focus: "repo-name",
      offerLink: true,
    });
  });

  it("409 repo_name_taken, champ vide : le nom par défaut est pris", () => {
    const view = describeSpecRepoError(apiError("CONFLICT", { reason: "repo_name_taken" }), CTX);
    expect(view.text).toBe("Le nom proposé par défaut est déjà pris sur acme-corp.");
    expect(view).toMatchObject({ focus: "repo-name", offerLink: true });
  });

  it("404 NOT_FOUND : compte indisponible, liste à recharger", () => {
    expect(describeSpecRepoError(apiError("NOT_FOUND"), CTX)).toMatchObject({
      text: "Ce compte GitHub n'est plus disponible. Choisissez-en un autre ou relancez la liste.",
      action: "retry",
      reloadAccounts: true,
    });
  });

  it("422 VALIDATION sur name : erreur sous le champ, focus, réessayer", () => {
    expect(
      describeSpecRepoError(apiError("VALIDATION", { field: "name", message: "invalid" }), CTX),
    ).toMatchObject({ fieldError: SPEC_REPO_NAME_ERROR, focus: "repo-name", action: "retry" });
  });

  it("403 FORBIDDEN : fermer seulement", () => {
    expect(describeSpecRepoError(apiError("FORBIDDEN"), CTX)).toMatchObject({
      text: "Vous n'avez plus le droit de créer un dépôt. Le projet est créé : demandez à un propriétaire ou à un administrateur de relier le dépôt.",
      action: "close",
    });
  });

  it.each([
    ["INTERNAL", apiError("INTERNAL")],
    ["erreur réseau", new TypeError("Failed to fetch")],
    ["code inconnu", apiError("TOTALLY_NEW_CODE")],
    ["valeur non-erreur", "boom"],
  ])("autre (%s) : message générique, réessayer", (_label, error) => {
    expect(describeSpecRepoError(error, CTX)).toMatchObject({
      text: "Le dépôt de spec n'a pas pu être créé. Une erreur est survenue. Vérifiez votre connexion puis réessayez. Si le dépôt a pu être créé malgré tout, « Réessayer » le détectera.",
      action: "retry",
    });
  });

  it("n'inclut jamais de valeur brute de l'erreur (message, jeton) dans le texte", () => {
    const secret = "ghu_SECRET_VALUE_123";
    const views = [
      describeSpecRepoError(
        Object.assign(new Error(secret), { code: "INTERNAL", data: { secret } }),
        CTX,
      ),
      describeSpecRepoError(apiError("PROVIDER_UNAVAILABLE", { detail: secret }), CTX),
      describeSpecRepoError(
        apiError("USER_TOKEN_REQUIRED", { ownerLogin: "acme-corp", token: secret }),
        CTX,
      ),
    ];
    for (const view of views) expect(JSON.stringify(view)).not.toContain(secret);
  });

  it("aucun terme technique dans les textes (OAuth, jeton, token, repository, SHA, branche)", () => {
    const errors = [
      apiError("PROVIDER_UNAVAILABLE"),
      apiError("USER_TOKEN_REQUIRED", { ownerLogin: "acme-corp" }),
      apiError("PROVIDER_AUTH_EXPIRED", { kind: "user", refreshable: true }),
      apiError("PROVIDER_AUTH_EXPIRED", { kind: "installation", refreshable: false }),
      apiError("PROVIDER_RATE_LIMITED", {}),
      apiError("CONFLICT", { reason: "repo_name_taken" }),
      apiError("NOT_FOUND"),
      apiError("FORBIDDEN"),
      apiError("INTERNAL"),
    ];
    for (const error of errors) {
      expect(describeSpecRepoError(error, CTX).text).not.toMatch(
        /oauth|jeton|token|repository|\bsha\b|branche/i,
      );
    }
  });
});
