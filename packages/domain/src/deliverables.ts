/**
 * Disponibilité des sept livrables de la spec (TK-100, B1 et B325 i), règle pure. La liste ordonnée des clés vit dans
 * `@koklo/contract` (`DELIVERABLE_KEYS`), que le domaine n'importe pas : ce graphe en porte les clés dans le même ordre
 * (Sécurité en 5e), et un test de parité de l'API vérifie l'égalité des deux.
 */
export type DeliverableKey =
  | "functional"
  | "data"
  | "architecture"
  | "technical"
  | "security"
  | "design"
  | "quality";

export type DeliverableStatus = "todo" | "pending" | "revise" | "validated";

/** Amont de chaque livrable (B1) : ce qui doit être prêt pour qu'il s'ouvre. */
export const DELIVERABLE_DEPENDENCIES: Readonly<Record<DeliverableKey, readonly DeliverableKey[]>> =
  {
    functional: [],
    data: ["functional"],
    architecture: ["data"],
    technical: ["architecture"],
    security: ["technical"],
    design: ["functional"],
    quality: ["technical", "security", "design"],
  };

/** Livrables que le Fonctionnel suffit à ouvrir dès qu'il contient une entité (comportement de B77). */
const OPENED_BY_ENTITY: readonly DeliverableKey[] = ["data", "design"];

const AFTER: Readonly<Record<DeliverableKey, string>> = {
  functional: "la première version de l'idée",
  data: "le fonctionnel",
  architecture: "les données",
  technical: "l'architecture",
  security: "le technique",
  design: "le fonctionnel",
  quality: "le technique, la sécurité et le design",
};

/** Ce qui précède un livrable, dit à l'utilisateur quand il est verrouillé (« Disponible après … »). */
export const deliverableAfterOf = (key: DeliverableKey): string => AFTER[key];

export const deliverableConditionOf = (key: DeliverableKey): string =>
  `Disponible après ${AFTER[key]}`;

export interface DeliverableFacts {
  /** Une version `idea-vN` est commitée. */
  ideaFrozen: boolean;
  /** Le Fonctionnel contient au moins une entité indexée. */
  functionalHasEntity: boolean;
  /** Statut de chaque livrable, fourni par la source de statuts (lot B : validation par élément). */
  statuses: Readonly<Record<DeliverableKey, DeliverableStatus>>;
  /** Livrables ouverts par un forçage (owner ou admin) : ouverts, jamais validés. */
  forced: readonly DeliverableKey[];
}

export interface DeliverableAvailability {
  key: DeliverableKey;
  status: DeliverableStatus;
  available: boolean;
  forced: boolean;
  /** « Disponible après … » tant que le livrable est fermé, `null` sinon. */
  condition: string | null;
}

function openByRule(key: DeliverableKey, facts: DeliverableFacts): boolean {
  if (key === "functional") return facts.ideaFrozen || facts.functionalHasEntity;
  if (OPENED_BY_ENTITY.includes(key)) return facts.functionalHasEntity;
  return DELIVERABLE_DEPENDENCIES[key].every(
    (upstream) => facts.statuses[upstream] === "validated",
  );
}

/** Les sept livrables dans l'ordre du graphe, avec disponibilité et condition ; un forçage ouvre sans valider. */
export function deliverablesAvailabilityOf(facts: DeliverableFacts): DeliverableAvailability[] {
  return (Object.keys(DELIVERABLE_DEPENDENCIES) as DeliverableKey[]).map((key) => {
    const forced = facts.forced.includes(key);
    const available = forced || openByRule(key, facts);
    return {
      key,
      status: facts.statuses[key],
      available,
      forced,
      condition: available ? null : deliverableConditionOf(key),
    };
  });
}

/** Genres d'entités indexées (`spec_entities.kind`) qui composent chaque livrable (B325 c) ; les autres zones n'ont encore rien d'indexé. */
export const DELIVERABLE_ENTITY_KINDS: Readonly<Record<DeliverableKey, readonly string[]>> = {
  functional: ["feature", "rule", "roles", "flow"],
  data: ["table", "relations"],
  architecture: [],
  technical: [],
  security: [],
  design: [],
  quality: [],
};

/** Validation d'une cible au regard de son contenu courant (même vocabulaire que l'espace client). */
export type TargetValidation = "validated" | "to_validate" | "to_revise";

export interface DeliverableValidationFacts {
  /** Le livrable contient au moins une entité indexée. */
  hasEntity: boolean;
  /** Validation de chaque cible élément ou bloc du livrable (feature, parcours, règles, rôles). */
  targets: readonly TargetValidation[];
  /** Validation de la cible « livrable entier ». */
  whole: TargetValidation;
}

/**
 * Statut d'un livrable d'après ses validations : « À faire » sans entité ; « À revoir » si une demande de changement
 * est encore d'actualité ; « Validé » quand le livrable entier, ou toutes ses cibles, sont validés sur le contenu
 * courant ; « À valider » sinon.
 */
export function deliverableStatusOf(facts: DeliverableValidationFacts): DeliverableStatus {
  if (!facts.hasEntity) return "todo";
  const all = [...facts.targets, facts.whole];
  if (all.includes("to_revise")) return "revise";
  const everyTarget = facts.targets.length > 0 && facts.targets.every((t) => t === "validated");
  return facts.whole === "validated" || everyTarget ? "validated" : "pending";
}
