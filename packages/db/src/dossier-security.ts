import { type DossierClient, headSnapshotId } from "./dossier-sources.ts";

/**
 * Sécurité actuelle de la tête lue par l'agent (TK-117) : titres des menaces et leurs parades, champs classés, droits,
 * exigences, tables, opérations et rôles. Ni contact d'incident, ni durée de conservation, ni valeur.
 */
export interface CurrentSecurity {
  threats: { specId: string; title: string; surfaces: string[]; measures: string[] }[];
  entries: { fields: string[]; name: string; category: string }[];
  restrictions: { role: string; permission: string; restriction: string }[];
  ownershipRules: string[];
  asvs: {
    level: number | undefined;
    requirements: {
      id: string;
      chapter: string;
      title: string;
      level: number;
      answered: boolean;
    }[];
    facts: string[];
  };
  tables: { id: string; champs: { nom: string }[] }[];
  operations: { id: string; permission: string; serves: string[] }[];
  roles: { id: string; name: string; permissions: string[] }[];
  /** Un résumé client existe. */
  summary: boolean;
}

const KINDS = [
  "threat",
  "sensitive",
  "rights",
  "asvs",
  "security_summary",
  "table",
  "endpoint",
  "roles",
];
const ROWS_MAX = 5000;

type Row = { kind: string; specId: string; data: unknown };
type Data = Record<string, unknown>;

const recordOf = (value: unknown): Data =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Data) : {};
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const records = (value: unknown): Data[] => (Array.isArray(value) ? value.map(recordOf) : []);

const threatOfRow = ({ specId, data }: Row) => ({
  specId,
  title: text(recordOf(data).titre),
  surfaces: strings(recordOf(data).surfaces),
  measures: strings(recordOf(data).parades),
});
const entryOfRow = ({ data }: Row) => ({
  fields: strings(recordOf(data).champs),
  name: text(recordOf(data).donnee),
  category: text(recordOf(data).categorie),
});
const tableOfRow = ({ specId, data }: Row) => ({
  id: specId,
  champs: records(recordOf(data).champs).map((field) => ({ nom: text(field.nom) })),
});
/** Opérations du cahier technique seules (elles nomment leur composant) : un endpoint REST n'en est pas une. */
const operationsOf = (rows: readonly Row[]) =>
  rows
    .filter((row) => text(recordOf(row.data).composant) !== "")
    .map(({ specId, data }) => ({
      id: specId,
      permission: text(recordOf(data).permission),
      serves: strings(recordOf(data).sert),
    }));
const rolesOf = (data: Data) =>
  records(data.roles).map((role) => ({
    id: text(role.id),
    name: text(role.nom),
    permissions: strings(role.permissions),
  }));

function rightsOf(data: Data) {
  return {
    restrictions: records(data.restrictions).map((entry) => ({
      role: text(entry.role),
      permission: text(entry.permission),
      restriction: text(entry.restriction),
    })),
    ownershipRules: strings(data.propriete),
  };
}

function asvsOf(data: Data): CurrentSecurity["asvs"] {
  return {
    level: typeof data.niveau === "number" ? data.niveau : undefined,
    requirements: records(data.exigences).map((entry) => ({
      id: text(entry.id),
      chapter: text(entry.chapitre),
      title: text(entry.titre),
      level: Number(entry.niveau) || 1,
      answered: text(entry.reponse) !== "",
    })),
    facts: records(data.secrets_et_dependances).map((entry) => text(entry.libelle)),
  };
}

async function rowsAt(client: DossierClient, projectId: string): Promise<Row[]> {
  const snapshotId = await headSnapshotId(client, projectId);
  if (snapshotId === null) return [];
  return client.specEntity.findMany({
    where: { snapshotId, kind: { in: KINDS } },
    orderBy: [{ kind: "asc" }, { sort: "asc" }, { id: "asc" }],
    take: ROWS_MAX,
    select: { kind: true, specId: true, data: true },
  });
}

export async function currentSecurity(
  client: DossierClient,
  projectId: string,
): Promise<CurrentSecurity> {
  const rows = await rowsAt(client, projectId);
  const of = (kind: string) => rows.filter((row) => row.kind === kind);
  const file = (kind: string) => recordOf(of(kind)[0]?.data);
  return {
    threats: of("threat").map(threatOfRow),
    entries: of("sensitive").map(entryOfRow),
    ...rightsOf(file("rights")),
    asvs: asvsOf(file("asvs")),
    tables: of("table").map(tableOfRow),
    operations: operationsOf(of("endpoint")),
    roles: rolesOf(file("roles")),
    summary: of("security_summary").length > 0,
  };
}
