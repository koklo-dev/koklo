import type { SpecFile } from "../src/index.ts";
import { techFiles } from "./technical-helpers.ts";

/** TK-117 lot A : un livrable Sécurité minimal et cohérent, posé sur le cahier technique de test (F-001, T-user). */
export const THREAT_PATH = "security/threats/SEC-T01.yaml";
export const DATA_PATH = "security/data.yaml";
export const RIGHTS_PATH = "security/rights.yaml";
export const ASVS_PATH = "security/asvs.yaml";
export const SUMMARY_PATH = "security/summary.md";
export const DELETE_PATH = "api/endpoints/compte.supprimer.yaml";

export const THREAT_YAML = `id: SEC-T01
titre: Lien de connexion intercepté
surfaces: [F-001, api]
categorie: usurpation
gravite: elevee
risque: |-
  Quelqu'un récupère un lien.
  Il entre dans le compte.
parades:
  - Lien à usage unique.
verification: { mode: scenario, detail: joué à chaque fusion }
scenario: { quand: le lien est utilisé une deuxième fois, alors: la connexion est refusée }
liens: [compte.supprimer, T-user, user.email, RL-admin, NFR-001, ST-sms, ENV-recette, S-register, R-003]
`;

export const DATA_YAML = `transferts: Aucun transfert hors de l'Union européenne.
donnees:
  - donnee: Adresse e-mail
    champs: [user.email]
    categorie: contact
    conservation: 3 ans après la dernière connexion
    acces: [Gérante, Accueil]
    protection: Masquée dans les journaux.
  - donnee: Empreinte du mot de passe
    champs: [user.mot_de_passe_hash]
    categorie: secret
  - donnee: Identifiants internes
    champs: [user.id, session.id, session.user_id]
    categorie: technique
    conservation_proposee: 6 mois
`;

export const RIGHTS_YAML = `matrice:
  - action: PM-compte.creer
    libelle: Créer un compte
    cases:
      - { role: RL-visiteur, acces: oui }
      - { role: RL-admin, acces: non }
restrictions:
  - { role: RL-admin, permission: PM-compte.supprimer, restriction: Avec second facteur }
propriete:
  - Toute lecture vérifie que la ressource appartient au compte connecté.
`;

export const ASVS_YAML = `niveau: 2
exigences:
  - id: V2.1.1
    chapitre: authentification
    titre: Le lien de connexion n'est utilisable qu'une fois
    niveau: 1
    reponse: Jeton à usage unique
    liens: [F-001, SEC-T01]
  - id: V3.1.1
    chapitre: sessions
    titre: La session expire après inactivité
    niveau: 2
secrets_et_dependances:
  - { libelle: Rotation, valeur: Tous les 90 jours }
`;

export const SUMMARY_MD = `## Où sont les données

Chez un hébergeur à Paris.

## Ce qui est protégé

Les adresses e-mail sont masquées dans les journaux.

## Qui voit quoi

Seul un administrateur supprime un compte.

## Comment on se connecte

Par un lien valable une seule fois.

## Combien de temps on garde

Trois ans après la dernière connexion.

## Ce qui est vérifié à chaque modification

Des essais d'actions interdites.

## En cas d'incident

Nous vous prévenons sous 24 heures. La CNIL est prévenue sous 72 heures.
`;

export const DELETE_YAML = `id: compte.supprimer
type: ecriture
zone: Comptes
composant: C-api
permission: PM-compte.supprimer
resume: Supprime un compte.
sert: [F-001, F-004]
`;

const BASE: Record<string, string> = {
  [DELETE_PATH]: DELETE_YAML,
  [THREAT_PATH]: THREAT_YAML,
  [DATA_PATH]: DATA_YAML,
  [RIGHTS_PATH]: RIGHTS_YAML,
  [ASVS_PATH]: ASVS_YAML,
  [SUMMARY_PATH]: SUMMARY_MD,
};

/** Spec avec sécurité cohérente ; `changes[path] = contenu` ajoute ou remplace, `null` retire. */
export const securityFiles = (changes: Record<string, string | null> = {}): SpecFile[] =>
  techFiles({ ...BASE, ...changes });
