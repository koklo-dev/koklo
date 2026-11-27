/** Données de la maquette 15 (menaces l.473-492, données l.527-536, droits l.545-549, exigences l.553, résumé l.562-568). */
export interface ThreatRow {
  id: string;
  surface: string;
  title: string;
  category: string;
  severity: string;
  risk: string;
  measures: string[];
  verification: string;
  links: string[];
  when: string;
  expected: string;
  detail?: string;
}
export interface DataRow {
  field: string;
  fields: string[];
  data: string;
  category?: string;
  access: string[];
  protection: string;
  retention?: string;
  retentionSuggestion?: string;
}

export const SURFACES: Record<string, string> = {
  "F-004": "Réserver en ligne",
  "F-007": "Annuler ou déplacer par le lien du SMS",
  "F-009": "Connexion par lien magique",
  "F-010": "Agenda et back-office du salon",
  "F-012": "Fichier clients et RGPD",
  api: "API, secrets et intégrations",
};

export const THREATS: ThreatRow[] = [
  {
    id: "SEC-T04",
    surface: "F-004",
    title: "Réservations factices en masse",
    category: "abuse",
    severity: "medium",
    risk: "Quelqu'un bloque tous les créneaux du samedi avec de faux noms.",
    measures: [
      "Une réservation n'est confirmée qu'après le code reçu par SMS.",
      "2 réservations à venir au plus par numéro.",
      "Alerte au salon au-delà de 10 réservations par heure.",
    ],
    verification: "scenario",
    links: ["reservation.create", "R-005"],
    when: "un numéro tente une 3e réservation à venir",
    expected: "la réservation est refusée avec un message clair",
  },
  {
    id: "SEC-T05",
    surface: "F-004",
    title: "Code injecté dans le nom ou la note",
    category: "tampering",
    severity: "medium",
    risk: "Un nom contenant du code s'exécute quand l'accueil ouvre l'agenda.",
    measures: [
      "Chaque entrée est validée par son schéma (longueur, caractères).",
      "Tout texte est échappé à l'affichage ; aucune insertion de HTML brut.",
      "Requêtes paramétrées uniquement.",
    ],
    verification: "scenario",
    links: ["reservation.create", "S-agenda"],
    when: "une cliente s'appelle « <img src=x onerror=alert(1)> »",
    expected: "l'agenda affiche le texte tel quel, sans l'exécuter",
  },
  {
    id: "SEC-T18",
    surface: "F-004",
    title: "Réservation faite à la place de quelqu'un",
    category: "spoofing",
    severity: "low",
    risk: "Quelqu'un réserve au nom et au numéro d'une autre personne.",
    measures: ["Code de confirmation envoyé au numéro saisi."],
    verification: "scenario",
    links: ["reservation.create"],
    when: "une réservation est faite avec le numéro de Camille",
    expected: "Camille reçoit le code et la réservation attend sa confirmation",
  },
  {
    id: "SEC-T06",
    surface: "F-007",
    title: "Annuler le rendez-vous d'une autre cliente",
    category: "unauthorized_access",
    severity: "high",
    risk: "En changeant l'identifiant dans le lien du SMS, une cliente annule ou déplace le rendez-vous de quelqu'un d'autre.",
    measures: [
      "Le lien porte un jeton opaque de 64 caractères, jamais l'identifiant du rendez-vous.",
      "L'API vérifie que le rendez-vous appartient à la session ou au jeton.",
      "Réponse 404 identique pour « inexistant » et « pas à vous ».",
    ],
    verification: "scenario",
    links: ["reservation.cancel", "reservation.move", "R-003"],
    when: "Camille appelle reservation.cancel avec l'identifiant du rendez-vous d'Inès",
    expected: "la réponse est 404 et le rendez-vous d'Inès reste confirmé",
  },
  {
    id: "SEC-T01",
    surface: "F-009",
    title: "Lien de connexion intercepté ou réutilisé",
    category: "spoofing",
    severity: "high",
    risk: "Quelqu'un récupère un lien de connexion (SMS transféré, capture d'écran) et s'en sert pour entrer dans le compte de la cliente.",
    measures: [
      "Lien à usage unique, valable 15 minutes (F-009 · AC-2).",
      "Seule une empreinte du jeton est gardée en base, jamais le jeton.",
      "Une nouvelle connexion est signalée par SMS à la cliente.",
    ],
    verification: "scenario",
    links: ["auth.magicLink", "liens.jeton_hash"],
    when: "le lien de Camille est utilisé une deuxième fois",
    expected: "la connexion est refusée avec « Ce lien a déjà servi »",
  },
  {
    id: "SEC-T02",
    surface: "F-009",
    title: "Envoi massif de liens vers un numéro",
    category: "abuse",
    severity: "medium",
    risk: "Un script demande des centaines de liens pour un même numéro : la cliente est harcelée et le salon paie les SMS.",
    measures: [
      "3 liens par numéro toutes les 15 minutes, 20 par adresse IP et par heure.",
      "Vérification anti-robot à partir du 4e essai.",
      "Alerte au salon si la dépense SMS du jour double.",
    ],
    verification: "scenario",
    links: ["auth.magicLink", "NFR-011"],
    when: "un même numéro demande un 4e lien en 10 minutes",
    expected: "la réponse est 429 et aucun SMS ne part",
  },
  {
    id: "SEC-T03",
    surface: "F-009",
    title: "Deviner si un numéro est celui d'une cliente",
    category: "data_leak",
    severity: "low",
    risk: "En demandant un lien, on apprend si un numéro est connu du salon.",
    measures: ["Même réponse et même délai, que le numéro soit connu ou non."],
    verification: "scenario",
    links: ["auth.magicLink"],
    when: "un numéro inconnu demande un lien",
    expected: "le message est identique à celui d'un numéro connu",
  },
  {
    id: "SEC-T07",
    surface: "F-010",
    title: "Une coiffeuse lit tout le fichier clients",
    category: "unauthorized_access",
    severity: "medium",
    risk: "Un compte de coiffeuse consulte ou copie les coordonnées de toutes les clientes.",
    measures: [
      "Une coiffeuse ne voit que les clientes de son agenda du jour (matrice des droits).",
      "Les listes sont paginées par 50 ; pas d'export pour ce rôle.",
    ],
    verification: "scenario",
    links: ["RL-coiffeuse", "client.list"],
    when: "Awa (coiffeuse) appelle client.list sans filtre",
    expected: "seules ses 6 clientes du jour sont renvoyées",
  },
  {
    id: "SEC-T12",
    surface: "F-010",
    title: "Session restée ouverte sur l'ordinateur du salon",
    category: "spoofing",
    severity: "medium",
    risk: "L'ordinateur de l'accueil reste connecté ; quelqu'un de passage consulte les clientes.",
    measures: [
      "Session de l'équipe fermée après 30 minutes d'inactivité.",
      "Écran verrouillé par code à 4 chiffres pour reprendre la session.",
    ],
    verification: "scenario",
    links: ["S-agenda", "NFR-007"],
    when: "la session de l'accueil est inactive depuis 31 minutes",
    expected: "le code est demandé avant d'afficher l'agenda",
  },
  {
    id: "SEC-T13",
    surface: "F-010",
    title: "Requête forgée depuis un autre site",
    category: "tampering",
    severity: "medium",
    risk: "Un site piégé fait annuler des rendez-vous par le navigateur de la gérante connectée.",
    measures: [
      "Cookies de session SameSite=Strict.",
      "Jeton anti-falsification sur chaque écriture.",
    ],
    verification: "scenario",
    links: ["reservation.cancel"],
    when: "une page externe envoie une annulation avec la session de la gérante",
    expected: "la requête est refusée (403)",
  },
  {
    id: "SEC-T17",
    surface: "F-010",
    title: "Prise de contrôle du compte de la gérante",
    category: "spoofing",
    severity: "high",
    risk: "Quelqu'un obtient l'accès à la boîte mail de la gérante et se connecte à sa place.",
    measures: [
      "Second facteur obligatoire pour la gérante (application d'authentification).",
      "Connexion depuis un nouvel appareil signalée par e-mail et SMS.",
    ],
    verification: "scenario",
    links: ["RL-gerante"],
    when: "la gérante se connecte depuis un nouvel appareil",
    expected: "le second facteur est demandé et une alerte part",
  },
  {
    id: "SEC-T08",
    surface: "F-012",
    title: "Export du fichier clients par un compte volé",
    category: "data_leak",
    severity: "high",
    risk: "Avec le compte de la gérante, quelqu'un exporte les 2 400 clientes et leurs téléphones.",
    measures: [],
    verification: "scenario",
    links: ["client.export", "RL-gerante"],
    when: "le compte de la gérante exporte le fichier clients",
    expected: "un second facteur est demandé et la gérante est prévenue",
  },
  {
    id: "SEC-T09",
    surface: "F-012",
    title: "Effacement incomplet d'une cliente",
    category: "compliance",
    severity: "medium",
    risk: "Après une demande d'effacement, des données restent dans les rappels SMS ou les sauvegardes.",
    measures: [
      "Effacement en cascade : rendez-vous, notes, journaux.",
      "Demande d'effacement transmise au fournisseur SMS.",
      "Les sauvegardes expirent sous 30 jours.",
    ],
    verification: "scenario",
    links: ["client.erase", "clients.telephone"],
    when: "Camille demande l'effacement de ses données",
    expected: "aucune ligne ne la cite plus, hors journal d'effacement anonyme",
  },
  {
    id: "SEC-T10",
    surface: "api",
    title: "Clé du fournisseur SMS exposée",
    category: "data_leak",
    severity: "high",
    risk: "La clé du fournisseur SMS se retrouve dans le dépôt ou dans un journal, et sert à envoyer des SMS aux frais du salon.",
    measures: [
      "Secrets dans le gestionnaire de secrets, injectés au déploiement.",
      "Détection de secrets sur chaque pull request et sur l'historique.",
      "Rotation tous les 90 jours et au départ d'un membre.",
    ],
    verification: "ci_check",
    links: ["ST-sms", "ENV-prod"],
    when: "",
    expected: "",
    detail: "Contrôle de la CI · secrets",
  },
  {
    id: "SEC-T11",
    surface: "api",
    title: "Opération ouverte sans permission",
    category: "unauthorized_access",
    severity: "high",
    risk: "Une nouvelle opération de l'API est publiée sans vérifier le rôle de l'appelant.",
    measures: [
      "Chaque opération déclare sa permission dans api/endpoints.",
      "La CI refuse une opération sans permission déclarée.",
    ],
    verification: "ci_check",
    links: ["ST-api"],
    when: "",
    expected: "",
    detail: "Contrôle de la CI · contrat",
  },
  {
    id: "SEC-T14",
    surface: "api",
    title: "Téléphones écrits dans les journaux",
    category: "data_leak",
    severity: "medium",
    risk: "Les journaux d'erreur contiennent les téléphones des clientes et sont lus par trop de monde.",
    measures: [
      "Champs « Personnelle » et « Contact » masqués automatiquement dans les journaux.",
      "La CI refuse un journal qui contient un champ classé en clair.",
    ],
    verification: "ci_check",
    links: ["journaux.ip"],
    when: "",
    expected: "",
    detail: "Contrôle de la CI · journaux",
  },
  {
    id: "SEC-T15",
    surface: "api",
    title: "Sauvegarde accessible publiquement",
    category: "data_leak",
    severity: "high",
    risk: "Une sauvegarde de la base est déposée dans un espace de stockage ouvert.",
    measures: [
      "Sauvegardes chiffrées, dans un espace privé.",
      "Vérification de la configuration à chaque déploiement.",
    ],
    verification: "ci_check",
    links: ["ENV-prod", "NFR-008"],
    when: "",
    expected: "",
    detail: "Contrôle de la CI · infrastructure",
  },
  {
    id: "SEC-T16",
    surface: "api",
    title: "Bibliothèque vulnérable",
    category: "tampering",
    severity: "medium",
    risk: "Une dépendance de l'application a une faille connue, exploitée à distance.",
    measures: [
      "Mises à jour proposées chaque semaine.",
      "Vulnérabilité critique corrigée sous 7 jours ; la CI bloque une dépendance critique.",
    ],
    verification: "ci_check",
    links: ["ST-api"],
    when: "",
    expected: "",
    detail: "Contrôle de la CI · dépendances",
  },
];

export const DATA: DataRow[] = [
  {
    field: "clients.nom",
    fields: ["clients.nom", "clients.prenom"],
    data: "Nom et prénom de la cliente",
    category: "personal",
    access: ["Accueil", "gérante", "coiffeuse pour ses rendez-vous"],
    protection: "Masqués dans les journaux",
    retention: "3 ans après le dernier rendez-vous",
  },
  {
    field: "clients.telephone",
    fields: ["clients.telephone"],
    data: "Téléphone",
    category: "contact",
    access: ["Accueil", "gérante", "coiffeuse pour ses rendez-vous"],
    protection: "Chiffré au repos · masqué dans les journaux",
    retention: "3 ans après le dernier rendez-vous",
  },
  {
    field: "clients.email",
    fields: ["clients.email"],
    data: "E-mail",
    category: "contact",
    access: ["Accueil", "gérante"],
    protection: "Chiffré au repos · masqué dans les journaux",
    retention: "3 ans après le dernier rendez-vous",
  },
  {
    field: "reservations.note",
    fields: ["reservations.note"],
    data: "Note de rendez-vous",
    category: "sensitive",
    access: ["Coiffeuse du rendez-vous"],
    protection: "Peut contenir une allergie ou un problème de peau",
    retentionSuggestion: "1 an",
  },
  {
    field: "reservations.client_id",
    fields: ["reservations.client_id", "reservations.creneau_id"],
    data: "Historique des rendez-vous",
    category: "personal",
    access: ["Accueil", "gérante", "la cliente pour les siens"],
    protection: "Aucune donnée de paiement",
    retention: "3 ans",
  },
  {
    field: "liens.jeton_hash",
    fields: ["liens.jeton_hash"],
    data: "Jeton de lien magique",
    category: "secret",
    access: ["Personne (système)"],
    protection: "Empreinte SHA-256 seulement, jamais le jeton",
    retention: "15 minutes",
  },
  {
    field: "journaux.ip",
    fields: ["journaux.ip"],
    data: "Adresse IP des connexions",
    category: "technical",
    access: ["Équipe technique"],
    protection: "Accès journalisé",
    retention: "6 mois",
  },
  {
    field: "employes.email",
    fields: ["employes.email", "employes.telephone"],
    data: "Comptes de l'équipe",
    category: "contact",
    access: ["Gérante"],
    protection: "Second facteur pour la gérante",
    retention: "Contrat + 1 an",
  },
];

export const ROLES: Array<[id: string, name: string]> = [
  ["RL-cliente", "Cliente"],
  ["RL-coiffeuse", "Coiffeuse"],
  ["RL-accueil", "Accueil"],
  ["RL-gerante", "Gérante"],
];

export const ACTIONS: Array<[id: string, label: string, cells: string[]]> = [
  ["PM-reservation.lire", "Voir des rendez-vous", ["Les siens", "Son agenda", "y", "y"]],
  ["PM-reservation.creer", "Créer un rendez-vous", ["Pour elle", "n", "Pour une cliente", "y"]],
  ["PM-reservation.modifier", "Annuler ou déplacer", ["Les siens, à plus de 24 h", "n", "y", "y"]],
  ["PM-client.lire", "Lire le fichier clients", ["n", "Ses clientes du jour", "y", "y"]],
  ["PM-client.exporter", "Exporter le fichier clients", ["n", "n", "n", "y"]],
  ["PM-client.effacer", "Effacer une cliente (RGPD)", ["Ses propres données", "n", "n", "y"]],
  ["PM-horaire.modifier", "Horaires et fermetures", ["n", "Les siens", "y", "y"]],
  ["PM-reglage.modifier", "Équipe, réglages, facturation SMS", ["n", "n", "n", "y"]],
];

export const OWNERSHIP = [
  "Toute lecture vérifie que la ressource appartient au salon du compte connecté.",
  "Une cliente n'accède à un rendez-vous que par sa session ou le jeton du SMS, jamais par son identifiant.",
  "La CI refuse une opération de l'API qui ne déclare pas sa permission.",
  "Aucun agent de code n'a de rôle ici : ils n'accèdent jamais aux données de production.",
];

export const ASVS_ROWS: Array<[chapter: string, total: number, missing: number, where: string]> = [
  ["authentication", 14, 0, "Technique · F-009 · SEC-T01, T17"],
  ["sessions", 9, 0, "NFR-007 · SEC-T12"],
  ["access_control", 11, 1, "Matrice des droits · SEC-T06, T08"],
  ["validation", 12, 0, "Schémas de l'API · SEC-T05"],
  ["cryptography", 7, 0, "Secrets et dépendances · SEC-T10"],
  ["logging", 8, 2, "Exigences · journal d'audit à préciser"],
  ["data_protection", 9, 1, "Données sensibles · RGPD"],
  ["configuration", 6, 0, "SEC-T15, T16"],
  ["api", 9, 0, "Contrat de l'API · SEC-T11"],
];

export const FACTS = [
  {
    label: "Secrets",
    value:
      "Gestionnaire de secrets Scaleway, injectés au déploiement ; aucun secret dans le dépôt ni dans la spec.",
  },
  {
    label: "Rotation",
    value: "Clés des fournisseurs tous les 90 jours, et tout de suite au départ d'un membre.",
  },
  {
    label: "Dépendances",
    value: "Mises à jour proposées chaque semaine ; vulnérabilité critique corrigée sous 7 jours.",
  },
  {
    label: "Production",
    value: "Accès réservé à Moussa et à la gérante ; aucun agent.",
  },
];

export const CARDS = [
  {
    key: "location",
    title: "Où sont les données",
    text: "Chez Scaleway, à Paris. Les SMS et e-mails passent par Brevo, en France. Rien ne sort de l'Union européenne.",
  },
  {
    key: "protection",
    title: "Ce qui est protégé",
    text: "Les téléphones et e-mails de vos clientes sont chiffrés et n'apparaissent jamais dans les journaux techniques.",
  },
  {
    key: "access",
    title: "Qui voit quoi",
    text: "Une cliente ne voit que ses rendez-vous. Une coiffeuse voit son agenda et ses clientes du jour. Seule la gérante exporte le fichier clients, et chaque export lui est signalé.",
  },
  {
    key: "signIn",
    title: "Comment on se connecte",
    text: "Vos clientes reçoivent un lien valable 15 minutes, utilisable une seule fois. La gérante confirme sa connexion avec un code sur son téléphone.",
  },
  {
    key: "retention",
    title: "Combien de temps on garde",
    text: "Trois ans après le dernier rendez-vous. Une cliente peut demander l'effacement de ses données à tout moment ; c'est fait sous 30 jours, sauvegardes comprises.",
  },
  {
    key: "checks",
    title: "Ce qui est vérifié à chaque modification",
    text: "18 tests d'abus (par exemple, une cliente qui essaie d'ouvrir le rendez-vous d'une autre), la recherche de mots de passe oubliés dans le code et des bibliothèques vulnérables.",
  },
  {
    key: "incident",
    title: "En cas d'incident",
    text: "Nous vous prévenons sous 24 heures. Si des données de clientes sont touchées, la CNIL est prévenue sous 72 heures, comme le prévoit le RGPD.",
  },
];

export const SECTIONS = [
  {
    specId: "DOC-objet",
    slug: "objet",
    num: 1,
    path: "security/dossier/01-objet.md",
    title: "Objet et périmètre",
    status: "validee",
    markdown:
      "Ce dossier décrit comment le portail de réservation protège les données des clientes et du salon, et comment l'équipe le vérifie.\n\nIl s'appuie sur le cahier technique (hébergement, stack) et sur la grille OWASP ASVS, niveau 2.",
    updatedAt: null,
    lastAuthor: null,
  },
  {
    specId: "DOC-donnees",
    slug: "donnees",
    num: 2,
    path: "security/dossier/02-donnees.md",
    title: "Données personnelles et RGPD",
    status: "validee",
    markdown:
      "Le salon est responsable du traitement ; l'équipe et ses hébergeurs sont sous-traitants.\n\n- Conservation : 3 ans après le dernier rendez-vous.\n- Droits des clientes : accès et effacement depuis leur espace ou sur demande au salon.",
    updatedAt: null,
    lastAuthor: null,
  },
  {
    specId: "DOC-auth",
    slug: "auth",
    num: 3,
    path: "security/dossier/03-auth.md",
    title: "Authentification et sessions",
    status: "a_relire",
    markdown:
      "Les clientes se connectent par lien magique (F-009) : usage unique, 15 minutes, empreinte seule en base.",
    updatedAt: null,
    lastAuthor: null,
  },
  {
    specId: "DOC-acces",
    slug: "acces",
    num: 4,
    path: "security/dossier/04-acces.md",
    title: "Contrôle d'accès",
    status: "validee",
    markdown:
      "La matrice des droits fait foi. Chaque case « non » ou restreinte devient un scénario d'abus joué en CI.",
    updatedAt: null,
    lastAuthor: null,
  },
  {
    specId: "DOC-menaces",
    slug: "menaces",
    num: 5,
    path: "security/dossier/05-menaces.md",
    title: "Menaces et parades",
    status: "validee",
    markdown:
      "Une fiche par menace, rattachée à une fonctionnalité exposée, avec sa gravité, ses parades et sa vérification.",
    updatedAt: null,
    lastAuthor: null,
  },
  {
    specId: "DOC-secrets",
    slug: "secrets",
    num: 6,
    path: "security/dossier/06-secrets.md",
    title: "Secrets et dépendances",
    status: "brouillon",
    markdown: "Les secrets vivent dans le gestionnaire de secrets de Scaleway.",
    updatedAt: null,
    lastAuthor: null,
  },
  {
    specId: "DOC-incident",
    slug: "incident",
    num: 7,
    path: "security/dossier/07-incident.md",
    title: "Réponse à un incident",
    status: "a_rediger",
    markdown: "",
    updatedAt: null,
    lastAuthor: null,
  },
];
