import type {
  SecurityAsvsReport,
  SecurityContextOutput,
  SecuritySummaryCard,
  ThreatDetail,
} from "@koklo/contract";
import { formatCount, type IconName } from "@koklo/ui";

/** Textes de la page Sécurité (maquette 15, design/screens/S-spec-security.md). */
export const SECURITY_TITLE = "Sécurité";
export const TABS_LABEL = "Sections de la sécurité";
export const SECURITY_ERROR_TITLE = "Impossible de charger la sécurité";
export const LIST_ERROR_TEXT = "Réessayez dans un instant.";
export const RETRY_LABEL = "Réessayer";

export const READY_TITLE = "L'agent peut proposer le modèle de menaces";
export const READY_TEXT =
  "Menaces, données sensibles, droits et exigences, à partir du technique validé. Rien n'est enregistré sans votre relecture.";
export const SECURITY_GENERATING =
  "L'agent prépare la sécurité : menaces, données, droits puis document. Les premières propositions arrivent avant la fin. Vous pouvez quitter la page.";
export const DIALOG_SUBTITLE = "Sécurité";
export const DIALOG_PLACEHOLDER = "ex. « regarde surtout le back-office »";

export const THREAT_CATEGORY_LABELS: Record<ThreatDetail["category"], string> = {
  spoofing: "Usurpation",
  unauthorized_access: "Accès non autorisé",
  data_leak: "Fuite de données",
  tampering: "Altération",
  abuse: "Abus",
  compliance: "Conformité",
};
export const SEVERITY_LABELS: Record<ThreatDetail["severity"], string> = {
  high: "Élevée",
  medium: "Moyenne",
  low: "Faible",
};
export const VERIFICATION_LABELS: Record<ThreatDetail["verification"], string> = {
  scenario: "Scénario d'abus (généré)",
  ci_check: "Contrôle de la CI",
  human_review: "Revue humaine",
};

// --- Menaces ---
export const THREAT_SEARCH_LABEL = "Rechercher une menace";
export const THREAT_CHIPS = [
  [undefined, "Toutes"],
  ["high", "Gravité élevée"],
  ["todo", "À traiter"],
  ["ci", "Vérifiées par la CI"],
] as const;
export const THREAT_NOUN = { one: "menace", other: "menaces" };
export const threatCountText = (total: number): string =>
  `${formatCount(total)} ${total >= 2 ? "menaces" : "menace"}`;
export const threatLineText = (treated: number, high: number): string =>
  `${formatCount(treated)} ${treated >= 2 ? "traitées" : "traitée"} · ${formatCount(high)} de gravité élevée`;
export const NO_THREAT_TITLE = "Aucune menace pour l'instant";
export const NO_THREAT_TEXT =
  "Une fiche par menace, rattachée à une fonctionnalité exposée, avec sa gravité, ses parades et sa vérification.";
export const NO_THREAT_MATCH = "Aucune menace ne correspond";
export const NO_MATCH_TEXT = "La recherche et les filtres portent sur toute la liste.";
export const CLEAR_SEARCH = "Effacer la recherche";

export const FICHE_LABEL = "Fiche de la menace";
export const WHAT_LABEL = "Ce qui peut arriver";
export const TODO_TEXT =
  "Aucune parade décidée. Une menace de gravité élevée sans parade bloque la validation du livrable.";
export const PROPOSE_MEASURE = "Proposer une parade";
export const measureInstruction = (id: string): string => `Proposer des parades pour ${id}`;
export const MEASURES_LABEL = "Parades";
export const ALL_SURFACES = "Toutes";
export const GENERATED_SCENARIO = "Scénario d'abus généré";
export const FICHE_VIEWS = [
  { value: "fiche", label: "Fiche" },
  { value: "scenario", label: "Scénario d'abus" },
] as const;

/** Mention sous la fiche : ce qui vérifie la menace (maquette 15 l.520). */
export function verificationSentence(
  threat: Pick<ThreatDetail, "id" | "status" | "verification" | "verificationDetail">,
): string {
  if (threat.status === "todo") {
    return "Aucune vérification tant que la parade n'est pas décidée.";
  }
  if (threat.verification === "scenario") {
    return `Scénario d'abus ${threat.id}, généré depuis cette fiche, joué en CI à chaque pull request.`;
  }
  const named = threat.verificationDetail ?? VERIFICATION_LABELS[threat.verification];
  return threat.verification === "ci_check"
    ? `${named} : bloque la fusion en cas d'échec.`
    : `Revue humaine : ${threat.verificationDetail ?? "à chaque modification concernée"}.`;
}

/** Ce que la vue « Scénario d'abus » écrit quand aucun scénario n'est généré. */
export const noScenarioText = (
  threat: Pick<ThreatDetail, "verification" | "verificationDetail">,
): string => {
  const by = threat.verification === "ci_check" ? "un contrôle de la CI" : "une revue humaine";
  const detail = threat.verificationDetail ? `\n# ${threat.verificationDetail}` : "";
  return `# Vérifiée par ${by}, pas par un scénario.${detail}`;
};

// --- Données sensibles ---
export const DATA_SEARCH_LABEL = "Rechercher une donnée";
export const UNDECIDED_CHIP = "À décider";
export const CLASSIFY_BUTTON = "Classer une donnée";
export const REGISTRY_BUTTON = "Registre RGPD";
export const REGISTRY_FAILED = "Le registre n'a pas pu être exporté. Réessayez.";
export const DATA_RULE =
  "Chaque champ du modèle de données est classé. Un nouveau champ non classé bloque la validation, et la CI refuse un journal qui contient un champ « Personnelle » ou « Contact » en clair.";
export const UNCLASSIFIED_NAME = "Champ non classé";
export const TO_DECIDE = "À décider";
export const NO_DATA_TITLE = "Aucune donnée à classer";
export const NO_DATA_TEXT =
  "Les champs du modèle de données apparaissent ici, à classer avec leur conservation.";
export const NO_DATA_MATCH = "Aucune donnée ne correspond";
export const DATA_NOUN = { one: "donnée", other: "données" };

const listOr = (values: readonly string[]): string => values.join(", ") || "à préciser";

/** Hébergement, sous-traitants et transferts du cahier technique ; « à préciser » si inconnu (B800). */
export function hostLine(context: SecurityContextOutput): string {
  const transfers = context.transfers ?? "transferts hors de l'Union européenne : à préciser";
  return `Hébergement : ${listOr(context.hosting)} · sous-traitants : ${listOr(context.subprocessors)} · ${transfers.replace(/\.$/, "")}.`;
}

// --- Droits ---
export const RIGHTS_INTRO =
  "Qui peut faire quoi, sur quelle ressource. La matrice part des rôles du cahier fonctionnel ; chaque case « non » ou restreinte devient un scénario d'abus vérifié en CI.";
export const OWNERSHIP_TITLE = "Règles de propriété";
export const NO_OWNERSHIP = "Aucune règle de propriété pour l'instant.";
export const ABUSE_TITLE = "Scénarios d'abus générés";
export const ABUSE_TEXT =
  "Un par case « non » ou restreinte de la matrice : chaque rôle essaie l'action interdite, et la CI vérifie le refus (403 ou 404).";
export const NO_ROLE_TITLE = "Aucun rôle dans le cahier fonctionnel";
export const NO_ROLE_TEXT =
  "Les rôles et leurs permissions viennent du cahier fonctionnel : la matrice les reprend.";

// --- Exigences ---
export const LEVEL_TITLE = "Niveau d'exigence · OWASP ASVS";
export const LEVEL_HELP =
  "La grille de référence de l'OWASP. Le niveau 2 est recommandé dès qu'une application garde des données personnelles.";
export const LEVEL_GROUP = "Niveau ASVS";
export const LEVEL_SAVED = "Niveau enregistré";
export const levelOptions = (recommended: number) =>
  ([1, 2, 3] as const).map((level) => ({
    value: String(level),
    label: `Niveau ${level}${level === recommended ? " · recommandé" : ""}`,
  }));
export const CHAPTER_LABELS: Record<SecurityAsvsReport["chapters"][number]["chapter"], string> = {
  authentication: "Authentification",
  sessions: "Sessions",
  access_control: "Contrôle d'accès",
  validation: "Validation et encodage",
  cryptography: "Cryptographie et secrets",
  logging: "Journalisation et alertes",
  data_protection: "Protection des données",
  configuration: "Configuration et dépendances",
  api: "API et services web",
};
export const SECRETS_TITLE = "Secrets et dépendances";
export const SECRETS_EMPTY = "À préciser";
export const GATES_TITLE = "Une pull request ne fusionne pas si…";
export const GATES = [
  "un secret apparaît dans le code ou dans l'historique ;",
  "une dépendance a une vulnérabilité critique connue ;",
  "l'analyse statique trouve une faille de gravité haute ;",
  "un scénario d'abus échoue (une case « non » de la matrice devient possible) ;",
  "une opération de l'API ne déclare pas sa permission, ou un champ classé apparaît en clair dans un journal.",
];
export const GATES_NOTE =
  "Les tickets marqués « sensible » au découpage vont à un humain ou demandent deux relectures.";

// --- Résumé client ---
export const CARD_ICONS: Record<SecuritySummaryCard["key"], IconName> = {
  location: "location_on",
  protection: "lock",
  access: "group",
  signIn: "key",
  retention: "schedule",
  checks: "verified",
  incident: "campaign",
};
export const CARD_TITLES: Record<SecuritySummaryCard["key"], string> = {
  location: "Où sont les données",
  protection: "Ce qui est protégé",
  access: "Qui voit quoi",
  signIn: "Comment on se connecte",
  retention: "Combien de temps on garde",
  checks: "Ce qui est vérifié à chaque modification",
  incident: "En cas d'incident",
};
export const TEAM_INTRO =
  "C'est ce que lit le client, et ce qui est repris dans la baseline 0. Il ne valide pas ce livrable : il valide la baseline, résumé compris.";
export const CLIENT_INTRO =
  "Voici, en clair, comment votre produit protège vos données et celles de vos utilisateurs. Une question ? Posez-la, l'équipe vous répond.";
export const BUSINESS_INTRO =
  "Voici, en clair, comment le produit protège les données du client et de ses utilisateurs.";
export const UPDATE_SUMMARY = "Mettre à jour avec l'agent";
export const SUMMARY_PREPARING = "L'agent prépare le résumé client.";
export const SUMMARY_SAVED = "Résumé client mis à jour";
export const SUMMARY_REJECTED = "Proposition rejetée";
export const ACTION_FAILED = "L'action a échoué. Réessayez dans un instant.";
export const NO_SUMMARY_TITLE = "Aucun résumé pour l'instant";
export const NO_SUMMARY_TEXT =
  "L'agent rédige le résumé en mots simples, sans identifiants, depuis le livrable Sécurité.";
export const summaryFoot = (reviewed?: string): string =>
  `Résumé rédigé depuis le livrable Sécurité${reviewed ? `, relu par l'équipe le ${reviewed}` : ""} · sans identifiants techniques.`;

export const EXPECTATION_TITLE = "Ce que nous attendons de vous";
export const CONTACT_MISSING =
  "Le nom et le téléphone de la personne à prévenir chez vous en cas d'incident, de jour comme de nuit.";
export const contactText = (contact: { name: string; phone: string }): string =>
  `Contact en cas d'incident : ${contact.name}, ${contact.phone}. Merci.`;
export const CONTACT_ADD = "Indiquer un contact";
export const CONTACT_EDIT = "Modifier";
export const CONTACT_SAVED = "Contact enregistré";
export const CONTACT_FAILED = "Le contact n'a pas pu être enregistré. Réessayez.";

export const ASK_BUTTON = "Poser une question";
export const QUESTION_TITLE = "Votre question à l'équipe";
export const QUESTION_PLACEHOLDER = "ex. « Qui peut voir mes coordonnées ? »";
export const QUESTION_SENT = "Question envoyée à l'équipe";
export const QUESTION_FAILED = "La question n'a pas pu être envoyée. Réessayez.";

export const CLIENT_STATUS = "Résumé pour vous";
export const CLIENT_LEAD =
  "L'équipe valide ce livrable ; vous en lisez le résumé, repris dans la baseline 0.";
export const CLIENT_TAB = "Résumé";
export const NOT_VALIDATED_TITLE = "La sécurité est en cours de validation par l'équipe";
export const NOT_VALIDATED_TEXT = "Le résumé apparaît ici dès que l'équipe a validé le livrable.";

// --- À revoir ---
export const STALE_LEAD = "Le cahier technique a changé depuis la validation";
export const STALE_CLOSED_TEXT = "Revalidez le technique pour relancer l'agent.";
export const updateInstruction = (ids: string): string =>
  `Mettre la sécurité à jour d'après ${ids}`;

// --- Document ---
export const DOC_EMPTY = "Aucune section pour l'instant : l'agent peut rédiger le dossier.";
export const DOC_ACTIONS = [
  {
    icon: "edit_note",
    label: "Rédiger les sections à rédiger",
    mode: "threats",
    instruction: "Rédiger les sections à rédiger du dossier de sécurité",
  },
  {
    icon: "fact_check",
    label: "Vérifier la cohérence avec les menaces",
    mode: "threats",
    instruction: "Vérifier la cohérence du dossier de sécurité avec les menaces",
  },
  {
    icon: "summarize",
    label: "Mettre à jour le résumé client",
    mode: "summary",
    instruction: "Mettre à jour le résumé client",
  },
] as const;

export const THREAT_SAVED = "Menace enregistrée";
export const DATA_SAVED = "Donnée classée";
export const VALIDATED_ANNOUNCE = "Sécurité validée";
