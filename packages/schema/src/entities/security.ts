import { z } from "zod";
import { isOneLine } from "../emit/yaml-inline.ts";
import { CONTROL_CHARACTERS, isSummaryText } from "../security/text.ts";
import { dataFieldRef, featureId, PATTERNS, permissionId, roleId, threatId } from "./ids.ts";

/**
 * Formats du livrable Sécurité (TK-117, passation 21 §2, B791) : `security/threats/SEC-Txx.yaml`, `security/data.yaml`,
 * `security/rights.yaml` (généré), `security/asvs.yaml` et `security/summary.md`. Objets fermés, clés françaises ; tout
 * texte tient sur une ligne, sauf le risque d'une menace et la protection d'une donnée. Tout est borné.
 */

/** Surface « API, secrets et intégrations » (B792), à côté des fonctionnalités exposées. */
export const API_SURFACE = "api";
export const THREAT_CATEGORIES = [
  "usurpation",
  "acces_non_autorise",
  "fuite_donnees",
  "alteration",
  "abus",
  "conformite",
] as const;
export const THREAT_SEVERITIES = ["elevee", "moyenne", "faible"] as const;
export const THREAT_VERIFICATION_MODES = ["scenario", "controle_ci", "revue_humaine"] as const;
export const DATA_CATEGORIES = [
  "personnelle",
  "contact",
  "sensible",
  "secret",
  "technique",
] as const;
export const ACCESS_LEVELS = ["oui", "non", "restreint"] as const;
export const ASVS_CHAPTERS = [
  "authentification",
  "sessions",
  "controle_acces",
  "validation",
  "cryptographie",
  "journalisation",
  "protection_donnees",
  "configuration",
  "api",
] as const;
export const ASVS_LEVELS = [1, 2, 3] as const;
/** Identifiant d'une exigence ASVS (« V2.1.1 ») : jamais un chemin. */
export const ASVS_REQUIREMENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
/** Longueur maximale des textes : le fichier généré les reprend sans les dépasser. */
export const SECURITY_LIMITS = {
  label: 120,
  title: 200,
  line: 300,
  answer: 500,
  protection: 1000,
  text: 2000,
} as const;

const LINK_MAX = 130;
const anyOf = (...patterns: readonly RegExp[]) =>
  z
    .string()
    .max(LINK_MAX)
    .regex(new RegExp(patterns.map((pattern) => pattern.source).join("|")));

const THREAT_LINK_PATTERNS = [
  PATTERNS.operation,
  PATTERNS.table,
  PATTERNS.dataField,
  PATTERNS.role,
  PATTERNS.nfr,
  PATTERNS.stack,
  PATTERNS.environment,
  PATTERNS.screen,
  PATTERNS.rule,
] as const;
/** Liens d'une menace : opération, table, champ, rôle, exigence, choix, environnement, écran ou règle. */
export const threatLink = anyOf(...THREAT_LINK_PATTERNS);
/** Liens d'une exigence ASVS : ceux d'une menace, plus fonctionnalité, menace, décision, composant et permission. */
export const asvsLink = anyOf(
  ...THREAT_LINK_PATTERNS,
  PATTERNS.feature,
  PATTERNS.threat,
  PATTERNS.adr,
  PATTERNS.component,
  PATTERNS.permission,
);

const oneLine = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine(
      (value) => isOneLine(value) && !CONTROL_CHARACTERS.test(value),
      "une seule ligne, sans espace de bord",
    );
const multiline = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => !CONTROL_CHARACTERS.test(value), "caractère de contrôle refusé");

const distinct = <T>(items: readonly T[]): boolean => new Set(items).size === items.length;

/** Menace `security/threats/SEC-Txx.yaml` ; sans parade, elle est « à traiter ». */
export const ThreatSchema = z.strictObject({
  id: threatId,
  titre: oneLine(SECURITY_LIMITS.title),
  surfaces: z
    .array(z.union([featureId, z.literal(API_SURFACE)]))
    .min(1)
    .max(30),
  categorie: z.enum(THREAT_CATEGORIES),
  gravite: z.enum(THREAT_SEVERITIES),
  risque: multiline(SECURITY_LIMITS.text),
  parades: z.array(oneLine(SECURITY_LIMITS.line)).max(30).default([]),
  verification: z.strictObject({
    mode: z.enum(THREAT_VERIFICATION_MODES),
    detail: oneLine(SECURITY_LIMITS.line).optional(),
  }),
  scenario: z
    .strictObject({
      quand: oneLine(SECURITY_LIMITS.line),
      alors: oneLine(SECURITY_LIMITS.line),
    })
    .optional(),
  liens: z.array(threatLink).max(50).default([]),
});

/** Entrée de `security/data.yaml` ; son identité est son premier champ. */
export const DataEntrySchema = z.strictObject({
  donnee: oneLine(SECURITY_LIMITS.title),
  champs: z.array(dataFieldRef).min(1).max(200),
  categorie: z.enum(DATA_CATEGORIES),
  /** Saisie humaine seule (A7). */
  conservation: oneLine(SECURITY_LIMITS.line).optional(),
  /** Suggestion de l'agent : montrée en aide, jamais comptée (B796). */
  conservation_proposee: oneLine(SECURITY_LIMITS.line).optional(),
  acces: z.array(oneLine(SECURITY_LIMITS.label)).max(30).default([]),
  protection: multiline(SECURITY_LIMITS.protection).optional(),
});

type Entries = readonly z.output<typeof DataEntrySchema>[];
type Report = (path: (string | number)[]) => void;

/** Un champ du modèle ne figure que dans une seule entrée, et une seule fois. */
function repeatedFields(entries: Entries, report: Report): void {
  const seen = new Set<string>();
  entries.forEach((entry, i) => {
    entry.champs.forEach((field, j) => {
      if (seen.has(field)) report(["donnees", i, "champs", j]);
      seen.add(field);
    });
  });
}

/** `security/data.yaml` : données classées et transferts hors de l'Union européenne. */
export const SecurityDataSchema = z
  .strictObject({
    transferts: oneLine(SECURITY_LIMITS.answer).optional(),
    donnees: z.array(DataEntrySchema).max(5000).default([]),
  })
  .superRefine((file, ctx) => {
    repeatedFields(file.donnees, (path) => {
      ctx.addIssue({ code: "custom", message: "un champ figure dans une seule entrée", path });
    });
  });

const matrixCell = z.strictObject({
  role: roleId,
  acces: z.enum(ACCESS_LEVELS),
  restriction: oneLine(SECURITY_LIMITS.text).optional(),
});

/** Restriction ajoutée par la Sécurité : elle ne fait que restreindre une permission portée (B794). */
export const RightRestrictionSchema = z.strictObject({
  role: roleId,
  permission: permissionId,
  restriction: oneLine(SECURITY_LIMITS.line),
});

/** `security/rights.yaml` (généré) : la matrice, plus les restrictions et règles de propriété conservées. */
export const RightsFileSchema = z.strictObject({
  matrice: z
    .array(
      z.strictObject({
        action: permissionId,
        libelle: oneLine(SECURITY_LIMITS.line),
        cases: z.array(matrixCell).max(200),
      }),
    )
    .max(2000)
    .default([]),
  restrictions: z.array(RightRestrictionSchema).max(500).default([]),
  propriete: z.array(oneLine(SECURITY_LIMITS.line)).max(100).default([]),
});

const asvsLevel = z.union(ASVS_LEVELS.map((level) => z.literal(level)));

export const AsvsRequirementSchema = z.strictObject({
  id: z.string().regex(ASVS_REQUIREMENT_ID),
  chapitre: z.enum(ASVS_CHAPTERS),
  titre: oneLine(SECURITY_LIMITS.line),
  niveau: asvsLevel,
  reponse: oneLine(SECURITY_LIMITS.answer).optional(),
  liens: z.array(asvsLink).max(30).optional(),
});

/** `security/asvs.yaml` : `niveau` n'est écrit que par un choix humain (A6). */
export const AsvsFileSchema = z.strictObject({
  niveau: asvsLevel.optional(),
  exigences: z
    .array(AsvsRequirementSchema)
    .max(1000)
    .default([])
    .refine((list) => distinct(list.map((entry) => entry.id)), "les identifiants sont uniques"),
  secrets_et_dependances: z
    .array(
      z.strictObject({
        libelle: oneLine(SECURITY_LIMITS.label),
        valeur: oneLine(SECURITY_LIMITS.answer),
      }),
    )
    .max(20)
    .default([]),
});

const summaryText = multiline(SECURITY_LIMITS.text).refine(
  isSummaryText,
  "texte simple, sans identifiant technique ni titre",
);

/** `security/summary.md` : les sept cartes du résumé client (B800). */
export const SecuritySummarySchema = z.strictObject({
  donnees: summaryText,
  protection: summaryText,
  acces: summaryText,
  connexion: summaryText,
  conservation: summaryText,
  verification: summaryText,
  incident: summaryText,
});

export type SummaryKey = keyof z.output<typeof SecuritySummarySchema>;

/** Titres fixes des sections du résumé, dans l'ordre du fichier et des cartes. */
export const SUMMARY_SECTIONS: readonly { readonly key: SummaryKey; readonly title: string }[] = [
  { key: "donnees", title: "Où sont les données" },
  { key: "protection", title: "Ce qui est protégé" },
  { key: "acces", title: "Qui voit quoi" },
  { key: "connexion", title: "Comment on se connecte" },
  { key: "conservation", title: "Combien de temps on garde" },
  { key: "verification", title: "Ce qui est vérifié à chaque modification" },
  { key: "incident", title: "En cas d'incident" },
];

export type ThreatCategory = (typeof THREAT_CATEGORIES)[number];
export type ThreatSeverity = (typeof THREAT_SEVERITIES)[number];
export type DataCategory = (typeof DATA_CATEGORIES)[number];
export type AsvsChapter = (typeof ASVS_CHAPTERS)[number];
export type AsvsLevel = (typeof ASVS_LEVELS)[number];
export type Threat = z.output<typeof ThreatSchema>;
/** Entité avant les valeurs par défaut : ce que l'émission accepte. */
export type ThreatInput = z.input<typeof ThreatSchema>;
export type DataEntry = z.output<typeof DataEntrySchema>;
export type SecurityData = z.output<typeof SecurityDataSchema>;
export type SecurityDataInput = z.input<typeof SecurityDataSchema>;
export type RightRestriction = z.output<typeof RightRestrictionSchema>;
export type RightsFile = z.output<typeof RightsFileSchema>;
export type RightsFileInput = z.input<typeof RightsFileSchema>;
export type MatrixRow = RightsFile["matrice"][number];
export type MatrixCell = MatrixRow["cases"][number];
export type AsvsRequirement = z.output<typeof AsvsRequirementSchema>;
export type AsvsFile = z.output<typeof AsvsFileSchema>;
export type AsvsFileInput = z.input<typeof AsvsFileSchema>;
export type SecuritySummary = z.output<typeof SecuritySummarySchema>;
