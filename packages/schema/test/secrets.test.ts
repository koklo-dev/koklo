import { describe, expect, it } from "vitest";
import { findSecretPaths, SECRET_REFUSAL_MESSAGE, SECRET_VALUE_CODE } from "../src/index.ts";

/**
 * TK-115 lot A (cas 3, B724) : détecteur de valeurs de secret. Les valeurs sont fabriquées à l'exécution : aucun littéral
 * qu'un analyseur de dépôt prendrait pour un vrai secret.
 */
const x = (n: number, char = "x") => char.repeat(n);
const PEM = `-----BEGIN ${"PRIVATE KEY"}-----\n${x(40, "A")}\n-----END ${"PRIVATE KEY"}-----`;

const SECRETS: readonly (readonly [string, string])[] = [
  ["bloc PEM", PEM],
  ["bloc PEM RSA", `-----BEGIN RSA ${"PRIVATE KEY"}-----`],
  ["clé sk-", `${"sk"}-${x(32)}`],
  ["clé sk- à tirets", `${"sk"}-abc-${x(32)}`],
  ["sk_live_", `${"sk"}_live_${x(24)}`],
  ["sk_test_", `${"sk"}_test_${x(24)}`],
  ["rk_live_", `${"rk"}_live_${x(24)}`],
  ...["p", "o", "u", "s", "r"].map((c) => [`gh${c}_`, `${"gh"}${c}_${x(36)}`] as const),
  ["github_pat_", `${"github"}_pat_${x(40)}`],
  ["glpat-", `${"glpat"}-${x(20)}`],
  ...["b", "a", "p", "r", "s"].map((c) => [`xox${c}-`, `${"xox"}${c}-${x(24, "1")}`] as const),
  ["AKIA", `${"AKIA"}${x(16, "A")}`],
  ["ASIA", `${"ASIA"}${x(16, "B")}`],
  ["AIza", `${"AIza"}${x(35)}`],
  ["SG.", `${"SG"}.${x(22)}.${x(43)}`],
  ["whsec_", `${"whsec"}_${x(32)}`],
  ["xkeysib-", `${"xkeysib"}-${x(64, "a")}`],
  ["JWT", `${"eyJ"}${x(20)}.${"eyJ"}${x(30)}.${x(43)}`],
  ["Bearer", `Authorization: ${"Bearer"} ${x(24)}`],
  ["URL à mot de passe", `${"postgres"}://app:${x(10)}@db.example.test:5432/app`],
  ["URL sans utilisateur", `${"redis"}://:${x(10)}@cache.example.test`],
  ["affectation SECRET", `${"AUTH"}_SECRET=${x(12)}`],
  ["affectation TOKEN citée", `${"GITHUB"}_TOKEN="${x(12)}"`],
  ["affectation PASSWORD", `${"DB"}_PASSWORD = ${x(8)}`],
  ["affectation PASSWD", `${"PASSWD"}=${x(8)}`],
  ["affectation API_KEY", `${"SMS"}_API_KEY=${x(8)}`],
  ["affectation PRIVATE_KEY", `${"PRIVATE"}_KEY=${x(8)}`],
  ["affectation ACCESS_KEY", `${"STORAGE"}_ACCESS_KEY_ID=${x(8)}`],
  ["affectation DSN", `${"SENTRY"}_DSN=${x(8)}`],
  ["mot de passe =", `Le mot de passe = ${x(9)}`],
  ["password =", `password=${x(9)}`],
  ["secret =", `Secret = "${x(9)}"`],
  ["token =", `token = ${x(9)}`],
];

/** Textes de la maquette 14 et tournures voisines : aucun n'est une valeur de secret. */
const HARMLESS: readonly string[] = [
  "DATABASE_URL : connexion",
  "Connexion à la base",
  "AUTH_SECRET",
  "Signature des sessions",
  "SMS_API_KEY",
  "MAIL_API_KEY",
  "SENTRY_DSN",
  "PAYMENT_SECRET_KEY",
  "STORAGE_ACCESS_KEY",
  "Lien magique",
  "Better Auth · lien magique",
  "Lien magique natif (ADR-004), sessions en base, aucun service tiers à payer.",
  "Lien 15 min · session 12 h",
  "Lien de connexion à usage unique (ADR-004).",
  "Mots de passe",
  "Aucun stocké",
  "Secrets dans le coffre de l'hébergeur, jamais dans le dépôt ; dépendances analysées.",
  "Coffre de l'hébergeur",
  "p95 < 300 ms",
  "≈ 0,045 €",
  "≈ 1,5 % + 0,25 €",
  "Next.js 15 · React 19",
  "localhost:3000",
  "reservation.atelier-lumiere.fr",
  "postgres://localhost:5432/app",
  "https://example.test/chemin?x=1",
  "tech/cahier-technique/05-exploitation.md",
  "RPO 24 h · RTO 4 h",
  "Sauvegarde quotidienne chiffrée ; restauration testée chaque trimestre.",
  "jeton · texte(64) · lien d'annulation",
  "task-0123456789abcdefghij0123456789",
  "une tâche task-generate-weekly-report-for-all-salons",
  "Bearer token",
  "En-tête Authorization : Bearer <jeton>",
  ["API_KEY=$", "{SMS_API_KEY}"].join(""),
  "API_KEY=<clé du fournisseur>",
  "PASSWORD=********",
  "AUTH_SECRET=***",
  ["DATABASE_URL=postgres://app:$", "{PASSWORD}@db/app"].join(""),
  "postgres://app:<mot de passe>@db.example.test/app",
  "token = court",
  "sk-court",
  "ghp_exemple",
  "eyJ.eyJ.x",
];

describe("findSecretPaths : motifs trouvés", () => {
  it.each(SECRETS)("%s", (_name, value) => {
    expect(findSecretPaths(value)).toEqual([""]);
    expect(findSecretPaths({ pourquoi: `Voir ${value} ici.` })).toEqual(["/pourquoi"]);
  });
});

describe("findSecretPaths : aucun faux positif", () => {
  it.each(HARMLESS)("%s", (value) => {
    expect(findSecretPaths(value)).toEqual([]);
  });

  it("valeurs non textuelles ignorées", () => {
    for (const value of [null, undefined, 12, true, [], {}]) {
      expect(findSecretPaths(value)).toEqual([]);
    }
  });
});

describe("findSecretPaths : temps borné sur un texte hostile", () => {
  it.each([
    ["mots-clés répétés sans affectation", "TOKEN".repeat(40_000)],
    ["suite de points", "a.".repeat(100_000)],
    ["préfixes répétés", "eyJ.".repeat(50_000)],
  ])("%s : moins d'une seconde", { timeout: 20_000 }, (_name, value) => {
    const from = performance.now();
    expect(findSecretPaths(value)).toEqual([]);
    expect(performance.now() - from).toBeLessThan(1_000);
  });
});

describe("findSecretPaths : pointeurs, jamais la valeur", () => {
  const secret = `${"ghp"}_${x(36)}`;

  it("récursif : un pointeur JSON par chaîne fautive, échappé", () => {
    const value = {
      criteria: [{ values: ["ok", secret] }],
      "a/b~c": secret,
      markdown: "rien",
    };
    expect(findSecretPaths(value)).toEqual(["/criteria/0/values/1", "/a~1b~0c"]);
  });

  it("une clé fautive rend le pointeur de son objet, sans la recopier", () => {
    const paths = findSecretPaths({ entree: { [secret]: { type: "texte" } } });
    expect(paths).toEqual(["/entree"]);
    expect(JSON.stringify(paths)).not.toContain(secret);
  });

  it("le message et le code de refus sont partagés et ne recopient rien", () => {
    expect(SECRET_VALUE_CODE).toBe("SECRET_VALUE");
    expect(SECRET_REFUSAL_MESSAGE).toBe(
      "Une valeur de secret ne peut pas entrer dans la spec : gardez seulement le nom de la variable.",
    );
  });
});
