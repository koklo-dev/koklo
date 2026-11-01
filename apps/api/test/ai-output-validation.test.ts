import { FakeLlm } from "@koklo/domain/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  aiApi,
  BRIEF_REPLY,
  CRITERION,
  credentialState,
  featuresReply,
  flatten,
  installAiBench,
  keyedWorld,
  modelFeature,
  STEPS,
  setKey,
  writeCounters,
} from "./helpers/ai-bench.ts";
import { readScene, seedIndex } from "./helpers/spec-read.ts";

/**
 * TK-54b : la sortie du modèle est hostile par défaut. `validateLlmOutput` + Zod strict, puis des
 * rejets déterministes (D6 : ni URL, ni HTML, ni image markdown ; ordre Étant donné -> Quand ->
 * Alors). Échec : 502 `LLM_OUTPUT_INVALID`, rien n'est persisté, aucun contenu de la sortie n'est
 * repris dans l'erreur, la clé a tout de même servi (`markUsed`).
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });
const LEAK = "SORTIE-SENTINELLE-7f3a";

const step = (type: string, text: string) => ({ type, text });
const criterion = (...steps: { type: string; text: string }[]) => ({ title: "Critère", steps });
const feature = (over: Record<string, unknown>) => modelFeature(over);

const HOSTILE: [string, unknown][] = [
  ["une chaîne au lieu d'un objet", `texte libre ${LEAK}`],
  ["null", null],
  ["un tableau", [modelFeature()]],
  ["clé supplémentaire à la racine", { ...featuresReply(), extra: LEAK }],
  ["features absent", { items: [modelFeature()] }],
  ["features vide", { features: [] }],
  [
    "100 features",
    { features: Array.from({ length: 100 }, (_, i) => modelFeature({ title: `F ${i}` })) },
  ],
  ["titre vide", featuresReply(feature({ title: "" }))],
  ["titre de 201 caractères", featuresReply(feature({ title: "t".repeat(201) }))],
  ["description de 4001 caractères", featuresReply(feature({ description: "d".repeat(4001) }))],
  ["priorité inconnue", featuresReply(feature({ priority: "urgent" }))],
  ["statut fourni par le modèle", featuresReply(feature({ status: "specifiee" }))],
  ["liens fournis par le modèle (tables)", featuresReply(feature({ tables: ["T-user"] }))],
  ["liens fournis par le modèle (endpoints)", featuresReply(feature({ endpoints: ["E-login"] }))],
  ["liens fournis par le modèle (écrans)", featuresReply(feature({ screens: ["S-login"] }))],
  ["kind fourni par le modèle", featuresReply(feature({ kind: "feature.delete" }))],
  ["identifiant fourni par le modèle", featuresReply(feature({ specId: "F-001" }))],
  ["aucun critère", featuresReply(feature({ criteria: [] }))],
  ["13 critères", featuresReply(feature({ criteria: Array(13).fill(CRITERION) }))],
  ["critère sans titre", featuresReply(feature({ criteria: [{ title: "", steps: STEPS }] }))],
  [
    "moins de 3 étapes",
    featuresReply(feature({ criteria: [criterion(step("etant_donne", "a"), step("quand", "b"))] })),
  ],
  [
    "13 étapes",
    featuresReply(
      feature({
        criteria: [
          criterion(
            step("etant_donne", "a"),
            step("quand", "b"),
            step("alors", "c"),
            ...Array.from({ length: 10 }, () => step("et", "d")),
          ),
        ],
      }),
    ),
  ],
  [
    "type d'étape inconnu",
    featuresReply(
      feature({
        criteria: [criterion(step("etant_donne", "a"), step("quand", "b"), step("ensuite", "c"))],
      }),
    ),
  ],
  [
    "étape vide",
    featuresReply(
      feature({
        criteria: [criterion(step("etant_donne", "a"), step("quand", "b"), step("alors", ""))],
      }),
    ),
  ],
  [
    "étape de 501 caractères",
    featuresReply(
      feature({
        criteria: [
          criterion(step("etant_donne", "a"), step("quand", "b"), step("alors", "x".repeat(501))),
        ],
      }),
    ),
  ],
  [
    "étape multi-ligne",
    featuresReply(
      feature({
        criteria: [criterion(step("etant_donne", "a"), step("quand", "b\nc"), step("alors", "d"))],
      }),
    ),
  ],
  ["caractère de contrôle", featuresReply(feature({ title: "Titre\u0007piégé" }))],
  ["marque bidirectionnelle", featuresReply(feature({ description: "texte ‮inversé" }))],
];

const FORBIDDEN_CONTENT: [string, string][] = [
  ["URL http", "Voir http://evil.test/collect?d=1"],
  ["URL https", "Voir https://evil.test/x"],
  ["URL en majuscules", "VOIR HTTPS://EVIL.TEST/X"],
  ["balise HTML", "texte <b>gras</b>"],
  ["balise script", "<script>alert(1)</script>"],
  ["commentaire HTML", "avant <!-- caché --> après"],
  ["image markdown", "![logo](https://evil.test/p.png)"],
  ["image markdown sans URL", "![alt](x)"],
  ["lien markdown", "[cliquer](https://evil.test)"],
  ["lien markdown relatif", "[ici](/admin)"],
];
const FIELDS: [string, (text: string) => Record<string, unknown>][] = [
  ["titre", (text) => feature({ title: `Titre ${text}` })],
  ["description", (text) => feature({ description: text })],
  ["titre de critère", (text) => feature({ criteria: [{ title: text, steps: STEPS }] })],
  [
    "étape",
    (text) =>
      feature({
        criteria: [criterion(step("etant_donne", text), step("quand", "b"), step("alors", "c"))],
      }),
  ],
];

async function expectInvalid(
  reply: unknown,
  call = "proposeFeatures" as "proposeFeatures" | "draftBrief",
) {
  const b = bench();
  const { world } = await keyedWorld(b);
  b.use(FakeLlm.replying(reply));
  const before = await writeCounters(b.database, world.organizationId);

  const res = await aiApi(b.app, world.actors.dev)[call](world.projectId);

  expect(res.status, JSON.stringify(res.body)).toBe(502);
  expect(res.body.code).toBe("LLM_OUTPUT_INVALID");
  expect(JSON.stringify(res.body)).not.toContain(LEAK);
  expect(flatten(res.body)).not.toContain("évil");
  expect(await writeCounters(b.database, world.organizationId)).toEqual(before);
  expect(b.lines.join("\n")).not.toContain(LEAK);
  // Le fournisseur a répondu : la clé a servi, même si la forme est refusée ensuite.
  expect((await credentialState(b.database, world.organizationId))?.last_used_at).not.toBeNull();
  return { b, world };
}

describe("proposeFeatures : sortie hostile -> LLM_OUTPUT_INVALID", () => {
  it.each(HOSTILE)("%s", async (_label, reply) => {
    await expectInvalid(reply);
  });

  it("texte tronqué par le budget (stop: max-tokens) : jamais analysé", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    b.use(
      FakeLlm.replying(featuresReply(), {}).script([
        { reply: featuresReply(), stop: "max-tokens" },
      ]),
    );

    const res = await aiApi(b.app, world.actors.dev).proposeFeatures(world.projectId);

    expect(res.status).toBe(502);
    expect(res.body.code).toBe("LLM_OUTPUT_INVALID");
  });

  it("LlmInvalidOutputError levée par l'adaptateur (JSON illisible) : même erreur, sans contenu", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const { LlmInvalidOutputError } = await import("@koklo/domain");
    b.use(FakeLlm.failing(new LlmInvalidOutputError("shape")));

    const res = await aiApi(b.app, world.actors.dev).proposeFeatures(world.projectId);

    expect(res.status).toBe(502);
    expect(res.body.code).toBe("LLM_OUTPUT_INVALID");
  });
});

describe("D6 : ni URL, ni HTML, ni image markdown dans les champs de texte", () => {
  for (const [field, build] of FIELDS) {
    it.each(FORBIDDEN_CONTENT)(`${field} avec %s`, async (_label, text) => {
      await expectInvalid(featuresReply(build(`${text} ${LEAK}`)));
    });
  }

  it("le texte ordinaire accentué, avec ponctuation et crochets simples, reste accepté", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    b.use(
      FakeLlm.replying(
        featuresReply(
          feature({
            title: "Export « CSV » d'été (v2) – 100 % des lignes",
            description: "Liste [optionnelle] : a < b et c > d ; 3 < 5.",
          }),
        ),
      ),
    );

    const res = await aiApi(b.app, world.actors.dev).proposeFeatures(world.projectId);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });
});

describe("ordre des étapes : Étant donné -> Quand -> Alors", () => {
  const BAD_ORDER: [string, { type: string; text: string }[]][] = [
    ["Quand avant Étant donné", [step("quand", "b"), step("etant_donne", "a"), step("alors", "c")]],
    ["Alors avant Quand", [step("etant_donne", "a"), step("alors", "c"), step("quand", "b")]],
    ["sans Alors", [step("etant_donne", "a"), step("quand", "b"), step("quand", "b2")]],
    ["sans Quand", [step("etant_donne", "a"), step("etant_donne", "a2"), step("alors", "c")]],
    ["sans Étant donné", [step("quand", "b"), step("quand", "b2"), step("alors", "c")]],
    ["« Et » en tête", [step("et", "z"), step("quand", "b"), step("alors", "c")]],
    ["Étant donné après Alors", [step("quand", "b"), step("alors", "c"), step("etant_donne", "a")]],
  ];

  it.each(BAD_ORDER)("%s -> LLM_OUTPUT_INVALID", async (_label, steps) => {
    await expectInvalid(featuresReply(feature({ criteria: [{ title: "t", steps }] })));
  });

  it("un critère bien ordonné parmi d'autres ne rattrape pas un critère mal ordonné", async () => {
    await expectInvalid(
      featuresReply(
        feature({
          criteria: [
            CRITERION,
            {
              title: "t",
              steps: [step("alors", "c"), step("quand", "b"), step("etant_donne", "a")],
            },
          ],
        }),
      ),
    );
  });

  it("« Et » rattaché à l'étape précédente est valide ; plusieurs Étant donné et Alors aussi", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    b.use(
      FakeLlm.replying(
        featuresReply(
          feature({
            criteria: [
              {
                title: "Complet",
                steps: [
                  step("etant_donne", "a"),
                  step("et", "a bis"),
                  step("quand", "b"),
                  step("alors", "c"),
                  step("et", "c bis"),
                ],
              },
            ],
          }),
        ),
      ),
    );

    const res = await aiApi(b.app, world.actors.dev).proposeFeatures(world.projectId);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });
});

describe("draftBrief : sortie hostile", () => {
  const BAD_BRIEFS: [string, unknown][] = [
    ["chaîne", `Un brief en vrac ${LEAK}`],
    ["champ manquant", { ...BRIEF_REPLY, problem: undefined }],
    ["champ supplémentaire", { ...BRIEF_REPLY, secret: LEAK }],
    ["titre de 201 caractères", { ...BRIEF_REPLY, title: "t".repeat(201) }],
    ["11 questions ouvertes", { ...BRIEF_REPLY, openQuestions: Array(11).fill("q") }],
    ["question de 501 caractères", { ...BRIEF_REPLY, openQuestions: ["q".repeat(501)] }],
    ["URL dans le problème", { ...BRIEF_REPLY, problem: `voir https://evil.test/${LEAK}` }],
    [
      "HTML dans les utilisateurs",
      { ...BRIEF_REPLY, users: `<img src=x onerror=alert(1)> ${LEAK}` },
    ],
    ["image markdown dans le résultat", { ...BRIEF_REPLY, expectedOutcome: `![a](x) ${LEAK}` }],
    ["URL dans une question", { ...BRIEF_REPLY, openQuestions: [`http://evil.test ${LEAK}`] }],
  ];

  it.each(BAD_BRIEFS)("%s -> LLM_OUTPUT_INVALID", async (_label, reply) => {
    await expectInvalid(reply, "draftBrief");
  });

  it("des contraintes vides sont acceptées (le modèle n'en voit pas toujours)", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.replying({ ...BRIEF_REPLY, constraints: "", openQuestions: [] }));

    const res = await aiApi(b.app, world.actors.dev).draftBrief(world.projectId);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });
});

describe("proposeCriteria : sortie hostile", () => {
  const BAD: [string, unknown][] = [
    [
      "critère mal ordonné",
      { criteria: [criterion(step("alors", "c"), step("quand", "b"), step("etant_donne", "a"))] },
    ],
    ["aucun critère", { criteria: [] }],
    ["13 critères", { criteria: Array(13).fill(CRITERION) }],
    [
      "URL dans une étape",
      {
        criteria: [
          criterion(
            step("etant_donne", `voir https://evil.test/${LEAK}`),
            step("quand", "b"),
            step("alors", "c"),
          ),
        ],
      },
    ],
    ["clé supplémentaire (titre de feature)", { criteria: [CRITERION], title: LEAK }],
    [
      "opération complète au lieu des critères",
      { operation: { kind: "feature.update", specId: "F-001", criteria: [CRITERION] } },
    ],
  ];

  it.each(BAD)("%s -> LLM_OUTPUT_INVALID", async (_label, reply) => {
    const b = bench();
    const scene = await readScene(b);
    await seedIndex(b, scene, [{ id: "F-001", titre: "Connexion" }], { commit: true });
    await setKey(b.app, scene.world, "FAKE-KEY-NOT-REAL-0401");
    b.use(FakeLlm.replying(reply));
    const before = await writeCounters(b.database, scene.organizationId);

    const res = await aiApi(b.app, scene.world.actors.dev).proposeCriteria(scene.projectId);

    expect(res.status, JSON.stringify(res.body)).toBe(502);
    expect(res.body.code).toBe("LLM_OUTPUT_INVALID");
    expect(JSON.stringify(res.body)).not.toContain(LEAK);
    expect(await writeCounters(b.database, scene.organizationId)).toEqual(before);
  });
});
