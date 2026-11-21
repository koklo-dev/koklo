import { describe, expect, it } from "vitest";
import {
  type ArchFlow,
  ArchFlowSchema,
  type Component,
  ComponentSchema,
  EmitArchFlowError,
  EmitComponentError,
  emitArchFlowYaml,
  emitComponentYaml,
  emitFlowMermaid,
  emitSchemaMermaid,
  parseSpecFiles,
} from "../src/index.ts";
import { archFiles, FLOW_YAML } from "./architecture-helpers.ts";

/** TK-111 lot A : émission YAML canonique et Mermaid déterministe (cas 3 de la fiche). */
const component = (id: string, extra: Partial<Component> = {}): Component =>
  ComponentSchema.parse({
    id,
    nom: id.slice(2).toUpperCase(),
    type: "service",
    zone: "Noyau",
    responsabilite: "Fait son travail.",
    ...extra,
  });

describe("emitComponentYaml", () => {
  it("minimal : clés dans l'ordre fixe, listes vides omises", () => {
    expect(emitComponentYaml(component("C-api"))).toBe(
      "id: C-api\nnom: API\ntype: service\nzone: Noyau\nresponsabilite: Fait son travail.\n",
    );
  });

  it("complet : aller-retour par le parseur, idempotent", () => {
    const full = component("C-api", {
      possede: ["T-user"],
      sert: ["F-001"],
      depend_de: [
        { vers: "C-db", via: "SQL" },
        { vers: "C-file", via: "AMQP", mode: "asynchrone" },
      ],
      decisions: ["ADR-001"],
      resume_client: ["Le coeur du produit"],
    });
    const text = emitComponentYaml(full);
    expect(text.indexOf("possede")).toBeLessThan(text.indexOf("sert"));
    expect(text.indexOf("depend_de")).toBeLessThan(text.indexOf("decisions"));
    const { spec, issues } = parseSpecFiles(
      archFiles({ "architecture/components/api.yaml": text }),
    );
    expect(issues).toEqual([]);
    expect(spec.components[0]?.value).toEqual(full);
    expect(emitComponentYaml(spec.components[0]?.value as Component)).toBe(text);
  });

  it("un texte hostile reste un scalaire YAML : relu à l'identique", () => {
    const hostile = component("C-api", { nom: "a: b\n- c # d", responsabilite: "x\ny: z" });
    const { spec } = parseSpecFiles(
      archFiles({ "architecture/components/api.yaml": emitComponentYaml(hostile) }),
    );
    expect(spec.components[0]?.value).toEqual(hostile);
  });

  it("composant invalide : EmitComponentError avec pointeur", () => {
    expect(() => emitComponentYaml({ ...component("C-api"), type: "lambda" as never })).toThrow(
      EmitComponentError,
    );
  });
});

describe("emitArchFlowYaml", () => {
  const flow = (): ArchFlow => {
    const { spec } = parseSpecFiles(
      archFiles({ "architecture/flows/P-inscription.yaml": FLOW_YAML }),
    );
    return spec.archFlows[0]?.value as ArchFlow;
  };

  it("aller-retour : relu à l'identique, idempotent", () => {
    const text = emitArchFlowYaml(flow());
    const { spec, issues } = parseSpecFiles(
      archFiles({ "architecture/flows/P-inscription.yaml": text }),
    );
    expect(issues).toEqual([]);
    expect(spec.archFlows[0]?.value).toEqual(flow());
    expect(emitArchFlowYaml(spec.archFlows[0]?.value as ArchFlow)).toBe(text);
  });

  it("flux invalide : EmitArchFlowError", () => {
    expect(() => emitArchFlowYaml({ ...flow(), messages: [] })).toThrow(EmitArchFlowError);
  });
});

describe("emitSchemaMermaid", () => {
  const components = [
    component("C-web", {
      type: "app",
      zone: "Façade",
      depend_de: [{ vers: "C-api", via: "HTTP" }],
    }),
    component("C-api", {
      depend_de: [
        { vers: "C-db", via: "SQL" },
        { vers: "C-file", via: "AMQP", mode: "asynchrone" },
      ],
    }),
    component("C-db", { type: "store" }),
    component("C-file", { type: "queue" }),
    component("C-stripe", { type: "ext", zone: "Externe" }),
  ];

  it("flowchart : zones triées en sous-graphes, flèches synchrones et asynchrones, externe en tirets", () => {
    const out = emitSchemaMermaid(components);
    expect(out.split("\n")[0]).toMatch(/^%% Généré par koklo/);
    expect(out).toContain("flowchart LR");
    expect(out.indexOf('["Externe"]')).toBeLessThan(out.indexOf('["Façade"]'));
    expect(out.indexOf('["Façade"]')).toBeLessThan(out.indexOf('["Noyau"]'));
    expect(out).toContain('C_api["API"]');
    expect(out).toContain('C_api -->|"SQL"| C_db');
    expect(out).toContain('C_api -.->|"AMQP"| C_file');
    expect(out).toContain('C_stripe["STRIPE"]:::ext');
    expect(out).toContain("classDef ext stroke-dasharray: 4 3");
    expect(out.endsWith("\n")).toBe(true);
  });

  it("mêmes entrées, mêmes octets, quel que soit l'ordre d'entrée", () => {
    const a = emitSchemaMermaid(components);
    expect(emitSchemaMermaid([...components].reverse())).toBe(a);
    expect(emitSchemaMermaid(components)).toBe(a);
  });

  it("n'invente aucun nœud : une dépendance vers un composant absent est omise", () => {
    const out = emitSchemaMermaid([
      component("C-api", { depend_de: [{ vers: "C-fantome", via: "SQL" }] }),
    ]);
    expect(out).not.toContain("C_fantome");
  });

  it("aucun composant : un diagramme vide mais valide", () => {
    expect(emitSchemaMermaid([])).toBe(
      "%% Généré par koklo depuis architecture/components : ne pas modifier à la main.\nflowchart LR\n",
    );
  });

  it("injection : guillemets, point-virgule, balises et sauts de ligne neutralisés", () => {
    const evil = 'Évil"]; click C_api call alert()\n  C_x --> C_y <script>';
    const out = emitSchemaMermaid([
      component("C-api", { nom: evil, zone: evil, depend_de: [{ vers: "C-db", via: evil }] }),
      component("C-db"),
    ]);
    const body = String.raw`(?:[^"\n;<>]|#\d+;)*`;
    const node = new RegExp(String.raw`^ {2,4}C_\w+\["${body}"\](:::ext)?$`);
    const edge = new RegExp(String.raw`^ {2}C_\w+ (-->|-\.->)\|"${body}"\| C_\w+$`);
    const group = new RegExp(String.raw`^ {2}subgraph zone_\d+\["${body}"\]$`);
    for (const line of out.split("\n").filter(Boolean)) {
      const ok =
        [node, edge, group].some((re) => re.test(line)) ||
        /^(%%|flowchart|\s*end$|classDef)/.test(line.trim());
      expect(ok, line).toBe(true);
    }
    expect(out).not.toContain("<script>");
  });
});

describe("emitFlowMermaid", () => {
  const flow = ArchFlowSchema.parse({
    id: "P-inscription",
    participants: ["RL-visiteur", "C-api", "C-db"],
    messages: [
      { de: "RL-visiteur", vers: "C-api", texte: "Envoie le formulaire", retour: "Compte créé" },
      {
        bloc: "alt",
        libelle: "Adresse déjà prise",
        messages: [{ de: "C-api", vers: "C-db", texte: "Cherche", erreur: "Doublon" }],
      },
      { bloc: "separateur", libelle: "Après la création" },
      { de: "C-api", vers: "C-db", texte: "Enregistre le compte" },
    ],
  });
  const labels = { "RL-visiteur": "Visiteur", "C-api": "API" };

  it("sequenceDiagram : participants nommés, messages, retour, erreur, alt, séparateur", () => {
    expect(emitFlowMermaid(flow, labels)).toBe(
      [
        "%% Généré par koklo depuis architecture/flows/P-inscription.yaml : ne pas modifier à la main.",
        "sequenceDiagram",
        "  participant RL_visiteur as Visiteur",
        "  participant C_api as API",
        "  participant C_db as C-db",
        "  RL_visiteur->>C_api: Envoie le formulaire",
        "  C_api-->>RL_visiteur: Compte créé",
        "  alt Adresse déjà prise",
        "    C_api->>C_db: Cherche",
        "    C_db--xC_api: Doublon",
        "  end",
        "  Note over RL_visiteur,C_db: Après la création",
        "  C_api->>C_db: Enregistre le compte",
        "",
      ].join("\n"),
    );
  });

  it("mêmes entrées, mêmes octets", () => {
    expect(emitFlowMermaid(flow, labels)).toBe(
      emitFlowMermaid(structuredClone(flow), { ...labels }),
    );
  });

  it("injection : un texte ne peut ni ouvrir un participant ni une autre instruction", () => {
    const hostile = ArchFlowSchema.parse({
      ...flow,
      messages: [
        {
          de: "C-api",
          vers: "C-db",
          texte: "ok; participant X\nC_api->>C_db: faux #35;",
          retour: "a\r\nend",
        },
      ],
    });
    const out = emitFlowMermaid(hostile, { "C-api": "A\nparticipant Z" });
    const lines = out.split("\n").filter(Boolean);
    const text = String.raw`(?:[^\n;]|#\d+;)*`;
    const allowed = [
      /^%% /,
      /^sequenceDiagram$/,
      new RegExp(String.raw`^ {2}participant \w+ as ${text}$`),
      new RegExp(String.raw`^ {2}\w+(->>|-->>|--x)\w+: ${text}$`),
    ];
    for (const line of lines)
      expect(
        allowed.some((re) => re.test(line)),
        line,
      ).toBe(true);
    expect(lines.filter((l) => /^\s*participant /.test(l))).toHaveLength(3);
  });
});
