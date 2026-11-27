import type { TenantClient } from "./client.ts";
import { archflowOf, type CurrentArchflow } from "./dossier-archflows.ts";

/**
 * Ce que l'agent lit pour le Fonctionnel (« L'agent lit », `AGENT_READS.functional`) : pages du dossier figées, synthèse
 * publiée, page des risques figée, cahier actuel. Ni commentaires, ni membres, ni autres projets, ni brouillons. Lectures
 * partagées par le job `agent-propose` (worker) et par `ai.proposeFeatures` (API) : une seule définition des sources.
 */
export type DossierClient = Pick<
  TenantClient,
  | "ideaVersion"
  | "ideaPage"
  | "ideaSynthesis"
  | "projectRepo"
  | "specHead"
  | "specFeature"
  | "specEntity"
>;

/** Page du dossier au moment du gel : jamais un contenu modifié depuis. */
export interface FrozenPage {
  readonly slug: string;
  readonly title: string;
  readonly content: string;
}

export interface CurrentFeature {
  readonly specId: string;
  readonly title: string;
  readonly criteria: readonly string[];
}

/** Règle, rôle ou parcours du cahier actuel : l'identifiant et le titre (le nom pour un rôle), pour éviter les doublons (TK-103). */
export interface CurrentTitle {
  readonly specId: string;
  readonly title: string;
}

export interface CurrentDomainTitles {
  readonly rules: readonly CurrentTitle[];
  readonly roles: readonly CurrentTitle[];
  readonly flows: readonly CurrentTitle[];
}

/** Table du modèle actuel (TK-107) : identifiant, nom, zone et noms des champs, jamais le contenu des jeux ni les contraintes. */
export interface CurrentTable {
  readonly specId: string;
  readonly title: string;
  readonly zone: string | null;
  readonly fields: readonly string[];
}

export interface CurrentDataModel {
  readonly tables: readonly CurrentTable[];
  readonly fixtures: readonly CurrentTitle[];
}

/**
 * Composant d'architecture du cahier actuel (TK-111) : identifiant, nom, zone et type, jamais la responsabilité. `owns` et
 * `serves` (TK-114b, `possede`/`sert`) servent au calcul de la couverture : jamais envoyés au modèle.
 */
export interface CurrentComponent {
  readonly specId: string;
  readonly title: string;
  readonly zone: string | null;
  readonly type: string;
  readonly owns: readonly string[];
  readonly serves: readonly string[];
  /** Dépendances lues de `depend_de` (TK-114c, B631) ; toujours rempli par le lecteur, facultatif pour les fixtures. */
  readonly dependsOn?: readonly CurrentDependency[];
  /** Rôles `RL-` lus de `acteurs` (TK-114d, B650) ; toujours rempli par le lecteur, facultatif pour les fixtures. */
  readonly actors?: readonly string[];
}

export interface CurrentDependency {
  readonly to: string;
  readonly via: string;
  readonly async?: boolean;
}

/** Ce que l'agent lit de l'architecture : composants, flux techniques, décisions, et exigences connues des fonctionnalités (B512). */
export interface CurrentArchitecture {
  readonly components: readonly CurrentComponent[];
  /** Flux techniques avec leurs messages (TK-114d, B655). */
  readonly archflows: readonly CurrentArchflow[];
  readonly decisions: readonly CurrentTitle[];
  readonly nfr: readonly string[];
}

export interface DossierSources {
  readonly tag: string;
  readonly pages: readonly FrozenPage[];
  readonly synthesis: string | null;
  readonly risks: string | null;
  readonly features: readonly CurrentFeature[];
}

/** Page dont le contenu est lu comme « hypothèses et risques » (source `idea.risks`), exclue des pages générales. */
export const RISKS_SLUG = "hypotheses-risques";
const WORKING_BRANCH = "cadrage";
const FEATURES_MAX = 300;

/** Versions des pages d'un gel : `{ slug: numéro }`, toute valeur qui n'est pas un nombre est ignorée. */
export const versionsOf = (value: unknown): Record<string, number> => {
  const versions: Record<string, number> = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) return versions;
  for (const [slug, version] of Object.entries(value)) {
    if (typeof version === "number") versions[slug] = version;
  }
  return versions;
};

/** Version figée lue : `baseVersion` s'il est donné, sinon la dernière dont le commit est réglé. */
export const frozenVersion = (
  client: DossierClient,
  projectId: string,
  baseVersion: number | null,
) =>
  client.ideaVersion.findFirst({
    where: {
      projectId,
      commitSha: { not: null },
      ...(baseVersion === null ? {} : { number: baseVersion }),
    },
    orderBy: { number: "desc" },
    select: { number: true, tag: true, pagesVersions: true },
  });

/** Version figée qui précède `number` ; `null` sans version précédente. */
export const previousVersion = (client: DossierClient, projectId: string, number: number) =>
  client.ideaVersion.findFirst({
    where: { projectId, commitSha: { not: null }, number: { lt: number } },
    orderBy: { number: "desc" },
    select: { tag: true, pagesVersions: true },
  });

/**
 * Pages figées : celles dont la version courante est celle du gel (une page modifiée depuis est exclue, jamais le contenu
 * non figé) ; `only` restreint aux pages citées (mode `update`).
 */
export async function frozenPages(
  client: DossierClient,
  projectId: string,
  frozen: Readonly<Record<string, number>>,
  only?: ReadonlySet<string>,
): Promise<FrozenPage[]> {
  const rows = await client.ideaPage.findMany({
    where: { projectId, deletedAt: null, slug: { in: Object.keys(frozen) } },
    orderBy: { position: "asc" },
    select: { slug: true, title: true, contentMd: true, version: true },
  });
  return rows
    .filter((row) => row.version === frozen[row.slug] && (!only || only.has(row.slug)))
    .map((row) => ({ slug: row.slug, title: row.title, content: row.contentMd }));
}

export async function publishedSynthesis(
  client: DossierClient,
  projectId: string,
): Promise<string | null> {
  const synthesis = await client.ideaSynthesis.findFirst({
    where: { projectId },
    select: { contentMd: true, source: true },
  });
  return synthesis?.source ? synthesis.contentMd : null;
}

/** Instantané de la tête de spec (branche de cadrage, sinon branche par défaut) ; `null` s'il n'y en a pas ou s'il a échoué. */
export async function headSnapshotId(
  client: DossierClient,
  projectId: string,
): Promise<string | null> {
  const repo = await client.projectRepo.findFirst({
    where: { projectId, OR: [{ role: "spec" }, { specPath: { not: null } }] },
    select: { id: true, defaultBranch: true },
  });
  if (!repo) return null;
  for (const branch of [WORKING_BRANCH, repo.defaultBranch]) {
    const head = await client.specHead.findFirst({
      where: { repoId: repo.id, branch },
      include: { snapshot: { select: { id: true, status: true } } },
    });
    if (!head) continue;
    return head.snapshot.status === "failed" ? null : head.snapshot.id;
  }
  return null;
}

/** Cahier actuel : les 300 premières fonctionnalités de la tête de spec (branche de cadrage, sinon branche par défaut). */
export async function currentFeatures(
  client: DossierClient,
  projectId: string,
): Promise<CurrentFeature[]> {
  const snapshotId = await headSnapshotId(client, projectId);
  if (snapshotId === null) return [];
  const rows = await client.specFeature.findMany({
    where: { snapshotId },
    orderBy: [{ specNumber: "asc" }, { id: "asc" }],
    take: FEATURES_MAX,
    select: {
      specId: true,
      title: true,
      criteria: { orderBy: { position: "asc" }, select: { title: true } },
    },
  });
  return rows.map((row) => ({
    specId: row.specId,
    title: row.title,
    criteria: row.criteria.map((criterion) => criterion.title),
  }));
}

const DOMAIN_TITLES_MAX = 300;

const textOf = (value: unknown): string => (typeof value === "string" ? value : "");
const recordOf = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Rôles d'un fichier `roles` de l'index : `{ id, nom }` par rôle. */
const rolesOf = (data: unknown): CurrentTitle[] => {
  const roles = recordOf(data).roles;
  return Array.isArray(roles)
    ? roles.map((role) => ({
        specId: textOf(recordOf(role).id),
        title: textOf(recordOf(role).nom),
      }))
    : [];
};

/** Règles, rôles et parcours de la tête de spec (index d'entités) : seuls les titres, jamais le contenu (TK-103, B342). */
export async function currentDomainTitles(
  client: DossierClient,
  projectId: string,
): Promise<CurrentDomainTitles> {
  const none = { rules: [], roles: [], flows: [] };
  const snapshotId = await headSnapshotId(client, projectId);
  if (snapshotId === null) return none;
  const rows = await client.specEntity.findMany({
    where: { snapshotId, kind: { in: ["rule", "roles", "flow"] } },
    orderBy: [{ kind: "asc" }, { sort: "asc" }, { id: "asc" }],
    select: { kind: true, specId: true, data: true },
  });
  const titled = (kind: string) =>
    rows
      .filter((row) => row.kind === kind)
      .slice(0, DOMAIN_TITLES_MAX)
      .map((row) => ({ specId: row.specId, title: textOf(recordOf(row.data).titre) }));
  return {
    rules: titled("rule"),
    roles: rows.filter((row) => row.kind === "roles").flatMap((row) => rolesOf(row.data)),
    flows: titled("flow"),
  };
}

const TABLES_MAX = 200;
const FIELDS_PER_TABLE_MAX = 100;

const tableOf = (row: { specId: string; data: unknown }): CurrentTable => {
  const data = recordOf(row.data);
  const fields = Array.isArray(data.champs) ? data.champs : [];
  return {
    specId: row.specId,
    title: textOf(data.titre),
    zone: textOf(data.zone) || null,
    fields: fields
      .slice(0, FIELDS_PER_TABLE_MAX)
      .map((field) => textOf(recordOf(field).nom))
      .filter((name) => name !== ""),
  };
};

/** Tables et jeux d'exemple de la tête de spec (index d'entités) : seuls les noms, jamais les lignes (TK-107, B387). */
export async function currentDataModel(
  client: DossierClient,
  projectId: string,
): Promise<CurrentDataModel> {
  const snapshotId = await headSnapshotId(client, projectId);
  if (snapshotId === null) return { tables: [], fixtures: [] };
  const rows = await client.specEntity.findMany({
    where: { snapshotId, kind: { in: ["table", "fixture"] } },
    orderBy: [{ kind: "asc" }, { sort: "asc" }, { id: "asc" }],
    select: { kind: true, specId: true, data: true },
  });
  return {
    tables: rows
      .filter((row) => row.kind === "table")
      .slice(0, TABLES_MAX)
      .map(tableOf),
    fixtures: rows
      .filter((row) => row.kind === "fixture")
      .slice(0, DOMAIN_TITLES_MAX)
      .map((row) => ({ specId: row.specId, title: textOf(recordOf(row.data).titre) })),
  };
}

/**
 * Identifiants de toutes les tables de la tête de spec (TK-114b, B616) : la couverture compte chaque table, sans le plafond de
 * 200 des tables envoyées au modèle. Jamais le contenu.
 */
export async function currentTableIds(client: DossierClient, projectId: string): Promise<string[]> {
  const snapshotId = await headSnapshotId(client, projectId);
  if (snapshotId === null) return [];
  const rows = await client.specEntity.findMany({
    where: { snapshotId, kind: { in: ["table"] } },
    orderBy: [{ sort: "asc" }, { id: "asc" }],
    select: { specId: true },
  });
  return rows.map((row) => row.specId);
}

const COMPONENTS_MAX = 200;

const idsOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];

/** Motif `C-<slug>` de `@koklo/schema` (`PATTERNS.component`), que ce paquet n'importe pas. */
const COMPONENT_ID = /^C-[a-z0-9][a-z0-9-]*$/;

/** `depend_de` `{ vers, via, mode }` → `{ to, via, async }` ; une entrée sans cible `C-` ni canal est ignorée. */
const dependenciesOf = (value: unknown): CurrentDependency[] =>
  (Array.isArray(value) ? value : []).flatMap((item) => {
    const dep = recordOf(item);
    const to = textOf(dep.vers);
    const via = textOf(dep.via);
    if (!COMPONENT_ID.test(to) || via === "") return [];
    return [dep.mode === "asynchrone" ? { to, via, async: true } : { to, via }];
  });

/** Motif `RL-<slug>` de `@koklo/schema` (`PATTERNS.role`). */
const ROLE_ID = /^RL-[a-z0-9][a-z0-9-]*$/;

const componentOf = (row: { specId: string; data: unknown }): CurrentComponent => {
  const data = recordOf(row.data);
  return {
    specId: row.specId,
    title: textOf(data.titre),
    zone: textOf(data.zone) || null,
    type: textOf(data.type),
    owns: idsOf(data.possede),
    serves: idsOf(data.sert),
    dependsOn: dependenciesOf(data.depend_de),
    actors: idsOf(data.acteurs).filter((id) => ROLE_ID.test(id)),
  };
};
const NFR_MAX = 100;

/**
 * Composants, flux techniques, décisions de la tête de spec (index d'entités) et exigences connues : les identifiants `NFR-` cités
 * par les fonctionnalités (B512, les fichiers `nfr/` seront formalisés au lot 8). Seuls des titres, jamais le contenu (TK-111).
 */
export async function currentArchitecture(
  client: DossierClient,
  projectId: string,
): Promise<CurrentArchitecture> {
  const none = { components: [], archflows: [], decisions: [], nfr: [] };
  const snapshotId = await headSnapshotId(client, projectId);
  if (snapshotId === null) return none;
  const rows = await client.specEntity.findMany({
    where: { snapshotId, kind: { in: ["component", "archflow", "adr", "feature"] } },
    orderBy: [{ kind: "asc" }, { sort: "asc" }, { id: "asc" }],
    select: { kind: true, specId: true, data: true },
  });
  const of = (kind: string) => rows.filter((row) => row.kind === kind);
  const titled = (kind: string) =>
    of(kind)
      .slice(0, DOMAIN_TITLES_MAX)
      .map((row) => ({ specId: row.specId, title: textOf(recordOf(row.data).titre) }));
  const nfr = new Set(of("feature").flatMap((row) => idsOf(recordOf(row.data).nfr)));
  return {
    components: of("component").slice(0, COMPONENTS_MAX).map(componentOf),
    archflows: of("archflow").slice(0, DOMAIN_TITLES_MAX).map(archflowOf),
    decisions: titled("adr"),
    nfr: [...nfr].sort().slice(0, NFR_MAX),
  };
}

/** Cahier technique actuel de la tête (TK-115) : des noms et des titres, jamais une valeur de variable. */
export interface CurrentTechnical {
  /** `layer` : couche enregistrée (`couche`), absente d'un choix qui n'en porte pas (TK-115b). */
  stacks: { specId: string; role: string; choice: string | null; layer?: string }[];
  operations: { specId: string; zone: string; component: string; summary: string }[];
  requirements: { specId: string; title: string; category: string; target: string }[];
  environments: { specId: string; name: string }[];
  variables: string[];
}

const TECHNICAL_MAX = 500;
type EntityData = { specId: string; data: unknown };

const stackOfRow = ({ specId, data }: EntityData) => {
  const { role, choix, couche } = recordOf(data);
  const choice = textOf(choix);
  const layer = textOf(couche);
  return {
    specId,
    role: textOf(role),
    choice: choice === "" ? null : choice,
    ...(layer === "" ? {} : { layer }),
  };
};
/** Opérations du cahier technique seules (elles nomment leur composant) : un endpoint REST n'en est pas une. */
const operationsOf = (rows: readonly EntityData[]) =>
  rows
    .filter((row) => textOf(recordOf(row.data).composant) !== "")
    .map(({ specId, data }) => ({
      specId,
      zone: textOf(recordOf(data).zone),
      component: textOf(recordOf(data).composant),
      summary: textOf(recordOf(data).resume),
    }));
const requirementOfRow = ({ specId, data }: EntityData) => ({
  specId,
  title: textOf(recordOf(data).titre),
  category: textOf(recordOf(data).categorie),
  target: textOf(recordOf(data).cible),
});
const listOfRecords = (value: unknown) => (Array.isArray(value) ? value.map(recordOf) : []);

/** Choix, opérations, exigences, environnements et noms de variables de la tête de spec (index d'entités). */
export async function currentTechnical(
  client: DossierClient,
  projectId: string,
): Promise<CurrentTechnical> {
  const snapshotId = await headSnapshotId(client, projectId);
  const rows =
    snapshotId === null
      ? []
      : await client.specEntity.findMany({
          where: { snapshotId, kind: { in: ["stack", "endpoint", "nfr", "environments"] } },
          orderBy: [{ kind: "asc" }, { sort: "asc" }, { id: "asc" }],
          select: { kind: true, specId: true, data: true },
        });
  const of = (kind: string) => rows.filter((row) => row.kind === kind).slice(0, TECHNICAL_MAX);
  const file = recordOf(of("environments")[0]?.data);
  return {
    stacks: of("stack").map(stackOfRow),
    operations: operationsOf(of("endpoint")),
    requirements: of("nfr").map(requirementOfRow),
    environments: listOfRecords(file.environnements).map((entry) => ({
      specId: textOf(entry.id),
      name: textOf(entry.nom),
    })),
    variables: listOfRecords(file.variables).map((entry) => textOf(entry.nom)),
  };
}

/**
 * Sources de la génération complète, sans diff : le dossier figé (dernière version dont le commit est réglé), la
 * synthèse publiée, la page des risques et le cahier actuel. `null` sans version figée : rien n'est envoyé au modèle.
 */
export async function readFrozenDossier(
  client: DossierClient,
  projectId: string,
): Promise<DossierSources | null> {
  const version = await frozenVersion(client, projectId, null);
  if (!version) return null;
  const pages = await frozenPages(client, projectId, versionsOf(version.pagesVersions));
  return {
    tag: version.tag,
    pages: pages.filter((page) => page.slug !== RISKS_SLUG),
    synthesis: await publishedSynthesis(client, projectId),
    risks: pages.find((page) => page.slug === RISKS_SLUG)?.content ?? null,
    features: await currentFeatures(client, projectId),
  };
}
