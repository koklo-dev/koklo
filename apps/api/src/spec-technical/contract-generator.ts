import { CONTRACT_STACK_ID, type OperationDetail, type TechnicalContract } from "@koklo/contract";

/**
 * Contrat TypeScript · oRPC + zod d'une opération (TK-116, B770, B771 ; formes de la maquette 14), calculé à la lecture et
 * jamais écrit. Pur. Le fichier de spec n'est pas fiable : aucun de ses textes ne sort d'une chaîne ni d'un commentaire.
 */
export type ContractOperation = Pick<
  OperationDetail,
  "specId" | "zone" | "input" | "output" | "errors"
>;

const GENERATOR_LABEL = "TypeScript · oRPC";
/** Le choix retenu désigne le générateur quand il nomme « oRPC » comme un mot. */
const ORPC = /\boRPC\b/i;
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const ENUM_VALUE = /^[\p{L}\p{N}_.-]+$/u;
const TEXT_TYPE = /^texte(?:\s*\((\d{1,7})\))?$/;
const RULE = /^R-\d{3,}$/;
const LINE_BREAKS = /[\r\n\u2028\u2029]+/g;
const TEXT_DEFAULT_MAX = 255;
const SIMPLE_TYPES: Readonly<Record<string, string>> = {
  uuid: "z.string().uuid()",
  booléen: "z.boolean()",
  date: "z.string().date()",
  url: "z.string().url()",
};
const STATUSES: readonly (readonly [RegExp, number])[] = [
  [/PRIS|RESERVE/, 409],
  [/AUTORISE/, 401],
  [/INDISPONIBLE/, 503],
];

const flat = (value: string): string => value.replace(LINE_BREAKS, " ");

/** Valeurs écrites dans la note ou la contrainte (`a, b` ou `a | b`) ; illisibles : une chaîne libre. */
function enumOf(hint: string | undefined): string {
  const values = flat(hint ?? "")
    .split(/[,|]/)
    .map((value) => value.trim());
  if (!values.every((value) => ENUM_VALUE.test(value))) return "z.string()";
  return `z.enum([${values.map((value) => `'${value}'`).join(", ")}])`;
}

const arrayOf = (item: string): string =>
  `z.array(${IDENTIFIER.test(item) ? item : "z.unknown()"})`;

function zodOf(rawType: string, hint: string | undefined): string {
  const type = flat(rawType).trim();
  if (Object.hasOwn(SIMPLE_TYPES, type)) return SIMPLE_TYPES[type] as string;
  const text = TEXT_TYPE.exec(type);
  if (text) return `z.string().max(${Number(text[1] ?? TEXT_DEFAULT_MAX)})`;
  if (type === "enum") return enumOf(hint);
  if (type.endsWith("[]")) return arrayOf(type.slice(0, -2));
  return /\bnull\b/.test(type) ? "z.string().nullable()" : "z.unknown()";
}

const keyOf = (name: string): string => (IDENTIFIER.test(name) ? name : JSON.stringify(flat(name)));

const objectLines = (fields: readonly { field: string; type: string; hint?: string }[]) =>
  fields.map(({ field, type, hint }) => `    ${keyOf(field)}: ${zodOf(type, hint)},\n`).join("");

const statusOf = (code: string): number =>
  STATUSES.find(([pattern]) => pattern.test(code))?.[1] ?? 422;

function errorsBlock(errors: ContractOperation["errors"]): string {
  if (errors.length === 0) return "";
  const lines = errors.map(({ code, rule }) => {
    const comment = rule !== undefined && RULE.test(rule) ? ` // ${rule}` : "";
    return `    ${keyOf(code)}: { status: ${statusOf(code)} },${comment}\n`;
  });
  return `\n  .errors({\n${lines.join("")}  })`;
}

/** `liste_attente.add-item` -> `listeAttenteAddItem` ; un nom qui commence par un chiffre est préfixé. */
function constantOf(name: string): string {
  const camel = name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word, index) => (index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join("");
  return IDENTIFIER.test(camel) ? camel : `op${camel}`;
}

const slugOf = (zone: string): string =>
  zone
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join("-") || "zone";

/** Destination dans le dépôt de code (affichée seulement) : zone puis premier segment du nom. */
export const contractPath = ({ specId, zone }: Pick<ContractOperation, "specId" | "zone">) =>
  `packages/contract/src/${slugOf(zone)}/${specId.split(".")[0]}.ts`;

export function contractCode(operation: ContractOperation): string {
  const input = operation.input.map((f) => ({ field: f.field, type: f.type, hint: f.constraint }));
  const output = operation.output.map((f) => ({ field: f.field, type: f.type, hint: f.note }));
  return [
    `export const ${constantOf(operation.specId)} = oc\n`,
    `  .route({ tags: ['${slugOf(operation.zone)}'] })\n`,
    `  .input(z.object({\n${objectLines(input)}  }))\n`,
    `  .output(z.object({\n${objectLines(output)}  }))`,
    `${errorsBlock(operation.errors)};\n`,
  ].join("");
}

type Availability =
  | Omit<Extract<TechnicalContract, { available: true }>, "path" | "code" | "commitSha">
  | Omit<Extract<TechnicalContract, { available: false }>, "commitSha">;

/** Le générateur du choix `ST-api` : sans choix retenu ou pour une autre stack, la raison. */
export function generatorAvailability(
  stack: { status: "chosen" | "open"; choice?: string } | undefined,
): Availability {
  const choice = stack?.status === "chosen" ? stack.choice : undefined;
  if (choice === undefined) return { available: false, reason: "no_choice" };
  if (!ORPC.test(choice)) return { available: false, reason: "unsupported_stack", choice };
  const generator = { stackId: CONTRACT_STACK_ID, label: GENERATOR_LABEL, choice } as const;
  return { available: true, generator };
}
