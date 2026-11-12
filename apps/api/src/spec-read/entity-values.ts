import type {
  FlowDetail,
  FunctionalItem,
  RoleDetail,
  RuleDetail,
  RulesMatrix,
} from "@koklo/contract";

/**
 * Lecture tolérante des données de l'index d'entités (`spec_entities.data`, TK-103) : celles des règles, parcours et rôles
 * écrits par le worker, ou d'un parcours `.json` hérité (étapes en texte, sans départ). Rien n'est supposé : un champ absent
 * ou d'un autre type reprend sa valeur neutre, jamais une exception.
 */
type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const texts = (value: unknown): string[] =>
  list(value).filter((item): item is string => typeof item === "string" && item !== "");
const SCREEN = /^S-[a-z0-9][a-z0-9-]*$/;
const FEATURE = /^F-\d{3,}$/;
const RULE_TYPES = ["contrainte", "calcul", "workflow"] as const;

type Step = { label: string; screen?: string };

function stepOf(value: unknown): Step {
  if (typeof value === "string") return { label: value.slice(0, 500) || "Étape" };
  const record = isRecord(value) ? value : {};
  const label = text(record.libelle) || text(record.label) || "Étape";
  const screen = text(record.ecran);
  return SCREEN.test(screen)
    ? { label: label.slice(0, 500), screen }
    : { label: label.slice(0, 500) };
}

/** Début et étapes d'un parcours : `depart` et `etapes`, ou (JSON hérité) la première étape comme départ. */
function stepsOf(data: Json): { start: Step; steps: Step[] } {
  const steps = list(data.etapes).map(stepOf);
  if (isRecord(data.depart)) return { start: stepOf(data.depart), steps };
  const [first, ...rest] = steps;
  return { start: first ?? { label: text(data.titre) || "Début" }, steps: rest };
}

function errorsOf(data: Json): { step: number; text: string }[] {
  return list(data.erreurs).flatMap((entry) => {
    const record = isRecord(entry) ? entry : {};
    const step = record.etape;
    const message = text(record.texte);
    return typeof step === "number" && Number.isInteger(step) && step >= 1 && message !== ""
      ? [{ step, text: message.slice(0, 300) }]
      : [];
  });
}

const featuresOf = (value: unknown): string[] => texts(value).filter((id) => FEATURE.test(id));

/** Titre d'une règle indexée avant TK-103 (sans `titre`) : le début de l'énoncé. */
const ruleTitle = (data: Json, specId: string): string =>
  text(data.titre) || text(data.enonce).split("\n", 1)[0]?.slice(0, 120) || specId;

const ruleType = (data: Json): RuleDetail["type"] =>
  RULE_TYPES.find((type) => type === data.type) ?? "contrainte";

/** Ligne de liste d'un parcours (`kind: "flow"`) : étapes, erreurs et fonctionnalités liées. */
export function flowSummary(specId: string, path: string, data: Json): FunctionalItem {
  const { start, steps } = stepsOf(data);
  return {
    kind: "flow",
    specId,
    title: text(data.titre) || specId,
    actor: text(data.acteur),
    start,
    steps,
    errors: errorsOf(data),
    features: featuresOf(data.fonctionnalites),
    filePath: path,
  };
}

/** Ligne de liste d'une règle (`kind: "rule"`). */
export function ruleSummary(specId: string, path: string, data: Json): FunctionalItem {
  const example = texts(data.exemples)[0];
  return {
    kind: "rule",
    specId,
    title: ruleTitle(data, specId),
    type: ruleType(data),
    statement: text(data.enonce),
    ...(example === undefined ? {} : { example }),
    states: texts(data.etats),
    features: featuresOf(data.fonctionnalites),
    filePath: path,
  };
}

export const functionalItemOf = (
  kind: "rule" | "flow",
  row: { specId: string; path: string; data: unknown },
): FunctionalItem =>
  (kind === "rule" ? ruleSummary : flowSummary)(
    row.specId,
    row.path,
    isRecord(row.data) ? row.data : {},
  );

type Where = { filePath: string; commitSha: string };

export function ruleDetail(specId: string, data: unknown, where: Where): RuleDetail {
  const record = isRecord(data) ? data : {};
  return {
    specId,
    title: ruleTitle(record, specId),
    type: ruleType(record),
    statement: text(record.enonce),
    examples: texts(record.exemples),
    states: texts(record.etats),
    features: featuresOf(record.fonctionnalites),
    tables: texts(record.tables),
    endpoints: texts(record.endpoints),
    ...where,
  };
}

export function flowDetail(specId: string, data: unknown, where: Where): FlowDetail {
  const record = isRecord(data) ? data : {};
  const { start, steps } = stepsOf(record);
  return {
    specId,
    title: text(record.titre) || specId,
    actor: text(record.acteur),
    start,
    steps,
    errors: errorsOf(record),
    features: featuresOf(record.fonctionnalites),
    ...where,
  };
}

/** Rôle `id` du fichier de rôles indexé, ou `null` s'il n'y figure pas. */
export function roleDetail(specId: string, file: unknown, where: Where): RoleDetail | null {
  const role = list(isRecord(file) ? file.roles : []).find(
    (entry): entry is Json => isRecord(entry) && entry.id === specId,
  );
  if (role === undefined) return null;
  const restrictions = isRecord(role.restrictions) ? role.restrictions : {};
  return {
    specId,
    name: text(role.nom),
    description: text(role.description),
    permissions: texts(role.permissions).map((id) => {
      const restriction = text(restrictions[id]);
      return restriction === "" ? { specId: id } : { specId: id, restriction };
    }),
    ...where,
  };
}

const MATRIX_MAX_ACTIONS = 200;
const OPEN_ALL_AT_MOST = 20;
const OPEN_GROUP_BELOW = 5;

type Permission = { id: string; label: string; resource: string };

function permissionsOf(file: Json): Permission[] {
  return list(file.permissions).flatMap((entry) => {
    const record = isRecord(entry) ? entry : {};
    const id = text(record.id);
    if (id === "") return [];
    const [fallback = ""] = id.slice("PM-".length).split(".");
    const resource = text(record.ressource) || fallback;
    const action = text(record.action);
    return [{ id, resource, label: text(record.libelle) || `${resource} · ${action || id}` }];
  });
}

/**
 * Matrice « Qui peut faire quoi » : les rôles, les groupes de ressources avec leur compte et les actions des groupes
 * ouverts. Au plus 20 actions : tout est ouvert ; au-delà : le groupe demandé et les groupes de moins de 5 actions.
 * `q` ne garde que les actions dont l'identifiant ou le libellé la contient (tout est alors ouvert, 200 au plus) ; `all`
 * ouvre tous les groupes (vue du client, qui lit le bloc entier).
 */
export function buildMatrix(
  file: unknown,
  options: { group?: string | undefined; q?: string | undefined; all?: boolean },
): RulesMatrix {
  const record = isRecord(file) ? file : {};
  const roles = list(record.roles).filter(isRecord);
  const needle = options.q?.trim().toLowerCase() ?? "";
  const all = permissionsOf(record).filter(
    (p) => needle === "" || `${p.id} ${p.label}`.toLowerCase().includes(needle),
  );
  const counts = new Map<string, number>();
  for (const permission of all) {
    counts.set(permission.resource, (counts.get(permission.resource) ?? 0) + 1);
  }
  const isOpen = (resource: string) =>
    options.all === true ||
    needle !== "" ||
    all.length <= OPEN_ALL_AT_MOST ||
    resource === options.group ||
    (counts.get(resource) ?? 0) < OPEN_GROUP_BELOW;
  const accessOf = (permission: Permission) =>
    roles.map((role) => {
      const roleId = text(role.id);
      const restrictions = isRecord(role.restrictions) ? role.restrictions : {};
      if (!texts(role.permissions).includes(permission.id))
        return { roleId, level: "denied" as const };
      const restriction = text(restrictions[permission.id]);
      return restriction === ""
        ? { roleId, level: "allowed" as const }
        : { roleId, level: "restricted" as const, restriction };
    });
  return {
    roles: roles.map((role) => ({
      specId: text(role.id),
      name: text(role.nom),
      ...(text(role.description) === "" ? {} : { description: text(role.description) }),
      permissionCount: texts(role.permissions).length,
    })),
    groups: [...counts].map(([resource, count]) => ({ resource, count, open: isOpen(resource) })),
    actions: all
      .filter((permission) => isOpen(permission.resource))
      .slice(0, MATRIX_MAX_ACTIONS)
      .map((permission) => ({
        specId: permission.id,
        label: permission.label,
        resource: permission.resource,
        access: accessOf(permission),
      })),
    total: all.length,
  };
}
