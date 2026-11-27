import { describe, expect, it } from "vitest";
import {
  type ContractOperation,
  contractCode,
  contractPath,
  generatorAvailability,
} from "./contract-generator.ts";

/**
 * TK-116 (cas 3, B770, B771) : générateur de contrat TypeScript · oRPC + zod, pur. Formes de la maquette 14 (l.626-630) ;
 * aucun texte du fichier ne sort d'une chaîne ou d'un commentaire.
 */
const operation = (over: Partial<ContractOperation> = {}): ContractOperation => ({
  specId: "reservation.create",
  zone: "Prise de rendez-vous",
  input: [],
  output: [],
  errors: [],
  ...over,
});

const inputOf = (type: string, constraint?: string) =>
  contractCode(
    operation({ input: [{ field: "champ", type, ...(constraint ? { constraint } : {}) }] }),
  ).match(/ {4}champ: (.*),\n/)?.[1];

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("contractCode", () => {
  it("la forme complète de la maquette : entrée, sortie, erreurs et règle en commentaire", () => {
    const code = contractCode(
      operation({
        input: [
          { field: "serviceId", type: "uuid", constraint: "Service actif" },
          { field: "nom", type: "texte(100)", constraint: "Obligatoire" },
          { field: "consentementSms", type: "booléen" },
        ],
        output: [
          { field: "statut", type: "enum", note: "confirmee" },
          { field: "lienAnnulation", type: "url", note: "Jeton à usage unique" },
        ],
        errors: [
          { code: "CRENEAU_PRIS", when: "créneau pris", rule: "R-001" },
          { code: "SERVICE_INACTIF", when: "service retiré" },
        ],
      }),
    );
    expect(code).toBe(
      [
        "export const reservationCreate = oc",
        "  .route({ tags: ['prise-de-rendez-vous'] })",
        "  .input(z.object({",
        "    serviceId: z.string().uuid(),",
        "    nom: z.string().max(100),",
        "    consentementSms: z.boolean(),",
        "  }))",
        "  .output(z.object({",
        "    statut: z.enum(['confirmee']),",
        "    lienAnnulation: z.string().url(),",
        "  }))",
        "  .errors({",
        "    CRENEAU_PRIS: { status: 409 }, // R-001",
        "    SERVICE_INACTIF: { status: 422 },",
        "  });",
        "",
      ].join("\n"),
    );
  });

  it("sans erreur : pas de bloc .errors", () => {
    expect(contractCode(operation())).toBe(
      "export const reservationCreate = oc\n  .route({ tags: ['prise-de-rendez-vous'] })\n  .input(z.object({\n  }))\n  .output(z.object({\n  }));\n",
    );
  });

  it.each([
    ["uuid", "z.string().uuid()"],
    ["texte", "z.string().max(255)"],
    ["texte(20)", "z.string().max(20)"],
    ["booléen", "z.boolean()"],
    ["date", "z.string().date()"],
    ["url", "z.string().url()"],
    ["Creneau[]", "z.array(Creneau)"],
    ["liste de choses[]", "z.array(z.unknown())"],
    ["texte | null", "z.string().nullable()"],
    ["entier", "z.unknown()"],
    ["x); process.exit(1); //", "z.unknown()"],
  ])("type %s -> %s", (type, expected) => {
    expect(inputOf(type)).toBe(expected);
  });

  it.each([
    ["envoye | echec", "z.enum(['envoye', 'echec'])"],
    ["actif, archivé", "z.enum(['actif', 'archivé'])"],
    ["Jeton à usage unique", "z.string()"],
    ["a', evil() | b", "z.string()"],
    [undefined, "z.string()"],
  ])("enum, valeurs « %s » -> %s", (constraint, expected) => {
    expect(inputOf("enum", constraint)).toBe(expected);
  });

  it.each([
    ["CRENEAU_PRIS", 409],
    ["CRENEAU_RESERVE", 409],
    ["NON_AUTORISE", 401],
    ["FOURNISSEUR_INDISPONIBLE", 503],
    ["DELAI_DEPASSE", 422],
  ])("statut de %s : %i", (code, status) => {
    const text = contractCode(operation({ errors: [{ code, when: "quand" }] }));
    expect(text).toContain(`    ${code}: { status: ${status} },\n`);
  });

  it("échappement : clés citées, retours à la ligne retirés, rien ne sort d'une chaîne ni d'un commentaire", () => {
    const text = contractCode(
      operation({
        zone: "Zone'] }); hack(); //",
        input: [{ field: "lignes[].id", type: "uuid" }],
        errors: [
          { code: "a: 1 }); hack\n(", when: "quand", rule: "R-001\nhack()" },
          { code: "ligne\u2028deux", when: "quand" },
        ],
      }),
    );
    expect(text).toContain('    "lignes[].id": z.string().uuid(),\n');
    expect(text).toContain("tags: ['zone-hack']");
    expect(text).toContain('    "a: 1 }); hack (": { status: 422 },\n');
    expect(text).toContain('    "ligne deux": { status: 422 },\n');
    expect(text).not.toMatch(/^hack/m);
    expect(text).not.toContain("\u2028");
  });

  it.each([
    ["liste_attente.add-item", "listeAttenteAddItem"],
    ["creneau.listAvailable", "creneauListAvailable"],
    ["2fa.enable", "op2faEnable"],
  ])("nom %s : constante %s", (specId, name) => {
    expect(contractCode(operation({ specId }))).toContain(`export const ${name} = oc`);
  });

  it("chemin : zone en slug, premier segment du nom ; jamais de remontée de dossier", () => {
    expect(contractPath({ specId: "reservation.create", zone: "Prise de rendez-vous" })).toBe(
      "packages/contract/src/prise-de-rendez-vous/reservation.ts",
    );
    expect(contractPath({ specId: "a.b", zone: "../.." })).toBe("packages/contract/src/zone/a.ts");
  });
});

describe("generatorAvailability", () => {
  it.each([
    [undefined, { available: false, reason: "no_choice" }],
    [{ status: "open" as const }, { available: false, reason: "no_choice" }],
    [
      { status: "chosen" as const, choice: "REST + OpenAPI" },
      { available: false, reason: "unsupported_stack", choice: "REST + OpenAPI" },
    ],
    [
      { status: "chosen" as const, choice: "ORPCX" },
      { available: false, reason: "unsupported_stack", choice: "ORPCX" },
    ],
    [
      { status: "chosen" as const, choice: "NestJS · oRPC + zod" },
      {
        available: true,
        generator: { stackId: "ST-api", label: "TypeScript · oRPC", choice: "NestJS · oRPC + zod" },
      },
    ],
  ])("choix %o", (stack, expected) => {
    expect(generatorAvailability(stack)).toEqual(expected);
  });
});
