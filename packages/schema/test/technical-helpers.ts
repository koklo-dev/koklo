import type { SpecFile } from "../src/index.ts";
import { ADR_MD, archFiles, componentYaml } from "./architecture-helpers.ts";

/** TK-115 lot A : un cahier technique minimal et cohérent, posé sur la spec v2 de test (F-001, R-003, T-user). */
export const STACK_PATH = "tech/stack/sms.yaml";
export const OPERATION_PATH = "api/endpoints/creneau.listAvailable.yaml";
export const NFR_PATH = "nfr/NFR-001.yaml";
export const ENVIRONMENTS_PATH = "tech/environments.yaml";

export const STACK_YAML = `id: ST-sms
couche: externes
icone: sms
role: Fournisseur SMS
statut: a_trancher
recommande: Brevo
composants: [C-api]
options: [Brevo, Twilio]
criteres:
  - nom: Prix estimé par SMS en France
    estimation: true
    valeurs: ["≈ 0,045 €", "≈ 0,07 €"]
pourquoi: SMS et e-mail chez le même prestataire.
en_clair: Le prestataire des rappels SMS reste à choisir.
exigences: [NFR-001]
decisions: [ADR-001]
`;

export const OPERATION_YAML = `id: creneau.listAvailable
type: lecture
zone: Prise de rendez-vous
composant: C-api
permission: public
resume: Liste les créneaux libres.
entree:
  serviceId: { type: uuid, contrainte: service actif }
sortie:
  creneaux: { type: liste, note: triés par heure }
erreurs:
  - { code: SERVICE_INCONNU, quand: service absent, regle: R-003 }
regles: [R-003]
sert: [F-001]
limite: 20 par minute et par IP
`;

export const NFR_YAML = `id: NFR-001
categorie: performance
titre: Temps de réponse de l'API
cible: p95 < 300 ms
enonce: Les réservations répondent en moins de 300 ms.
verification: { mode: scenario, detail: TS-046 }
liens: [C-api, ST-sms, ADR-001, R-003]
`;

export const ENVIRONMENTS_YAML = `environnements:
  - id: ENV-recette
    nom: Recette
    adresse: recette.atelier-lumiere.fr
    hebergement: Scaleway · Paris
    base: PostgreSQL géré
    donnees: copie_anonymisee
    deploiement: fusion
    acces: Équipe + client
    lignes:
      - { libelle: SMS, valeur: Numéros de test }
variables:
  - { nom: DATABASE_URL, usage: Connexion à la base }
integrations:
  - { service: Fournisseur SMS, usage: Rappels, statut: a_trancher }
`;

const BASE: Record<string, string> = {
  "architecture/components/api.yaml": componentYaml("C-api"),
  "architecture/adr/ADR-001-base.md": ADR_MD,
  [STACK_PATH]: STACK_YAML,
  [OPERATION_PATH]: OPERATION_YAML,
  [NFR_PATH]: NFR_YAML,
  [ENVIRONMENTS_PATH]: ENVIRONMENTS_YAML,
};

/** Spec technique cohérente ; `changes[path] = contenu` ajoute ou remplace, `null` retire. */
export const techFiles = (changes: Record<string, string | null> = {}): SpecFile[] =>
  archFiles({ ...BASE, ...changes });
