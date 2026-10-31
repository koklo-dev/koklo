import { describe, expect, it } from "vitest";
import { parsePullRequestRef } from "../src/index.ts";

/**
 * TK-46b (H1) : `Ticket.pullRequest` est un texte libre ; le seul format reconnu est l'URL
 * `https://github.com/<owner>/<repo>/pull/<n>`. Analyse stricte et ancrée : tout autre texte rend
 * `undefined` (jamais d'exception), pour que la réconciliation ne lise jamais un dépôt forgé.
 */
describe("parsePullRequestRef : formats acceptés", () => {
  it("lit l'URL d'une PR", () => {
    expect(parsePullRequestRef("https://github.com/acme/spec-demo/pull/12")).toEqual({
      owner: "acme",
      name: "spec-demo",
      number: 12,
    });
  });

  it("accepte les caractères usuels d'un dépôt (points, tirets, soulignés) et d'un compte (tirets)", () => {
    expect(parsePullRequestRef("https://github.com/my-org/repo.name_v2/pull/1")).toEqual({
      owner: "my-org",
      name: "repo.name_v2",
      number: 1,
    });
  });

  it("accepte le plus grand numéro entier 32 bits", () => {
    expect(parsePullRequestRef("https://github.com/a/b/pull/2147483647")?.number).toBe(2147483647);
  });
});

describe("parsePullRequestRef : formats refusés", () => {
  const rejected: [string, string][] = [
    ["vide", ""],
    ["texte libre", "PR 12"],
    ["numéro seul", "#12"],
    ["autre hôte", "https://evil.example/acme/spec/pull/1"],
    ["hôte déguisé en sous-domaine", "https://github.com.evil.example/acme/spec/pull/1"],
    ["hôte préfixé", "https://evilgithub.com/acme/spec/pull/1"],
    ["identifiants dans l'URL", "https://user@github.com/acme/spec/pull/1"],
    ["port explicite", "https://github.com:8443/acme/spec/pull/1"],
    ["schéma http", "http://github.com/acme/spec/pull/1"],
    ["schéma inconnu", "javascript://github.com/acme/spec/pull/1"],
    ["segment pull absent", "https://github.com/acme/spec/issues/1"],
    ["suite de chemin", "https://github.com/acme/spec/pull/1/files"],
    ["requête", "https://github.com/acme/spec/pull/1?diff=split"],
    ["fragment", "https://github.com/acme/spec/pull/1#issuecomment-1"],
    ["espace final", "https://github.com/acme/spec/pull/1 "],
    ["retour à la ligne", "https://github.com/acme/spec/pull/1\n"],
    ["deux URL", "https://github.com/acme/spec/pull/1 https://github.com/acme/spec/pull/2"],
    ["propriétaire ..", "https://github.com/../spec/pull/1"],
    ["dépôt ..", "https://github.com/acme/../pull/1"],
    ["dépôt .", "https://github.com/acme/./pull/1"],
    ["segment vide", "https://github.com/acme//pull/1"],
    ["compte avec tiret initial", "https://github.com/-acme/spec/pull/1"],
    ["compte avec caractère interdit", "https://github.com/ac%2Fme/spec/pull/1"],
    ["numéro zéro", "https://github.com/acme/spec/pull/0"],
    ["numéro négatif", "https://github.com/acme/spec/pull/-3"],
    ["numéro décimal", "https://github.com/acme/spec/pull/1.5"],
    ["numéro en notation scientifique", "https://github.com/acme/spec/pull/1e3"],
    ["numéro avec zéros initiaux", "https://github.com/acme/spec/pull/007"],
    ["numéro hexadécimal", "https://github.com/acme/spec/pull/0x10"],
    ["numéro au-delà de 32 bits", "https://github.com/acme/spec/pull/2147483648"],
    ["numéro énorme", `https://github.com/acme/spec/pull/${"9".repeat(40)}`],
    ["numéro absent", "https://github.com/acme/spec/pull/"],
    ["nom de dépôt démesuré", `https://github.com/acme/${"a".repeat(500)}/pull/1`],
  ];

  it.each(rejected)("%s -> undefined", (_label, text) => {
    expect(parsePullRequestRef(text)).toBeUndefined();
  });

  it("n'accepte que du texte : une valeur non chaîne ne lève pas", () => {
    expect(parsePullRequestRef(undefined as unknown as string)).toBeUndefined();
    expect(parsePullRequestRef(null as unknown as string)).toBeUndefined();
    expect(parsePullRequestRef(12 as unknown as string)).toBeUndefined();
  });
});
