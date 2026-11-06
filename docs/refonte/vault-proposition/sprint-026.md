---
tags: [sprint/026, vault/timeline, design/refonte]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 026 — Refonte : Technique et Sécurité

## 🎯 Sprint Goal
L'équipe relit et valide le cahier technique : stack avec « Choisir », API par zone avec son contrat généré, exigences mesurables. Puis le livrable Sécurité : menaces, données sensibles, droits, exigences ASVS ; le client lit un résumé en mots simples.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## 🧑 Prérequis et actions humaines (ignorés par la boucle)
- Passations (dépôt `koklo`) : `docs/refonte/passations/12-lot-8-technique-passation.md` (validée le 05/11/2026), `21-lot-14-securite-passation.md` (validée le 06/11/2026 : Sécurité est le 5ᵉ livrable), `11-principe-creer-modifier.md`, `14-principe-proposer-avec-agent.md`, `07-principe-listes-longues.md`. Lire « N/7 » pour « N/6 ».
- Sprint prérequis : 025 (TK-113 validation de l'architecture).
- Questions ouvertes : B12 (TK-116), A6 et A7 (TK-117). Lecture prudente appliquée, non bloquantes. A7 demande une relecture juridique avant toute mise en production : aucune durée de conservation par défaut n'est codée en attendant.

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-115]** Lot 8a · Technique : formats, états, Stack, Environnements
  - Labels : pkg:api, pkg:worker, pkg:contract, pkg:web, pkg:schema, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-113
  - Source : `docs/refonte/passations/12-lot-8-technique-passation.md` §1 à §4.1, §4.4 (et §4.5 Document), `11-principe-creer-modifier.md` §3 (Choix technique, Environnement) (dépôt `koklo`) ; maquette `docs/refonte/maquettes/14-Lot8Technique.html` (Prêt, Génération, Relecture, À revoir, Vue client ; onglets Stack, Environnements, Document ; Volume réel)
  - À faire :
    - Formats `tech/stack/<slug>.yaml`, `api/endpoints/<zone.verbe>.yaml` (remplace `EndpointSchema` REST `E-…` et `SpecEndpoint`), `nfr/NFR-nnn.yaml` (`PATTERNS.nfr` existe), `tech/environments.yaml`, `tech/cahier-technique/NN-<slug>.md` (`spec-scaffold.ts` écrit aujourd'hui `tech/cahier-technique.md`).
    - `ai.proposeDeliverable` `'technical'` (propositions `stack`, `op`, `nfr`, `env`, `doc_section`) ; relecture groupée par type ; texte d'une section proposée affiché simplement (15 px), sans encadré coloré.
    - Route `/projects/[id]/spec/technical`, h1 « Cahier technique », résumé sous le titre, états Prêt, Génération, Relecture, À revoir (changement d'architecture), Vue client.
    - Onglet Stack : sections par couche, 2 cartes par ligne, fiche avec tableau comparatif, « Choisir <option> » → `spec.technical.stack.choose` (une opération `stack.update`) ; estimations marquées « ≈ » et « estimations à vérifier ».
    - Onglet Environnements : tableau, variables et secrets en noms seulement ; refus serveur de toute valeur de secret (motif de détection à brancher dans `apps/worker/src/spec-write/plan.ts`, politique dans `packages/rules/src/koklo-strict-rules.ts`) ; intégrations externes.
    - Onglet Document : `SpecDocument` dans la disposition de l'espace Idée (12 §8.1), `spec.document.sections({ deliverable: 'technical' })`.
    - Formulaires `SpecItemSheet` Choix technique et Environnement.
  - Critères d'acceptation :
    - [ ] 6 états ; onglets Stack (2 cartes par ligne, tableau comparatif, Choisir), Environnements (secrets sans valeur), Document (disposition de l'espace Idée).
    - [ ] Toute valeur de secret est refusée par le serveur à l'enregistrement, qu'elle vienne d'un humain ou de l'agent (test).
    - [ ] « Nouveau choix technique », « Nouvel environnement » et « Modifier » ouvrent `SpecItemSheet`.
    - [ ] Droits côté serveur (12 §7) : proposer, relire, modifier et « Choisir » réservés à owner, admin et développeur ; le client lit sans YAML (test 403).
    - [ ] Avec `pnpm seed:large` : liste de la stack fluide, recherche sur des éléments non chargés.
    - [ ] Captures : chaque état × onglets Stack, Environnements et Document, équipe et client, clair, sombre, 375 px ; axe sans violation.
- [ ] **[TK-116]** Lot 8b · Technique : API, générateur de contrat, Exigences, validation
  - Labels : pkg:api, pkg:web, pkg:contract, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-115
  - Source : `docs/refonte/passations/12-lot-8-technique-passation.md` §4.2, §4.3, §5, §6, `11-principe-creer-modifier.md` §3 (Opération, Exigence) (dépôt `koklo`) ; maquette `docs/refonte/maquettes/14-Lot8Technique.html` (Liste · équipe : API, Exigences, validation ; Volume réel)
  - À faire :
    - Onglet API : filtre par zone avec compteurs, liste en 1.1 (pages de 50), fiche (Entrée, Sortie, Erreurs, Qui peut appeler…) ; `spec.technical.ops.list`, `.ops.byId`.
    - « Contrat généré » : `spec.technical.contract({ opId })` par le générateur de la stack retenue (`ST-api`, aujourd'hui TypeScript · oRPC + zod, `packages/contract/src/<zone>/<entité>.ts` dans le dépôt de code) ; le YAML reste la source.
    - Onglet Exigences : sections par catégorie, cartes avec cible, icône crayon, statut de couverture selon B12 ; `spec.technical.nfr.list`.
    - Formulaires `SpecItemSheet` Opération et Exigence.
    - « Valider » (owner, admin, développeur) seulement quand aucun choix n'est « À trancher » ; validation liée au commit ; 5 Sécurité passe « Prêt », compteur Spec « 4/7 ».
  - Critères d'acceptation :
    - [ ] Onglets API (zones, fiche, contrat de la stack retenue) et Exigences (cibles, couverture, Modifier).
    - [ ] Validation impossible tant qu'un choix est à trancher, refusée aussi côté serveur (test) ; déblocage de Sécurité.
    - [ ] Panneau `SpecItemSheet` sur tous les « Nouveau… » et « Modifier » du Technique.
    - [ ] Droits côté serveur : valider réservé à owner, admin et développeur ; le client ne reçoit ni YAML ni contrat généré (test 403).
    - [ ] Avec `pnpm seed:large` : liste des opérations fluide (première page < 300 ms), filtre par zone et recherche côté serveur, lien direct hors de la première page, pied de liste capturé.
    - [ ] Captures : API, Exigences, Liste validée, Vue client, clair, sombre, 375 px ; axe sans violation.
  - Questions : B12 (avant la Qualité, l'onglet Exigences affiche « Couverture : après la Qualité » sans compter ; aucune exigence ne bloque la validation du Technique).
- [ ] **[TK-117]** Lot 14b · Livrable Sécurité
  - Labels : pkg:api, pkg:worker, pkg:contract, pkg:web, pkg:schema, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-116
  - Source : `docs/refonte/passations/21-lot-14-securite-passation.md` §1, §2, §4 (hors `audit.*`) (dépôt `koklo`) ; maquette `docs/refonte/maquettes/15-Lot14Securite.html` (Relecture, Liste · équipe, À revoir, Vue client ; Démo / Volume réel)
  - À faire :
    - Route `/projects/[id]/spec/security` ; entrée « 5 Sécurité » (icône `shield`) « Disponible après le technique » ; en-tête (résumé, Proposer avec l'agent, Nouvelle menace, Valider).
    - Fichiers `security/threats/SEC-Txx.yaml`, `security/data.yaml`, `security/rights.yaml` (généré depuis `domain/roles.yaml`, dérivable de `RolesFileSchema`), `security/asvs.yaml`, `security/summary.md`, `security/dossier/NN-*.md`.
    - Onglets Menaces (groupes par surface, fiche, parades, vue Scénario d'abus), Données sensibles (tableau, « Décider », registre RGPD en Markdown), Droits (matrice depuis les rôles du Fonctionnel), Exigences (niveau ASVS, chapitres, « Une pull request ne fusionne pas si… »), Résumé client (7 cartes, « Mettre à jour avec l'agent »), Document.
    - Scénarios d'abus Gherkin générés dans `quality/scenarios/abuse/` (`@SEC-Txx @F-xxx @abus`), un par case « non » ou restreinte de la matrice ; leur exécution en CI relève de TK-133.
    - Procédures `security.threat.*`, `security.data.list/classify`, `security.registry.export`, `security.rights.get`, `security.asvs.setLevel/report`, `security.summary.get/propose/accept`, `security.validate`, `security.propose({ mode })` avec la clé d'IA de l'organisation.
    - Formulaires `SpecItemSheet` `threat` et `sensitive`.
    - États Relecture (propositions groupées, un lot) et À revoir (un livrable source change).
  - Critères d'acceptation :
    - [ ] Sécurité en 5ᵉ position dans la barre (« x/7 »), « Disponible après le technique ».
    - [ ] Menaces avec fiche, scénario d'abus généré, blocage d'une menace élevée sans parade.
    - [ ] Classification des données, registre RGPD, blocage d'un champ non classé.
    - [ ] Matrice des droits → scénarios d'abus générés dans `quality/scenarios/abuse/`.
    - [ ] `security.validate` refusé côté serveur s'il reste une menace élevée sans parade ou une donnée non classée (test).
    - [ ] Le client ne voit que le résumé : les autres onglets sont refusés côté serveur, pas seulement masqués (test 403).
    - [ ] Niveau ASVS proposé selon A6 ; aucune durée de conservation codée par défaut (A7, test).
    - [ ] Avec `pnpm seed:large` : liste des menaces et tableau des données fluides, filtres côté serveur.
    - [ ] Captures : 4 états × onglets, fiche, formulaires, clair, sombre, 375 px ; axe sans violation.
  - Questions : A6 (niveau 2 dès qu'une donnée personnelle est classée, sinon 1) ; A7 (l'agent propose, la valeur reste « À décider » jusqu'à une saisie humaine).

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Captures clair / sombre / 375 px de chaque écran touché, comparées à la planche
- [ ] axe sans violation sur chaque état
- [ ] Listes vérifiées avec `pnpm seed:large`

## 🚧 Risks
- `api/endpoints/<zone.verbe>.yaml` contraire à l'existant REST : les liens des fonctionnalités et des écrans sont à renommer.
- Refus des valeurs de secret : le motif de détection n'est pas encore branché dans `plan.ts`.
- Cahier technique en sections contraire à `spec-scaffold.ts`.
- Générateur de contrat : aucun chemin d'écriture vers le dépôt de code du client.
- Couverture des exigences : dépendance circulaire Technique ↔ Qualité (B12).
- La liste des 7 livrables doit vivre dans le contrat (constante unique de TK-100).
