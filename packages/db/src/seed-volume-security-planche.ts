/**
 * Les 18 menaces de la planche « Volume réel » de la Sécurité (maquette 15, TK-117) : surface, gravité, risque, parades et
 * vérification. `SEC-T08` est élevée sans parade. Données fictives.
 */
type Severity = "elevee" | "moyenne" | "faible";
type Category =
  | "usurpation"
  | "acces_non_autorise"
  | "fuite_donnees"
  | "alteration"
  | "abus"
  | "conformite";

type Row = readonly [
  string,
  string,
  Category,
  Severity,
  readonly string[],
  "scenario" | "controle_ci",
];

const THREATS: readonly Row[] = [
  [
    "Lien de connexion intercepté ou réutilisé",
    "F-009",
    "usurpation",
    "elevee",
    [
      "Lien à usage unique, valable 15 minutes.",
      "Seule une empreinte du jeton est gardée en base.",
    ],
    "scenario",
  ],
  [
    "Envoi massif de liens vers un numéro",
    "F-009",
    "abus",
    "moyenne",
    ["3 liens par numéro toutes les 15 minutes."],
    "scenario",
  ],
  [
    "Deviner si un numéro est celui d'une cliente",
    "F-009",
    "fuite_donnees",
    "faible",
    ["Même réponse et même délai pour tout numéro."],
    "scenario",
  ],
  [
    "Réservations factices en masse",
    "F-004",
    "abus",
    "moyenne",
    ["Code reçu par SMS avant confirmation."],
    "scenario",
  ],
  [
    "Code injecté dans le nom ou la note",
    "F-004",
    "alteration",
    "moyenne",
    ["Chaque entrée est validée par son schéma."],
    "scenario",
  ],
  [
    "Annuler le rendez-vous d'une autre cliente",
    "F-007",
    "acces_non_autorise",
    "elevee",
    ["Jeton opaque dans le lien du SMS."],
    "scenario",
  ],
  [
    "Une coiffeuse lit tout le fichier clients",
    "F-010",
    "acces_non_autorise",
    "moyenne",
    ["Une coiffeuse ne voit que ses clientes du jour."],
    "scenario",
  ],
  [
    "Export du fichier clients par un compte volé",
    "F-012",
    "fuite_donnees",
    "elevee",
    [],
    "scenario",
  ],
  [
    "Effacement incomplet d'une cliente",
    "F-012",
    "conformite",
    "moyenne",
    ["Effacement en cascade."],
    "scenario",
  ],
  [
    "Clé du fournisseur SMS exposée",
    "api",
    "fuite_donnees",
    "elevee",
    ["Secrets injectés au déploiement."],
    "controle_ci",
  ],
  [
    "Opération ouverte sans permission",
    "api",
    "acces_non_autorise",
    "elevee",
    ["Chaque opération déclare sa permission."],
    "controle_ci",
  ],
  [
    "Session restée ouverte sur l'ordinateur du salon",
    "F-010",
    "usurpation",
    "moyenne",
    ["Session fermée après 30 minutes d'inactivité."],
    "scenario",
  ],
  [
    "Requête forgée depuis un autre site",
    "F-010",
    "alteration",
    "moyenne",
    ["Jeton anti-falsification sur chaque écriture."],
    "scenario",
  ],
  [
    "Téléphones écrits dans les journaux",
    "api",
    "fuite_donnees",
    "moyenne",
    ["Champs personnels masqués dans les journaux."],
    "controle_ci",
  ],
  [
    "Sauvegarde accessible publiquement",
    "api",
    "fuite_donnees",
    "elevee",
    ["Sauvegardes chiffrées et privées."],
    "controle_ci",
  ],
  [
    "Bibliothèque vulnérable",
    "api",
    "alteration",
    "moyenne",
    ["Mises à jour proposées chaque semaine."],
    "controle_ci",
  ],
  [
    "Prise de contrôle du compte de la gérante",
    "F-010",
    "usurpation",
    "elevee",
    ["Second facteur obligatoire pour la gérante."],
    "scenario",
  ],
  [
    "Réservation faite à la place de quelqu'un",
    "F-004",
    "usurpation",
    "faible",
    ["Code de confirmation envoyé au numéro saisi."],
    "scenario",
  ],
];

/** Une menace au format d'index ; son rang est sa position dans la planche. */
export const PLANCHE_THREATS = THREATS.map(
  ([titre, surface, categorie, gravite, parades, mode], index) => ({
    id: `SEC-T${String(index + 1).padStart(2, "0")}`,
    titre,
    surfaces: [surface],
    categorie,
    gravite,
    risque: `${titre} : les données du salon ou de ses clientes sont exposées.`,
    parades,
    verification: { mode },
    liens: [],
  }),
);

export const PLANCHE_RIGHTS = {
  titre: "Matrice des droits",
  matrice: [],
  restrictions: [],
  propriete: [
    "Toute lecture vérifie que la ressource appartient au salon du compte connecté.",
    "Une cliente n'accède à un rendez-vous que par sa session ou le lien reçu.",
    "Aucun agent de code n'accède aux données de production.",
  ],
};

export const PLANCHE_ASVS = {
  titre: "Exigences ASVS",
  exigences: [
    {
      id: "EX-001",
      chapitre: "authentification",
      titre: "Lien à usage unique",
      niveau: 1,
      reponse: "Technique",
    },
    {
      id: "EX-002",
      chapitre: "sessions",
      titre: "Expiration des sessions",
      niveau: 1,
      reponse: "Technique",
    },
    { id: "EX-003", chapitre: "journalisation", titre: "Journal d'audit", niveau: 2 },
  ],
  secrets_et_dependances: [
    { libelle: "Secrets", valeur: "Gestionnaire de secrets, injectés au déploiement." },
    { libelle: "Dépendances", valeur: "Mises à jour proposées chaque semaine." },
  ],
};

export const PLANCHE_SUMMARY = {
  titre: "Résumé client",
  donnees: "Chez l'hébergeur, à Paris. Rien ne sort de l'Union européenne.",
  protection: "Les téléphones et e-mails de vos clientes sont chiffrés.",
  acces: "Une cliente ne voit que ses rendez-vous.",
  connexion: "Vos clientes reçoivent un lien valable 15 minutes, utilisable une seule fois.",
  conservation: "À décider",
  verification: "Des tests d'abus à chaque modification.",
  incident: "Nous vous prévenons sous 24 heures. La CNIL est prévenue sous 72 heures.",
};
