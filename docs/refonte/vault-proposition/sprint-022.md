---
tags: [sprint/022, vault/timeline, design/refonte]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 022 — Refonte : Socle de la spec et Fonctionnalités

## 🎯 Sprint Goal
L'équipe lance « Proposer avec l'agent » sur le Fonctionnel, relit les fonctionnalités proposées et les enregistre en un lot. Elle crée et modifie une fonctionnalité dans le panneau commun Créer / modifier. L'Assistant de cadrage et le brief sont retirés.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## 🧑 Prérequis et actions humaines (ignorés par la boucle)
- Passations validées par Brice le 05/11/2026 (dépôt `koklo`) : `docs/refonte/passations/05-decisions-2026-11-05-spec-sans-brief.md`, `06-lot-5-fonctionnel-passation.md`, `07-principe-listes-longues.md`, `11-principe-creer-modifier.md`, `14-principe-proposer-avec-agent.md`. La spec compte 7 livrables (`21-lot-14-securite-passation.md` §0) : lire « N/7 » partout où une passation écrit « N/6 ».
- Sprints prérequis : 018 (TK-94 socle listes longues, TK-95 `AiProvider`), 019 (TK-88 barre « SPEC N/7 »), 020 (TK-91 : `idea-v1` et Synthèse), 021 (TK-92 vue d'ensemble).
- Questions ouvertes : B1 et B11 (TK-100). Elles ne bloquent pas : la lecture prudente de `docs/refonte/questions.md` s'applique en attendant. C1 (approbation des fonctions absentes de `vision.md`) et C3 (boucle arrêtée jusqu'au « go ») doivent être tranchées avant d'activer le sprint.
- Sprint à 20 points, au-dessus de la capacité (feuille de route §5) : TK-101 peut glisser au sprint 023 sans casser la tranche.

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-99]** Socle des propositions de l'agent : lancements persistés, flux, verrou par livrable, bouton et modale communs
  - Labels : pkg:api, pkg:worker, pkg:contract, pkg:db, pkg:web, pkg:ui, pkg:llm, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-94, TK-95
  - Source : `docs/refonte/passations/14-principe-proposer-avec-agent.md` (tout), `06-lot-5-fonctionnel-passation.md` §1, §4.2, §4.3, §6, `07-principe-listes-longues.md` §1.4, `05-decisions-2026-11-05-spec-sans-brief.md` §1 (point 2) (dépôt `koklo`) ; maquettes `docs/refonte/maquettes/21-PrincipeAgent.html` (5 états du bouton, modale), `10-Lot5Fonctionnel.html` (Génération, Relecture), `12-PrincipeListes.html` (relecture en volume)
  - À faire :
    - Tables des lancements d'agent, des propositions et des décisions (ecarts.md, migration « Propositions et lancements d'agent ») ; verrou en base par livrable, qui remplace le verrou en mémoire de `apps/api/src/ai/ai-gate.ts` ; `409 proposal_in_progress`.
    - Tâche de fond pg-boss dans `apps/worker/src/jobs/` (aucun job IA aujourd'hui) : la génération continue si l'utilisateur quitte la page, les propositions arrivent en flux, par lots (07 §1.4) ; notification si l'utilisateur est parti.
    - Procédures `ai.proposeDeliverable({ projectId, deliverable, mode, instruction? })`, `ai.reviseProposal`, `ai.proposeOptions`, `proposal.decide` (unifie `idea.proposal.decide`), `proposal.list` groupé et `proposal.decideMany` (contrat posé par TK-94, 07 §8) dans `@koklo/contract`. Tout passe par `AiProvider` (TK-95). Un schéma Zod par type : une proposition invalide est écartée côté serveur (« 1 proposition inutilisable a été écartée »).
    - `AgentProposeButton` (5 états : `idle`, `open`, `running`, `ready`, `unavailable`) et `AgentProposePopover` (modale centrée, fond flouté) dans `packages/ui` ; partir de l'amorce `framing-call-button.tsx`. Correction 14 §5 : la `textarea` reçoit sa valeur par `value`.
    - `ProposalReview` générique (bandeau, liste 330 px, détail, J / K / A / R, « Remettre à relire », « Demander une modification à l'agent ») en reprenant `proposal-editor.tsx`, `proposal-criteria-editor.tsx`, `proposal-issues.tsx`, `use-ai-call.ts`, `ai-error-notice.tsx`, `framing-operations.ts` et la politique de texte brut (`apps/api/src/ai/ai-text-policy.ts`). Les décisions sont persistées côté serveur, plus dans le navigateur (`lib/use-framing-proposals.ts`).
    - Relecture en volume (07 §1.4) : progression, filtre « À relire » par défaut, groupes au-delà de 30, « Accepter les N restantes » par groupe ; un seul `specBatch.submit` jusqu'à 200 opérations, sinon un commit par groupe (plafond actuel `SPEC_BATCH_OPERATIONS_MAX` = 50).
    - Branché ici sur le Fonctionnel ; chaque lot suivant le branche sur son livrable.
  - Critères d'acceptation :
    - [ ] Même bouton, même place, mêmes 5 états ; absent en vue client (vérifié sur le Fonctionnel, repris par chaque livrable).
    - [ ] Modale centrée, fond flouté, Échap / clic dehors, focus piégé.
    - [ ] Choix et comptes propres au livrable, option vide masquée.
    - [ ] Un seul lancement par livrable ; propositions en flux vers la relecture ; « Relire N propositions ». Le verrou tient avec deux instances de l'API (test).
    - [ ] La génération se poursuit côté serveur si l'utilisateur quitte la page ; au retour, la page s'ouvre en relecture.
    - [ ] Rien n'entre dans la spec sans clic humain : aucune écriture sans `proposal.decide` puis `specBatch.submit` (test).
    - [ ] Texte brut absolu pour toute valeur issue du modèle ; aucun lien construit depuis une sortie du modèle (test).
    - [ ] La charge envoyée au modèle ne contient que les sources listées dans « L'agent lit » (test).
    - [ ] Droits côté serveur : client et business ne lancent, ne relisent et ne décident aucune proposition (test 403).
    - [ ] Relecture groupée au-delà de 30 propositions, « Accepter les N » limité au groupe, y compris les propositions non chargées (test serveur).
    - [ ] Données de test de charge : 400 propositions dans `pnpm seed:large` ; première page < 300 ms côté serveur ; défilement à 60 i/s.
    - [ ] Captures de chaque état du bouton et de la modale en clair, sombre et 375 px ; axe sans violation.
- [ ] **[TK-100]** Socle livrables et validation : `spec.deliverables`, index d'entités, validation par élément et par l'équipe, impact amont
  - Labels : pkg:api, pkg:worker, pkg:contract, pkg:db, pkg:schema, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-94
  - Source : `docs/refonte/passations/06-lot-5-fonctionnel-passation.md` §5, §6, §7, `05-decisions-2026-11-05-spec-sans-brief.md` §2 (disponibilité), `09-lot-6-donnees-passation.md` §3.5, `21-lot-14-securite-passation.md` §0 (dépôt `koklo`) ; maquette `docs/refonte/maquettes/10-Lot5Fonctionnel.html` (Liste · équipe, Vue client · validation)
  - À faire :
    - `spec.deliverables` : les 7 entrées (Fonctionnel 1, Données 2, Architecture 3, Technique 4, Sécurité 5, Design 6, Qualité 7) avec statut, disponibilité calculée côté serveur, condition, propositions en attente, `staleBecause?`. La liste des 7 livrables vit en une constante unique du contrat. Forçage par owner / admin avec confirmation.
    - Index d'entités générique (kind, specId, zone, chemin, JSON, hachage de contenu, texte `tsvector`), index `(project_id, tri, id)` ; réindexation complète des têtes (`apps/worker/src/webhook/index-writer.ts`, `reconcile/`).
    - Validation par élément : remplacer la comparaison au SHA de tête (`apps/api/src/client-space/validation.ts:34`). Une validation reste valable si le contenu de l'élément n'a pas changé depuis son SHA. Table annexe des versions, car le trigger `reviews_immutable` interdit la mise à jour.
    - Validation par l'équipe : élargir `REVIEW_SUBMIT_ROLES` (`apps/api/src/auth/roles.ts:135`) pour la cible `deliverable` des livrables validés par l'équipe ; `ReviewTargetKind` + `flow`, `rules`, `roles`, `deliverable` (`ALTER TYPE … ADD VALUE`).
    - Règle D1 (décision du 2026-11-06) : sur un projet **sans client invité**, le propriétaire et l'administrateur valident à la place du client (Fonctionnel, écrans du Design, Baseline 0) ; dès qu'un client est invité, il est seul à valider ces cibles. La validation enregistre « validé par l'équipe · sans client ».
    - `review.submit` / `review.list` étendus (cibles, client lecteur, `REVIEW_READ_ROLES`) dans `contract-review.ts` et `apps/api/src/review/prisma-review.repository.ts`.
    - Impact amont : diff `idea-vN` → `idea-vN+1` et graphe des sources ; les livrables dépendants passent « À revoir » avec `staleBecause`, action « Proposer les mises à jour » (`mode: 'update'`).
  - Critères d'acceptation :
    - [ ] `spec.deliverables`, `proposal.decide`, `review.*` et l'impact amont prêts pour les lots suivants.
    - [ ] Chaque validation enregistre qui, quand, le SHA du commit de la spec, la décision et le commentaire éventuel.
    - [ ] Toute modification d'un élément validé invalide sa validation ; une modification dans un bloc (règles, rôles) invalide le bloc ; un commit sur un autre élément ne l'invalide pas (test).
    - [ ] Le livrable est « Validé » quand toutes les validations sont posées sur la version courante.
    - [ ] Disponibilité calculée côté serveur selon la lecture prudente B1 ; forçage refusé à tout autre rôle qu'owner / admin (test 403).
    - [ ] Un commit de mise en page (`_layout.yaml`) n'invalide aucune validation (B11, test).
    - [ ] Droits côté serveur : sur le Fonctionnel, le client valide ou demande un changement, ou, sans client invité, le propriétaire ou l'administrateur (D1) ; sur Données, Architecture et Technique, seuls owner, admin et développeur valident ; aucun jeton d'agent ne valide (tests 403).
    - [ ] Badges et compteur « SPEC N/7 » lus dans `spec.deliverables`, jamais calculés depuis des listes.
  - Questions : B1 (ordre de disponibilité : Fonctionnel ← idea-v1 ; Données ← Fonctionnel ; Architecture ← Données ; Technique ← Architecture ; Sécurité ← Technique ; Design ← Fonctionnel ; Qualité ← Technique, Sécurité et Design) ; B11 (la mise en page est exclue du hachage : pas d'invalidation).
- [ ] **[TK-101]** Socle `SpecItemSheet` : panneau commun Créer / modifier et formulaire Fonctionnalité
  - Labels : pkg:ui, pkg:web, pkg:api, pkg:contract, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-99, TK-100
  - Source : `docs/refonte/passations/11-principe-creer-modifier.md` (tout), `14-principe-proposer-avec-agent.md` §5 (dépôt `koklo`) ; maquette `docs/refonte/maquettes/16-PrincipeEdition.html` (type Fonctionnalité × Création, Préremplie par l'agent, Modification, Erreurs)
  - À faire :
    - Composant `SpecItemSheet` dans `packages/ui` : panneau droit de 540 px (`Sheet` shadcn, `role="dialog"`), plein écran sous 768 px. Généraliser `feature-form-{sheet,fields,errors,footer}.tsx`, `feature-delete-confirm.tsx` et `lib/use-feature-form*.ts` sans régresser S-feature-form.
    - Quatre modes : Création (encadré « Décrire en une phrase »), Préremplie (filet gauche 3 px `--primary`, « proposé par l'agent », « Effacer »), Modification (avertissement d'invalidation d'un livrable validé), Erreurs (résumé, champs en rouge, focus). « Supprimer » avec confirmation listant ce qui pointe vers l'élément.
    - Procédures `ai.prefillItem` (texte brut, aucune écriture), `spec.item.get` (valeurs + `validated` du livrable, à partir de `spec.getFeature`), `spec.refs.search` (autocomplétion serveur, 20 résultats, anti-rebond 200 ms, 07 §2).
    - Enregistrer = un `specBatch.submit` d'une opération `<type>.create` / `.update` / `.delete`, toast avec le commit, élément sélectionné dans la liste. Mêmes validations Zod et références que pour les propositions.
    - Formulaire Fonctionnalité (11 §3) ; les autres formulaires arrivent avec leur lot.
  - Critères d'acceptation :
    - [ ] Chaque bouton « Nouvelle fonctionnalité » et « Modifier » du Fonctionnel ouvre `SpecItemSheet` avec le bon formulaire.
    - [ ] Préremplissage par l'agent avec marquage des champs ; « Effacer ». Le préremplissage n'écrit rien (test).
    - [ ] Erreurs : résumé, champs en rouge, focus ; références vérifiées par le serveur.
    - [ ] Avertissement d'invalidation en modification d'un livrable validé.
    - [ ] Enregistrement = un commit, toast, élément sélectionné.
    - [ ] Focus piégé, Échap, confirmation si saisie non enregistrée, plein écran sous 768 px ; axe sans violation.
    - [ ] Droits côté serveur : jamais pour le client ; `specBatch.submit` et `ai.prefillItem` refusés au client et au business (test 403).
    - [ ] Autocomplétion testée sur des éléments non chargés (`pnpm seed:large`).
    - [ ] Captures des 4 modes en clair, sombre et 375 px.
- [ ] **[TK-102]** Lot 5a · Spec · Fonctionnel : page, états Prêt / Génération / Relecture, onglet Fonctionnalités ; retrait de l'Assistant et du brief
  - Labels : pkg:web, pkg:api, pkg:contract, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-91, TK-92, TK-99, TK-100, TK-101
  - Source : `docs/refonte/passations/06-lot-5-fonctionnel-passation.md` §1 à §4.4 (Fonctionnalités), §6, §7, §9, `05-decisions-2026-11-05-spec-sans-brief.md` §1 (dépôt `koklo`) ; maquette `docs/refonte/maquettes/10-Lot5Fonctionnel.html` (Prêt, Génération, Relecture, Liste · équipe, onglet Fonctionnalités, Démo puis Volume réel)
  - À faire :
    - Route `/projects/[id]/spec/functional` ; `ProjectHeader` (« <projet> / Spec / Fonctionnel », h1 « Cahier fonctionnel », 4 onglets `?tab=`) ; états Prêt, Génération, Relecture (`ProposalReview` de TK-99) et Liste · équipe sur l'onglet Fonctionnalités (`SpecCollection` liste + fiche ancrée).
    - `ai.proposeDeliverable` `'functional'` (initial / update) : l'agent lit le dossier figé `idea-vN`, la Synthèse et Hypothèses et risques (14 §3). `ai.proposeFeatures` ne prend plus de `brief`.
    - `spec.functional.list` paginé (remplace `spec.functional.get`, 07 §7) ; fiche chargée à part. Reprendre `features-list.tsx`, `feature-sheet.tsx`, `feature-detail.tsx` ; remplacer le « Afficher plus » manuel de `lib/use-features-list.ts` par `VirtualList`. Étendre `FeatureSchema` (`strictObject`) avec `zone:`.
    - Retirer l'Assistant : `apps/web/src/app/projects/[projectId]/framing/page.tsx`, `framing-*.tsx`, `lib/framing-*.ts`, `use-framing-*.ts`, tests `apps/web/test/framing-*`, `apps/web/e2e/framing.spec.ts`, `FramingLink` de `features-header.tsx` et `features-empty.tsx`. Redirections `/framing` → `/spec/functional` et `/features` → `/spec/functional?tab=features`. Fiche S-framing « remplacée ».
    - Retirer le brief : `ai.draftBrief` (`contract-ai.ts`, `schemas-ai.ts`, OpenAPI), `draftBrief` de `ai.service.ts`, `brief-draft` de `ai-budget.ts`, `ai-prompts.ts`, `brief/0001-idee-initiale.md` de `spec-scaffold.ts`, `docs/functional/guides/frame-with-ai.md` ; purger les brouillons `framingDraftKey`.
    - Barre : badge de l'entrée Fonctionnel « N à relire » pendant une relecture, sinon son statut ; carte « Cahier fonctionnel » de la vue d'ensemble lue dans `spec.deliverables`.
    - L'étape Design crée `design/screens/S-spec-functional.md`.
  - Critères d'acceptation :
    - [ ] Assistant retiré, redirections `/framing` et `/features` ; barre « Spec » conforme au fichier de décisions, compteur « N/7 ».
    - [ ] États Prêt, Génération, Relecture et Liste · équipe de l'onglet Fonctionnalités conformes à la planche.
    - [ ] Relecture générique (`ProposalReview`) sur les fonctionnalités, enregistrement groupé en un lot avec récapitulatif.
    - [ ] Plus aucune procédure `ai.draftBrief` dans le contrat ni dans l'API (test du contrat).
    - [ ] Droits côté serveur : proposer, relire, enregistrer et modifier refusés au client et au business ; le client ne reçoit jamais les propositions en attente (test).
    - [ ] Données de test de charge : 1 000 fonctionnalités dans `pnpm seed:large` ; la liste reste fluide (60 i/s, première page < 300 ms côté serveur).
    - [ ] Recherche et filtres testés sur des éléments non chargés ; lien direct (`?sel=F-187`) vers un élément hors de la première page.
    - [ ] États de pied de liste capturés (suite, chargement, erreur, fin) et recherche vide.
    - [ ] Raccourcis J / K / A / R uniquement hors champ de saisie ; changements d'état annoncés dans une région `role="status"` unique.
    - [ ] Captures de chaque état de l'onglet Fonctionnalités en clair, sombre et 375 px ; axe sans violation.

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Captures clair / sombre / 375 px de chaque écran touché, comparées à la planche
- [ ] axe sans violation sur chaque état
- [ ] Listes vérifiées avec `pnpm seed:large`

## 🚧 Risks
- Retrait de l'Assistant : extraire d'abord ce que reprend `ProposalReview` (éditeurs de proposition, texte brut, erreurs IA), avant toute suppression.
- `ai.proposeFeatures` prend un `brief` en entrée : il doit lire le dossier figé. Le brief n'est pas en base, seuls des brouillons locaux sont à purger.
- Propositions persistées et tâche de fond pg-boss : rien n'existe aujourd'hui, les décisions vivent dans le navigateur.
- Verrou IA en mémoire faux avec plusieurs instances : le verrou par livrable doit être en base.
- Validation par élément : le trigger `reviews_immutable` impose une table annexe des versions ; renommages de `ReviewTargetKind` incompatibles (`ALTER TYPE`).
- Impact amont : diff `idea-vN` → `idea-vN+1` et graphe des sources à construire.
- Plafond de 50 opérations par lot (`SPEC_BATCH_OPERATIONS_MAX`) contre 200 dans le principe des listes longues.
- `SpecItemSheet` : généraliser sans régresser S-feature-form.
- Liste des fonctionnalités sans recherche `q` ni `total` ; `FeatureSchema` en `strictObject` refuse `zone:` tant qu'il n'est pas étendu.
