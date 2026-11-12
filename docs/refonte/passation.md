---
doc_version: 1
last_reviewed: 2026-11-10
---
# Passation de la refonte : état, méthode, décisions

> À lire au début de chaque session (renvoi depuis `.claude/CLAUDE.md`). Mettre à jour la section « État » à chaque ticket
> fusionné, et ajouter ici toute nouvelle décision de méthode de l'utilisateur. Les décisions produit restent dans
> `docs/refonte/questions.md` (une ligne B-nnn chacune) ; rien ne se décide « dans la conversation » sans être écrit.

## État au 2026-11-12

| Sprint | Ticket | État |
| --- | --- | --- |
| 018 | TK-87, TK-88, TK-94, TK-95, TK-96 | ✅ fusionnés |
| 019 | TK-97, TK-138 à TK-142 | ✅ fusionnés (bibliothèque fidèle aux maquettes, reprise des écrans, axe en CI) |
| 019 | TK-98 (fournisseurs d'IA) | ✅ critère 1 complété par TK-93 (moteur `euOnly` + case à la création ; réglage après création au lot 13c, B304) |
| 020 | TK-89 (espace Idée : pages, éditeur, publication, droits) | ✅ fusionné (PR #150, `e8c2247`) |
| 020 | TK-90 (panneau de l'agent, propositions) | ✅ fusionné (PR #154) |
| 020 | TK-91 (maturité, Synthèse, `idea-vN`, « Passer au cadrage ») | ✅ fusionné (PR #158, `da47953`) |
| 021 | TK-92 (vue d'ensemble : `project.overview`, S-overview) | ✅ fusionné (PR #160, `0b4ea76`) |
| 021 | TK-93 (projets en cartes, création en une étape, données en UE) | ✅ fusionné (PR #164, `4d8429a`) ; décisions B297 à B311 ; complète le critère 1 de TK-98 |
| 022 | TK-99a (serveur des propositions : tables, verrou en base, tâche `agent-propose`, `ai.*` / `proposal.*`, contrat 2.9.0) | ✅ fusionné (PR #169, `5fe5f56`) ; décisions B313 à B317 ; ADR 0021 |
| 022 | TK-99b (interface des propositions : `AgentProposeButton`, modale, relecture à plat et en volume, enregistrement par lots) | ✅ fusionné (PR #179, `a09ce95`, remplace la #173) ; décisions B319 à B324 ; suivi serveur : libération d'une proposition verrouillée par un lot échoué (B320) |
| 022 | TK-100 (`spec.deliverables`, forçage, index d'entités, validation par élément et D1, impact amont, contrat 2.10.0) | ✅ fusionné (PR #181, `83439ac`) ; décisions B1, B11, B325 à B328 ; Baseline 0 sans client (D1) renvoyée à TK-104 |
| 022 | TK-101 (`SpecItemSheet`, `ai.prefillItem`, `spec.item.get`, `spec.refs.search`, contrat 2.11.0) | ✅ fusionné (PR #184, `7ffe7c1`) ; décisions B329 à B332 |
| 022 | TK-102 (cahier fonctionnel par état, onglet Fonctionnalités, retrait de l'Assistant et d'`ai.draftBrief`, contrat 3.0.0) | ✅ fusionné (PR #186, `6094e5d`) ; décisions B333 à B337 ; « Relancer » renvoyé à TK-104 |
| 023 | TK-103 (Règles métier, Rôles et permissions, Parcours, contrat 3.1.0, `seed:large` à 300 règles) | ✅ fusionné (PR #187, `e02a57e`) ; décisions B338 à B346 |
| 023 | TK-104 (vue client des 4 onglets, « Valider le cahier », annulation `withdrawn`, `review.remind`, contrat 3.2.0) | ✅ fusionné (PR #193, `67b2556`, remplace la #192) ; décisions B347 à B362 ; case du sprint non cochée : critères 9 (e2e `seed:large`) et 13 (axe après décision) partiels, acceptés par B361, à vérifier avec TK-105 |

Prochain ticket : TK-105 (volume réel), sprint 023 ; il vérifie aussi les critères 9 et 13 de TK-104 avec `seed:large`. DoD du sprint 022 (4 cases) encore à vérifier avant de la cocher.

Interdit pour l'instant : le lot 12 (`23-Lot12Tickets`). Questions ouvertes pour l'utilisateur : A1, B16 (`questions.md`).

## Règles de l'utilisateur (ne pas redemander)

- Autonomie : fusion vers `develop` autorisée quand la CI est verte (`gh pr merge N --rebase --delete-branch`).
  **Historique linéaire** (demande du 2026-11-12, imposé par la protection de `develop`) : jamais de merge de
  `develop` dans une branche. Une branche en retard se rebase (`gh pr update-branch N --rebase`) ou se recrée depuis
  `develop` par cherry-pick, sans push forcé. Les PR empilées sont rejouées sur `develop` après la fusion de leur base. Une
  question ouverte ne bloque pas : lecture la plus prudente conforme aux passations, consignée dans `questions.md`
  (« Décidée en autonomie le AAAA-MM-JJ : … »).
- Maquettes de `docs/refonte/maquettes/` : elles font foi (`pnpm maquette NN`). Composant ou variante absent →
  `packages/ui` (tests, galerie `/dev/ui`, ligne DESIGN.md), jamais de style local dans `apps/web`.
- Bibliothèque : shadcn/ui sur Radix (comportement) + Tailwind. **Une seule famille d'icônes : Material Symbols**, par le
  registre fermé (`pnpm icons:generate`). Pas de Sonner : les toasts utilisent Radix Toast. Aucune dépendance sans ADR.
- Incohérences entre planches : valeur majoritaire des planches récentes (B143) ; choix de l'utilisateur B144
  (segmenté actif neutre sans violet, titres des Réglages à 20 px, `wand_stars` pour les actions de l'agent,
  `smart_toy` pour l'Assistant).
- Données en UE (A5, 2026-11-08) : interrupteur par projet « Les données de ce projet restent dans l'UE » (owner,
  admin) ; activé, OpenRouter n'est jamais appelé pour ce projet. Livré avec TK-93, qui complète le critère 1 de TK-98.
- Découpage de l'espace Idée : TK-89 n'affiche ni agent, ni Synthèse, ni jauge, ni « Passer au cadrage » (pas de bouton
  mort) ; ils arrivent avec TK-90 et TK-91. L'Assistant de cadrage actuel et le brief sont retirés au sprint 022.
- Tout en français ; jamais le nom du fournisseur d'IA dans l'interface ; aucune donnée réelle ni secret ; WCAG 2.2 AA,
  375 px, axe sans violation. Ne jamais cocher une case du sprint sans que chaque critère soit vérifié.
- Lecteur de diagramme (2026-11-13, TK-108) : **SVG maison** dans `packages/ui` (`DiagramViewer` partagé par les lots 6,
  7 et 9 ; `SequenceDiagram` à part) ; placement automatique sans `_layout.yaml` par **`@dagrejs/dagre`**, seule
  dépendance ajoutée (ADR avec TK-108) ; React Flow et rendu Mermaid écartés (fidélité aux maquettes, accessibilité,
  lot 7 hors de leur usage). API générique dès TK-108 : **types de nœud libres** et **groupes imbriqués** (cadres qui en
  contiennent d'autres, placés par dagre en mode `compound`), prévus mais non construits tant qu'aucun écran ne les
  demande. Usage futur visé : diagramme d'infra (hors périmètre tant qu'il n'a ni maquette ni accord de l'utilisateur).
- Maquette 11, volume réel : la zone détaillée **« Prise de rendez-vous »** fait foi pour toute zone ouverte ; les autres
  zones de la planche (grille 210 px, champs factices) sont du remplissage de démonstration, à ne pas reproduire.
- Jamais de commit de `.project/`, jamais `--no-verify`, jamais d'amend, jamais de push direct sur `develop`.

## Économie de jetons (demande du 2026-11-08)

- **Une session par ticket** : après chaque fusion, mettre à jour ce fichier, puis l'utilisateur fait `/clear`. Tout
  ce qu'il faut savoir est ici, dans le vault (sprints) et dans `questions.md`.
- **Workflow seulement pour les gros tickets** (base + contrat + écran). Petit ticket (correctif, composant, test) :
  directement, sans workflow, ou un seul agent Sonnet.
- Sous-agents en Sonnet par défaut (`/config`, modèle des sous-agents). **Revue visuelle : toujours Opus** (choix de
  l'utilisateur le 2026-11-08).
- Sorties de commandes toujours tronquées (`| tail -40`, `grep` ciblé) ; ne pas relire un fichier déjà lu.
- **Relancer `pnpm lint` après chaque correction, même d'une ligne**, avant de pousser : chaque tour de CI coûte
  30 minutes (deux tours perdus sur TK-89).

## Méthode d'un ticket

1. `git fetch && git checkout -b <type>/tk-NN-<sujet> origin/develop` ; copier le fichier du sprint du vault avant
   d'y toucher.
2. Gros ticket : `Workflow({ name: "koklo-ticket", args: { tk, branch, sprint: "sprint-NNN.md", date, sensitive, ui,
   notes } })` (script `.claude/workflows/koklo-ticket.js` : analyse → 1 à 3 lots → revue code (+ sécurité si
   `sensitive`) et revue visuelle en un seul tour → un tour de correction, revue de code seule rejouée ; si
   `visualFixedUnchecked`, regarder soi-même les captures régénérées des états cités). `notes` : périmètre des lots, dépendances autorisées,
   hors périmètre. Coupure réseau : relancer avec `resumeFromRunId` et les mêmes `args` (les agents finis sont rejoués
   depuis le cache).
   - `args` est un **objet complet**, jamais `"TK-NN"` : `ui` (booléen) vaut `true` dès que la ligne du ticket a une
     « Maquette : », sinon l'analyse saute l'inventaire de la maquette et la revue visuelle n'a pas lieu (TK-90 : branche
     `undefined`, travail fait sur `develop`, 13 écarts trouvés après coup). Le script refuse désormais un `args` incomplet.
   - Créer la branche **avant** le lancement.
   - Ticket qui réunit base + contrat + flux + plusieurs composants + écran : proposer de le scinder en deux tickets
     (serveur, puis écran) plutôt qu'un seul workflow de 3 h.
   - Corrections après une revue visuelle (leçon de TK-90, 6 tours) : chaque demande de correction exige aussi de
     vérifier le clavier, Échap, le focus et l'axe de l'élément touché, et de relancer le spec e2e complet de l'écran,
     pas seulement le point corrigé (F1 → F14 → F15/F16 → F17 : chaque correctif a créé l'écart suivant). Après deux
     tours ciblés, faire une revue finale large de l'élément au lieu d'un nouveau tour étroit.
3. Repasser derrière le workflow, ce que les revues laissent passer :
   - style recopié dans `apps/web` au lieu d'un composant `packages/ui` ;
   - test qui ne prouve pas le critère (ex. aller-retour testé sur des pages vides) ;
   - captures exigées « chaque état en clair, sombre et 375 px » : toutes produites ;
   - appels réseau refusés en boucle (ex. présence pour un rôle en lecture seule).
4. Verrous locaux (machine légère, le poste gèle sous la charge, décision du 2026-11-12) : **aucune suite complète en
   local**, la CI les fait. Seulement `pnpm lint` ; `pnpm --filter <paquet> typecheck` pour chaque paquet touché (tests
   compris) ; les fichiers de test touchés et les tests de garde (`vitest run <fichiers> --maxWorkers=2`) ; au plus le
   spec Playwright de l'écran (`--workers=1`) ; `.github/scripts/commitlint-local.sh`. Une commande à la fois.
   Tests de garde qui ont cassé la CI de TK-102 : `contract-schema-parity` (champ ajouté à un schéma d'entité), tests
   qui importent une aide modifiée de `apps/api/test/helpers/`, seuil de couverture d'un paquet quand un fichier source
   nouveau n'a pas de test, et le typecheck des fichiers de test.
5. Captures : l'e2e web réécrit **toutes** les captures. `python3 docs/refonte/outils/trier-captures.py --seuil 400
   --garder <écrans du ticket>`, puis regarder les plus gros écarts restants (souvent le survol de la souris ou une heure
   relative) avant de commiter.
6. Push, PR vers `develop` (corps en français, vérifications réellement faites), attendre la CI ; rebase si `develop`
   a bougé (protection stricte) ; fusion ; cocher le sprint avec la PR et le SHA ; mettre à jour la section « État ».

## Pièges connus

- Commits : en-tête de 100 caractères au plus (commitlint en CI). Lancer `.github/scripts/commitlint-local.sh` avant le
  push ; un `git commit --amend` est bloqué par le garde shipyard, et le push forcé est exclu : on recrée la branche par
  `cherry-pick -n` + commit (le shell est zsh : tableaux indexés à partir de 1). TK-104 : PR #192 remplacée par la #193.
- Changer la vue d'un rôle (TK-104 : business passe en vue client) casse les e2e d'autres écrans qui l'utilisent
  (`e2e/tests/r2-journeys.spec.ts` T7). Chercher le rôle dans `e2e/tests/` avant de pousser.
- `@koklo/ui` est consommé par `dist` : `pnpm --filter @koklo/ui build` avant les tests web, et pas pendant qu'une
  suite Playwright web tourne.
- Les e2e laissent `e2e/playwright-report/` : `biome ci` du paquet `e2e` le lint et échoue (3 700 erreurs). Le
  supprimer avant `pnpm lint`.
- e2e racine sur la vraie pile (Postgres en Compose, API, worker, web) : `pnpm e2e` lance tout ; pour un seul fichier,
  copier `e2e/scripts/run.ts` en ajoutant le fichier et `--workers=1` aux arguments de `playwright test`, puis supprimer
  la copie.
- Captures : comparer en RGB ; `getbbox()` sur une image RGBA ne regarde que l'alpha.
- Un test qui parcourt le contrat oRPC doit descendre dans les sous-groupes (ex. `idea.page`).
- CI `ci` : les tests de migration du paquet `db` partagent le CPU avec les suites api et web (`turbo run test`) ; la suite `db` dure ~21 min sur la CI contre ~4 min en local. Sous charge, leurs délais de 180 s expiraient (develop rouge après TK-90, PR #158 deux fois). Délais portés à 600 s (TK-91). Si ça revient : `--concurrency=2` dans `ci.yml`.
- CI `ci` : `features-long-list.test.tsx` (anti-rebond de la recherche, « expected 5 to be less than 5 ») est sensible à la charge du runner ; une relance du job suffit (TK-92). Ne pas oublier qu'un test unitaire d'API peut dater d'avant une correction de revue : lancer `pnpm --filter @koklo/api exec vitest run src` en entier avant de pousser, pas seulement les fichiers du lot.
- Une PR bloquée en « queued » : annuler l'exécution CI périmée (`gh run cancel`) qui occupe la file.
- Création de projet (TK-93 lot C) : l'état de la création vient du serveur (`project.cards` → `creation`, `project.creationStatus`) ; ne jamais réintroduire de marqueur `sessionStorage` ni d'appel à `repo.createSpec` pour un nouveau projet (seule la page Fonctionnalités d'un projet sans dépôt le garde). Une création `skipped` (`no_account`) garde sa carte tant que le dépôt n'existe pas (B311). Les e2e de la création pilotent le faux API par `creation`, `creationSeed`, `retryTo` (`apps/web/e2e/support/stub-spec-repo.ts`).
- TK-93 : le workflow a duré ~3 h 20 (3 lots) et la CI `ci` ~60 min sous charge. Non vérifié : `KOKLO_ENCRYPTION_KEY` injecté au service worker par `.deploy/manifest.yaml` (secret `generate` global supposé) ; à contrôler au premier déploiement staging. Après un rebase, relancer lint, typecheck et la suite web avant le push forcé.
- TK-99a : non vérifié, `KOKLO_ENCRYPTION_KEY` et les clés d'IA injectés au service worker par `.deploy/manifest.yaml` (le worker déchiffre les clés BYOK comme l'API) ; à contrôler au premier déploiement staging. Le moteur réel du worker (`createAiEngine`) n'est couvert que par la compilation et `ai-persistence` côté API, pas par un lancement de bout en bout. Une proposition dont le lot de spec a échoué reste verrouillée par `appliedBatchId` (B315 h), à traiter avec TK-99b. `proposal.decide` lit puis écrit sans verrou de ligne : course étroite avec `specBatch.submit`, sans fuite ni écriture dans la spec.
- e2e `proposals.spec.ts` « 400 propositions… défilement sans tâche longue » : sensible à la charge de la machine (échoue dans la suite complète, passe seul 2/2) ; le relancer seul avant de conclure (TK-99b).
