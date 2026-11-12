# Refonte du 6 novembre 2026 · Audit des écarts

> Étape A de la mission de réalignement. Lecture seule : aucun code, aucun ticket modifié.
> Existant audité : dépôt `koklo` à `9aee3da` (contrat `@koklo/contract` 0.13.0), vault `koklo-v2` (sprints 001 à 021).
> Cible : `docs/refonte/passations/01…22`. Règle des 7 livrables appliquée (Fonctionnel, Données, Architecture, Technique, Sécurité, Design, Qualité).
> États : **fait** (code vu), **partiel**, **absent**, **contraire** (l'existant fait autre chose, à défaire). Effort : S (≤ 1 j), M (2 à 4 j), L (≥ 1 semaine).

## Synthèse

- **L'existant est la v1 décrite par la conception v0.6**, pas la cible des passations. Aucun composant, écran ni procédure de la refonte n'existe encore.
- **Socle solide à réutiliser** :
  - écriture de la spec par lots du bot (`specBatch`, `apps/worker/src/spec-write/`) ;
  - webhooks et index de spec ;
  - client GitHub App complet (dont `createTag`, `listDeployments`, `publishCheck`) ;
  - pipeline IA BYOK (budgets, quotas, texte brut, données non fiables) ;
  - journal d'audit immuable ;
  - machine à états des tickets et baux ;
  - espace client cloisonné ;
  - validations client liées au SHA ;
  - notifications.
- **Quatre écarts structurants**, à traiter avant les écrans :
  1. **Projet implicite** : tickets, sprints, audit, baux et commentaires passent par `OldestProjectContext` (`apps/api/src/project/project-context.ts:23`). Le contrat ne porte pas de `projectId`.
  2. **Validation par tête globale** : `validationOf` (`apps/api/src/client-space/validation.ts:34`) compare au SHA de tête. Tout commit invalide toutes les validations, alors que la cible invalide par élément, livrable ou écran. Seul le client valide (`REVIEW_SUBMIT_ROLES = [CLIENT_ROLE]`, `apps/api/src/auth/roles.ts:135`), alors que l'équipe doit valider 5 livrables.
  3. **Format de spec v1** : tables `T-*.yaml` en types anglais et `relations.yaml`, API REST `E-*.yaml`, tests `tests/scenarios/*.yaml`, documents en un fichier, `.koklo/rules.yaml`. Les passations définissent un autre format, d'où un `spec_version: 2` et une migration des dépôts existants.
  4. **IA synchrone et sans état** : aucune proposition persistée, pas de flux, pas de tâche de fond IA, verrou en mémoire par organisation. La cible exige des propositions persistées, une génération qui continue hors page, un verrou par livrable et un flux.
- **À retirer** : l'Assistant de cadrage et le brief, le kanban d'organisation, les entrées Membres / GitHub / IA de la barre, la création de projet en deux étapes, et l'exécution d'agents dans `packages/delivery/src/claude-code/` (aucune app n'en dépend).
- **Absents de bout en bout** : CLI `koklo`, serveur MCP, jetons, sessions d'agent, livrables 2 à 7, moteur de rendu et de règles de design, Baseline (aucun code ne crée de `Baseline` ni ne pose de tag), recette.

---

## Lot 0 · Fondations (passation 01 §0, principe 07 §4)

| Élément (§) | État | Fichiers | Effort | Risque |
|---|---|---|---|---|
| Jetons `--surface`, `--raised`, `--border-strong` (01 §0.1) | absent | `packages/ui/src/styles/theme.css`, `index.css` (`@theme inline`) | S | `--muted` et `--card` jouent déjà ce rôle : choisir alias ou renommage. |
| Valeurs v1 reconduites (01 §0.1) | fait | `packages/ui/src/styles/theme.css`, `tentative.css` | — | — |
| Ombre des éléments flottants (01 §0.1) | absent | `packages/ui/src/components/{popover,dropdown-menu,sheet}.tsx` | S | Le garde « pas de rgb() » impose un jeton d'ombre. |
| Couleurs d'alerte neutre / attention / erreur (01 §0.1) | absent | `packages/ui/src/styles/status.css` | S | Contrastes AA à prouver (`packages/ui/test/contrast.test.ts`). |
| Échelle typo h1 24, h2 16, h3 14 (01 §0.2) | **contraire** | `packages/ui/src/styles/typography.css` (30 / 24 px) ; `text-[30px]` dans 7 fichiers, `text-[22px]` dans 4 fichiers de `apps/web/src/` | M | Les tests de forme v1 cassent (`packages/ui/test/status-typography.test.ts`). |
| `LifecycleStatus` (01 §0.3) | absent | — | S | Le cycle de vie n'est pas calculé côté API. |
| `ValidationStatus` + « Non soumise » (01 §0.3) | partiel | `packages/ui/src/components/status-badge.tsx` | S | `StatusBadge` est utilisé partout. |
| `DeliverableStatus` (01 §0.3) | absent | — | S | Dépend de `spec.deliverables`. |
| `PriorityIndicator` (01 §0.3) | absent | priorité en texte dans `apps/web/src/components/features-list.tsx` | S | — |
| `EntityChip` + `HoverCard` (01 §0.3) | absent | pas de primitive `hover-card` | M | Résumé par type d'entité côté serveur. |
| `InlineAlert` (01 §0.3) | absent | à remplacer : `packages/ui/src/components/alert.tsx`, `apps/web/src/components/error-notice.tsx` | S | — |
| Bloc Anthropic en une ligne + « Détails » (01 §0.3) | **contraire** | `apps/web/src/components/ai-send-policy.tsx` (« jamais replié ») | S | Les tests framing et ai-settings vérifient le bloc déplié. Avec plusieurs fournisseurs, le texte « Anthropic » devient « le fournisseur d'IA de l'organisation » (voir questions.md). |
| `EmptyState` (01 §0.3) | absent | vides faits main : `features-empty.tsx`, `github-empty.tsx`, `projects-view.tsx` | S | — |
| `PhaseRail` grand et `sm` (01 §0.3) | absent | — | M | Phase absente du contrat. |
| Bouton désactivé en pointillés + raison (01 §0.3) | **contraire** | `packages/ui/src/components/button.tsx` (`disabled:opacity-50`) | S | Touche tous les écrans. |
| Galerie `/dev/ui` (01 §0.4) | absent | seule fixture : `packages/ui/e2e/fixture/main.tsx` | M | Fermée en production. |
| Garde « aucune couleur en dur » (01 §0.5) | partiel | `apps/web/test/design-conformity.test.ts` (liste blanche de fichiers), `packages/ui/test/no-hardcoded-colors.test.ts` | S | Les nouveaux fichiers échappent au garde : passer à un glob. |
| Primitives manquantes `Dialog`, `Command`, `HoverCard`, `Switch`, `RadioGroup` | absent | `packages/ui/src/components/` | S | — |
| `VirtualList`, `CountBar`, `ListFooter`, `Pagination`, `GroupSection` (07 §4) | absent (`ListFooter` partiel) | « Afficher plus » manuel : `features-list.tsx`, `lib/use-features-list.ts` ; pas de `@tanstack/react-virtual` | M | Accessibilité `aria-setsize` / `aria-posinset`. |
| `DiagramMinimap`, `ZoneNode` (07 §4) | absent | — | M | Inutiles avant le lot 6. |
| Icônes Material Symbols manquantes | partiel | `packages/ui/src/icons/generated/*` (dont `task_alt`, `database`, `lock`…) ; à générer : `space_dashboard`, `lightbulb`, `auto_awesome`, `view_kanban`, `gavel`, `progress_activity`, etc. | S | — |

## Lot 1 · Coquille et navigation (01 §1, décision 05 §2 « Lot 1 », lot 5 §2, lot 14 §0)

| Élément (§) | État | Fichiers | Effort | Risque |
|---|---|---|---|---|
| `AppShell` collant, défilement interne (01 §1.1) | partiel | `packages/ui/src/components/sidebar.tsx` (`fixed inset-y-0 h-svh`), `apps/web/src/components/app-frame.tsx` | M | Primitive shadcn à adapter. |
| Largeur 256 / rail 64, état en `localStorage` (01 §1.1) | **contraire** | `sidebar.tsx` (15,5 rem / 3 rem, cookie) | S | `packages/ui/test/sidebar*.test.tsx`, `apps/web/e2e/sidebar.spec.ts`. |
| Tiroir mobile sous 768 px (01 §1.1) | fait | `sidebar.tsx` (`Sheet`), `apps/web/e2e/sidebar.spec.ts` | — | — |
| Sélecteur d'organisation (01 §1.1-1) | partiel | `apps/web/src/components/team-switcher.tsx` | S | — |
| Recherche ⌘K (01 §1.1-2, 07 §2) | absent | pas de `cmdk` | M | 07 l'emporte : recherche serveur, 20 résultats. |
| Carte projet + `PhaseRail sm` (01 §1.1-3) | absent | liste vrac `apps/web/src/components/nav-projects.tsx` à retirer | M | Notion de projet actif à créer. |
| Groupe « SPEC » N/7, numéroté, sans chevron, cadenas (05 §2, 14 §0) | absent | `apps/web/src/components/app-sidebar.tsx`, `nav-main.tsx` | M | Ne pas suivre le chevron de 01 §1.1 ni la planche 05 (périmée). |
| Disponibilité des livrables côté serveur, forçage owner / admin (05 §2) | absent | `packages/contract/src/contract-spec.ts` | L | Nouveau modèle de statut par livrable. |
| Entrée « Assistant de cadrage » (05 §2) | — | — | — | Ne pas la créer : elle disparaît au lot 5 (voir feuille de route, choix d'ordre). |
| Entrées Baseline 0 et Recette (16 §2, 22 §1) | absent | — | S | Apparaissent selon la phase. |
| Groupe « Organisation », pied (01 §1.1-4, -5) | partiel | `app-sidebar.tsx`, `nav-user.tsx`, `theme-toggle.tsx` | S | — |
| Kanban, Membres, GitHub, IA retirés de la barre (01 §1.1) | **contraire** | `app-sidebar.tsx` (`KANBAN_ENTRY`, `MEMBERS_ENTRY`, `GITHUB_ENTRY`, `AI_ENTRY`) | S | — |
| Routes `/projects/[id]`, `/idea`, `/spec/*` en « Bientôt » (01 §1.2) | absent | `apps/web/src/app/projects/[projectId]/` (seulement `features/`, `framing/`) ; gardes `apps/web/src/lib/auth-guard.ts` (regex), `apps/web/src/proxy.ts` (matcher) | M | Liens en dur vers `/features` (nav, projets, e2e, stubs). |
| `/projects/[id]/tickets` + redirection de `/kanban` (01 §1.2) | **contraire** | `apps/web/src/app/kanban/*`, `lib/use-kanban-data.ts` ; API `OldestProjectContext` ; `packages/contract/src/schemas-tickets.ts` sans `projectId` | L | Version majeure du contrat. |
| Réglages regroupés (01 §1.2 → lot 13) | absent | `apps/web/src/app/{members,github,settings/ai}/*` | M | En-têtes `no-store` de `/settings/ai` (`apps/web/next.config.ts`), callback GitHub dans `proxy.ts`. |
| `/` vers le dernier projet ouvert (01 §1.2) | **contraire** | `apps/web/src/app/page.tsx` (redirection fixe) | M | Stockage du dernier projet à créer. |
| `ProjectHeader` 3 lignes avec onglets (01 §1.3, 12 §8.4) | absent | fil d'Ariane v1 : `app-frame.tsx` (`Crumbs`), `features-header.tsx`, `framing-header.tsx` | M | SHA disponible via `spec.head`. |
| Correctifs 1.6 (focus, ombre du kanban, « Réessayez » en double) | partiel | `nav-user.tsx`, `kanban-view.tsx`, `ai-error-notice.tsx`, `lib/use-ai-call.ts`, `ai-credential-notices.tsx` | S | — |
| Captures clair / sombre / 375 px de chaque écran (01 §1.7) | absent | `apps/web/e2e/*.spec.ts`, `design/screens/captures/` | M | Toutes les captures changent. |

## Lot 2 · Espace Idée (passation 02, corrigée par 05 §2 « Lot 2 » et 12 §8.3)

| Élément (§) | État | Fichiers | Effort | Risque |
|---|---|---|---|---|
| Modèles `IdeaPage`, `IdeaProposal`, `IdeaMessage`, `IdeaPublication` (02 §3) | absent | `packages/db/prisma/schema.prisma` | M | FK composite `(organization_id, project_id)` et CHECK à la main. |
| Pages modulables, gabarit en configuration, 4 requises (02 §1, §4) | absent | — | M | — |
| Droits : le client rédige, mais ne publie pas et ne passe pas au cadrage (02 §2) | absent | `apps/api/src/auth/roles.ts` ; `apps/api/test/client-write-matrix.test.ts` | S | Casse l'hypothèse « le client n'écrit que suggestions et reviews ». |
| Procédures `idea.*`, `idea.page.*` (02 §5) | absent | pas de `contract-idea.ts` | M | `CONFLICT` sur version dépassée. |
| Publication `idea/<slug>.md` + `_index.yaml`, plusieurs `Co-authored-by` (02 §4) | partiel | `apps/worker/src/spec-write/message.ts` (un coauteur), `plan.ts` (`feature.*`), `packages/schema/src/parse/kinds.ts` (ignore `idea/`) | M | Nouvelle famille d'opérations. |
| `ai.ideaChat` en flux, `ai.ideaGaps` (02 §5) | absent | `apps/api/src/ai/ai.service.ts` (synchrone), port `packages/domain/src/llm-provider.ts` sans flux | L | Flux à porter dans le port, l'adaptateur et le transport oRPC. |
| Un appel IA à la fois par utilisateur et projet (02 §5) | partiel | `apps/api/src/ai/ai-gate.ts` (par organisation, en mémoire) | S | Verrou en mémoire faux avec plusieurs instances. |
| Pseudonymisation des auteurs envoyés au modèle (02 §5) | partiel | `packages/domain/src/untrusted.ts`, `apps/api/src/ai/ai-prompts.ts`, `apps/api/test/ai-leaks.test.ts` | S | — |
| Éditeur TipTap en Markdown restreint, enregistrement auto, copie locale (02 §6.2) | absent | brouillon local réutilisable : `apps/web/src/lib/use-storage-scope.ts`, `feature-draft.ts` | L | Aller-retour Markdown et contenu hostile. |
| Panneau de l'agent (02 §6.3) | absent | — | L | — |
| `ProposalDiff` sur place (02 §6.4) | absent | base : `apps/web/src/components/proposal-editor.tsx` | M | Ancrage par bloc et état `stale`. |
| Arborescence glisser-déposer, page proposée, corbeille (02 §6.5, §7.8) | absent | pas de `@dnd-kit` | M | Clavier. |
| États (vide, IA absente, conflit, publication, client) (02 §7) | absent (IA absente réutilisable) | `ai-error-notice.tsx`, `framing-notices.tsx` | M | — |
| Guide de questions (02 §8) | absent | `apps/api/src/ai/ai-prompts.ts` | S | — |
| Jauge, seuil des pages requises (02 §9) | absent | — | S | — |
| « Passer au cadrage » = tag `idea-vN` + Synthèse (05 §2) | absent | `createTag` dans `packages/github/src/ops/git-data.ts:100`, **jamais appelé** | M | Le tag pointe le commit publié sur `cadrage`. |
| Page Synthèse `idea/_synthese.md`, `ai.ideaSynthesis` (05 §2) | absent | — | M | — |
| « Modifié depuis idea-vN », « Figer une nouvelle version » (05 §2) | absent | — | M | Déclenche l'impact amont. |
| `ai.draftBriefFromIdea` (02 §9 v1) | — | — | — | Supprimé par 05 : ne pas construire. |

## Décision du 5 novembre · Spec sans brief (05 §1)

| Élément (§) | État | Fichiers | Effort | Risque |
|---|---|---|---|---|
| Pas d'Assistant de cadrage (§1.1) | **contraire** | `apps/web/src/app/projects/[projectId]/framing/page.tsx`, `apps/web/src/components/framing-*.tsx` (14), `apps/web/src/lib/framing-*.ts`, `use-framing-*.ts` | M | Extraire d'abord ce que reprend `ProposalReview`. |
| Trois formes `SpecDocument`, `SpecCollection` + `ProposalReview`, `ScreenGallery` (§1.2) | absent | — | L | Socle de tous les livrables. |
| Pas de brief (§1.3) | **contraire** | `ai.draftBrief` (`packages/contract/src/contract-ai.ts`, `schemas-ai.ts`) ; `apps/api/src/ai/ai.service.ts` ; `ai-budget.ts` (`brief-draft`) ; `apps/api/src/repo/spec-scaffold.ts` (`brief/0001-idee-initiale.md`) ; brouillon local `apps/web/src/lib/framing-draft.ts` | M | Le brief n'est pas en base. `ai.proposeFeatures` prend un `brief` en entrée : il doit lire le dossier figé. |
| Phase calculée `idea` / `framing` (§2 « Lot 3 ») | partiel | seul calcul : `apps/api/src/client-space/prisma-client-space.repository.ts:42` (`framing` / `iteration`) | S | Deux calculs à unifier. |

## Lot 3 · Vue d'ensemble (passation 03, corrigée par 05 §2 « Lot 3 »)

| Élément (§) | État | Fichiers | Effort | Risque |
|---|---|---|---|---|
| Route `/projects/[projectId]`, gabarit (§2) | absent | `auth-guard.ts`, `proxy.ts` à étendre | M | — |
| En-tête, action principale par phase (§3) | absent | — | S | — |
| Fil de phase, `project.phase` (§4) | partiel | amorce `prisma-client-space.repository.ts:42` ; `Baseline.status = tagged` | S | Cas « Non utilisée ». |
| Prochaine étape, 9 règles + vue client (§5) | absent | sources : `LlmProviderCredential.invalidatedAt`, `SpecSnapshot.status`, `Review`, `Suggestion` | M | Règles 3 à 7 dépendent des lots 2 et 5. |
| Indicateurs par phase, masqués sans donnée (§6) | absent | `Suggestion`, `SpecHead`, `Sprint`, `Ticket` | M | — |
| Blocs principaux Idée / livrables / sprint / baseline (§7) | absent (sprint partiel) | `apps/api/src/{sprint,ticket}/` | M | Grille à 7 cartes. |
| Activité depuis le journal (§8.1) | partiel | `AuditLog`, `apps/api/src/audit/`, `apps/api/src/tracker/audit.ts` | M | Peu d'événements lisibles ; lecture réservée owner / admin. |
| Personnes (§8.2) | partiel | `apps/api/src/member/`, `apps/api/src/project-client/` | S | `member.list` fermé au client : projection dédiée. |
| `project.overview` agrégé, textes serveur (§9) | absent | `packages/contract/src/contract.ts` (`project: {list, create}`) | M | — |

## Lot 4 · Projets (passation 04)

| Élément (§) | État | Fichiers | Effort | Risque |
|---|---|---|---|---|
| Groupe « Récents » (§2) | absent | `nav-projects.tsx` (liste complète, contraire) | S | — **Soldé (TK-93, lots A à C).** |
| En-tête organisation, recherche, filtres de phase, tri (§2) | absent | `apps/web/src/app/projects/page.tsx`, `projects-view.tsx` | M | Compteurs côté serveur (07 §0). **Soldé (TK-93, lots A à C).** |
| Grille de cartes `ul` (§2, §9) | **contraire** | `projects-view.tsx` (`Table`) | M | — **Soldé (TK-93, lots A à C).** |
| Carte : couleur, client, phase, avancement, prochaine étape, avatars (§3) | absent | `projectSchema = {id, name}` (`packages/contract/src/schemas.ts`) | L | Agrégation des lots 2 et 3. **Soldé (TK-93, lots A à C).** |
| Vue client : ses projets, redirection s'il n'en a qu'un (§3.1) | partiel | `apps/api/src/project/prisma-project-access.ts` | S | — **Soldé (TK-93, lots A à C).** |
| Boîte « Nouveau projet » en une étape (§4) | **contraire** | `project-create-{sheet,flow,steps,actions}.tsx`, `lib/use-project-creation.ts`, `use-creation-steps.ts` | M | Pas de `Dialog`. |
| Client invité à la création (§4) | absent | `member.invite` + `projectClient.add` existants, non atomiques | M | — |
| Choix de la structure du dossier (§4) | absent | — | M | Dépend du lot 2. |
| Dépôt créé en arrière-plan, sondage 3 s (§5, §7) | **contraire** | `repo.createSpec` synchrone : `apps/api/src/repo/repo.service.ts`, `spec-provisioning.ts` | L | Tâche worker et état de création persistant. |
| Carte de création et ses échecs, reprise serveur (§5, §6) | partiel / contraire | messages : `spec-repo-failure.tsx`, `lib/spec-repo-errors.ts` ; reprise locale : `spec-repo-resume-notice.tsx`, `lib/creation-resume.ts` | M | — |
| `project.list` enrichi, `creationStatus`, `retryRepo`, `recent` (§7) | partiel / absent | `contract.ts` | L | Pages de 24 par curseur (07). |

## Lot 5 · Spec · Fonctionnel et socle (passation 06, 08 §1, principes 11 et 14)

| Élément (§) | État | Fichiers | Effort | Risque |
|---|---|---|---|---|
| Acquis S-framing : règle d'or, texte brut, erreurs IA (06 §1) | fait | `apps/api/src/ai/ai-text-policy.ts`, `apps/web/test/framing-plain-text*.test.*`, `apps/web/src/lib/framing-operations.ts` | S | À extraire avant suppression. |
| Retrait de l'Assistant, redirections `/framing` et `/features` (06 §2) | absent | voir lot 1 | S | — |
| En-tête et 4 onglets (06 §3) | absent | `features-header.tsx` | M | — |
| États Prêt / Génération continue côté serveur (06 §4.1-4.2) | absent | aucun job IA dans `apps/worker/src/jobs/` | L | Tâche de fond pg-boss et propositions persistées. **Part serveur faite (TK-99a)** : tâche `agent-propose`, propositions persistées ; écran : TK-99b. |
| `ProposalReview` générique, J / K / A / R, `ai.reviseProposal` (06 §4.3) | partiel (features, côté client) | `framing-proposals.tsx`, `framing-proposal-card.tsx`, `proposal-editor.tsx`, `proposal-criteria-editor.tsx`, `lib/use-framing-proposals.ts` | L | Décisions aujourd'hui dans le navigateur. **Part serveur faite (TK-99a)** : `ai.reviseProposal` côté API, décisions persistées ; composants : TK-99b. |
| Onglet Fonctionnalités, liste + fiche (06 §4.4) | partiel | `features-list.tsx`, `feature-sheet.tsx`, `feature-detail.tsx` ; `spec.listFeatures`, `spec.getFeature` | M | Pas de recherche `q`, pas de `total`. |
| Onglets Règles, Rôles (matrice), Parcours (06 §4.4) | absent (format partiel) | `packages/schema/src/entities/domain.ts`, `parse/rule-markdown.ts`, `parse/roles-file.ts`, ADR 0012 ; non indexés (`apps/worker/src/webhook/index-rows.ts`) ; `design/flows/` absent de `kindOf` | L | Vocabulaire des règles différent (voir migrations). |
| Vue client et validation (06 §4.5) | partiel (API features, aucune UI) | `apps/api/src/client-space/`, `apps/api/src/review/`, `contract-client-space.ts`, `contract-review.ts` | L | Toute l'UI client est à faire. |
| Validation liée au SHA, invalidée par élément (06 §5) | **contraire** | `validation.ts:34`, `apps/api/src/review/prisma-review.repository.ts` | M | Version par élément (hachage de contenu dans l'index). |
| `spec.deliverables` (7 entrées) (06 §6) | absent | — | M | — |
| `spec.functional.list` paginé, `spec.roles.matrix` (08 §3) | absent | — | M | — |
| `ai.proposeDeliverable`, modes initial / update (06 §6, 14 §4) | partiel | `ai.proposeFeatures`, `ai.proposeCriteria` (`contract-ai.ts`) | L | Types rule, role, flow à créer. **Part serveur faite (TK-99a)** : `ai.proposeDeliverable` (modes `complete`, `criteria`, `update`, `all` ; types `feature` et `criteria`) ; types rule, role, flow : sprint 023. |
| `proposal.decide` persisté, `proposal.list` groupé, `decideMany` (06 §6, 07 §1.4) | absent | — | M | « Accepter les N » couvre des éléments non chargés : serveur. **Faits (TK-99a)** : `proposal.list` groupé, `proposal.decide`, `proposal.decideMany`. |
| `specBatch.submit` avec `rule.*`, `role.*`, `flow.*` (06 §6) | partiel | `packages/contract/src/schemas-spec.ts:16`, `apps/worker/src/spec-write/{plan,paths,features,criteria}.ts` | M | `roles.yaml` unique : conflits d'écriture. Plafond de 50 opérations (`SPEC_BATCH_OPERATIONS_MAX`). |
| `review.submit` / `review.list` étendus (cibles, client lecteur) (06 §6) | partiel | contrat `targetKind` feature / baseline ; enum `ReviewTargetKind` ; `REVIEW_READ_ROLES = STAFF_ROLES` | M | Renommages incompatibles, `ALTER TYPE`. |
| Impact amont « À revoir », mode update (06 §7) | absent | — | L | Diff `idea-vN` → `idea-vN+1` et graphe des sources. |
| Relecture groupée au-delà de 30, barre de progression (08 §1.2) | absent | — | M | — |
| Champ `zone:` des fonctionnalités (08 §1.2) | absent | `packages/schema/src/entities/feature.ts` (`strictObject`) | S | Un fichier avec `zone` échoue tant que le schéma n'est pas étendu. |
| `SpecItemSheet` commun, 12+ formulaires (11 §1, §3) | partiel (fonctionnalité seule) | `feature-form-{sheet,fields,errors,footer}.tsx`, `feature-delete-confirm.tsx`, `lib/use-feature-form*.ts` | L | Généraliser sans régresser S-feature-form. |
| `ai.prefillItem`, `spec.item.get`, `spec.refs.search` (11 §5) | absent / partiel | `spec.getFeature` | M | — |
| `AgentProposeButton`, `AgentProposePopover`, `ai.proposeOptions`, verrou par livrable (14) | absent | amorce `framing-call-button.tsx` | M | Verrou en base. **Part serveur faite (TK-99a)** : `ai.proposeOptions`, verrou en base ; boutons : TK-99b. |

## Lot 6 · Données (passation 09, 08 §2)

| Élément (§) | État | Fichiers | Effort | Risque |
|---|---|---|---|---|
| Un YAML par table, schéma cible (09 §1) | **contraire** | `packages/schema/src/entities/data.ts` (`TableSchema` v1), `parse/kinds.ts` (`data/tables/T-*.yaml` seulement) | M | Un fichier sans `T-` est ignoré sans message. |
| Types français, relations dans la table (09 §1) | **contraire** | `data.ts` (`text`, `integer`…), `data/relations.yaml` posé par `apps/api/src/repo/spec-scaffold.ts` | M | Les règles R4 et R7 lisent `spec.relations`. |
| Références vérifiées (09 §1) | partiel | `packages/schema/src/rules/rule4.ts`, `rule4-links.ts`, `rules/index.ts` | S | `source` → F / R et `ref()` non vérifiés. |
| `data/model.mmd` généré dans le même commit, `_layout.yaml`, `_zones.yaml` (09 §1, 08 §2.1) | absent | brique : `writeCommit` multi-fichiers (`apps/worker/src/spec-write/execute.ts`) | S | Un commit de mise en page invalide-t-il la validation ? (questions.md) |
| Jeux d'exemple `FX-*.yaml`, générés à la graine (09 §1, 08 §2.2) | absent | — | M | Trois emplacements possibles selon les passations (questions.md). |
| États Prêt / Génération / Relecture, onglet Relecture (09 §3) | absent | dépend du socle du lot 5 | M | — |
| Lecteur de diagramme, zoom, sélection, glisser, fiche Fiche / YAML / Mermaid (09 §3.4) | absent | aucune bibliothèque de diagramme | L | Composant partagé avec les lots 7 et 9. |
| Vue des zones, « Aller à une table », niveau de détail, mini-carte (08 §2.1) | absent | `SpecTable` réduit à `specId`, `filePath` | L | Index enrichi (zone, nom, champs). |
| Validation par l'équipe (09 §3.5) | **contraire** | `REVIEW_SUBMIT_ROLES`, `ReviewTargetKind` | M | — |
| Vue client, `resume_client`, commentaire sur une table (09 §3.6) | absent | `CommentTargetKind`, `targetId` en `@db.Uuid` | M | Les lignes d'index sont recréées : ancrer sur l'identifiant de spec. |
| Contrat `spec.data.*`, `table.*`, `fixture.*` (09 §5) | absent | `schemas-spec.ts`, `paths.ts` (liste blanche `feature.*`) | M | — |

## Lot 7 · Architecture (passation 10, corrections 12 §8)

| Élément (§) | État | Fichiers | Effort | Risque |
|---|---|---|---|---|
| Formats `components/`, `actors.yaml`, `flows/`, `adr/ADR-nnn-*.md`, `_zones.yaml` (§1) | absent | `spec-scaffold.ts` crée `architecture/adr/` vide ; identifiants `P-`, `C-`, `ADR-` absents de `packages/schema/src/entities/ids.ts` | M | — |
| Document en sections `overview/NN-*.md` (12 §8.1) | **contraire** | `spec-scaffold.ts` écrit `architecture/overview.md` | S | — |
| Mermaid `schema.mmd`, `flows/*.mmd` (§1) | absent | — | S | — |
| Vérifications (propriétaire unique, fonctionnalité servie, cycles) (§1) | absent | briques : `rules/index.ts`, `packages/domain/src/dependency-graph.ts` | S | — |
| Schéma en couches, zones, fiche (§4.1) | absent | réutilise le lecteur du lot 6 | L | — |
| Document, Composants, Décisions, Flux (séquence) (§4.2-4.5) | absent | — | L | — |
| Validation par l'équipe, « À revoir » (§3, §5) | **contraire** / absent | comme lot 6 | M | — |

## Lot 8 · Technique (passation 12)

| Élément (§) | État | Fichiers | Effort | Risque |
|---|---|---|---|---|
| `tech/stack/*.yaml`, « Choisir », validation bloquée si « À trancher » (§1, §4.1, §5) | absent | — | M | — |
| `api/endpoints/<zone.verbe>.yaml` en RPC (§1) | **contraire** | `data.ts` (`EndpointSchema` REST `E-…`), `kinds.ts`, `SpecEndpoint` (`method`, `path`), `FeatureSchema.endpoints` | M | Liens des fonctionnalités et des écrans à renommer. |
| `nfr/NFR-nnn.yaml` (§1) | absent | `PATTERNS.nfr` existe | S | — |
| `tech/environments.yaml`, refus de toute valeur de secret (§1, §4.4) | absent | `packages/rules/src/koklo-strict-rules.ts` (politique, pas scanner) | S | Motif de détection à brancher dans `plan.ts`. |
| Cahier en sections `NN-*.md` (§1, §8.1) | **contraire** | `spec-scaffold.ts` (`tech/cahier-technique.md`) | S | — |
| Générateur de contrat dans le dépôt de code (§1, §4.2) | absent | — | L | Aucun chemin d'écriture vers le dépôt de code du client. |
| Couverture des exigences depuis Qualité (§4.3) | absent | — | S | Dépendance circulaire 8 ↔ 10 (questions.md). |

## Lot 14 · Sécurité (passation 21 §0 à §2, §4)

| Élément (§) | État | Fichiers | Effort | Risque |
|---|---|---|---|---|
| 7 livrables partout, constante unique (§0) | absent | — | S | La liste doit vivre dans le contrat. |
| Page, onglets Menaces, Données sensibles, Droits, Exigences, Résumé, Document (§1) | absent | — | L | — |
| Fichiers `security/*` (§2) | absent | `rights.yaml` dérivable de `RolesFileSchema` (`entities/domain.ts`) | M | — |
| Scénarios d'abus dans `quality/scenarios/abuse/` (§2) | absent | — | M | — |
| Validation bloquée (menace élevée sans parade, donnée non classée) (§1) | absent | — | S | — |

## Lot 9 · Design (passation 13)

| Élément (§) | État | Fichiers | Effort | Risque |
|---|---|---|---|---|
| Tokens DTCG `core.json`, `semantic.json` (§1) | absent | dossier `design/tokens` posé par le gabarit | M | Nommage v0.6 `*.tokens.json` divergent. |
| Composants neutres `C-*.json` (§1) | absent | `NodeSchema.composant` libre (`entities/screen.ts`) | M | — |
| Écrans `S-*.json` (arbre, états, viewports, interactions) (§1) | partiel | `ScreenSchema` (`entities/screen.ts`), `packages/schema/src/canonical.ts`, règles R4 / R5 / R7 | M | Pas d'interactions, de props typées ni de fixture. |
| `design/rules.yaml`, `.koklo/waivers.yaml` sur `écran › nœud` (§1) | **contraire** | `.koklo/rules.yaml` posé par `spec-scaffold.ts:78` ; dérogations par fichier de `packages/rules` | M | Deux fichiers de règles. |
| Lots d'opérations `OPB-nnn` (§1) | partiel | trailer `Koklo-Ops: <uuid>` (`message.ts`) | S | Compteur `ProjectCounter` disponible. |
| Contraste WCAG calculé (§2.2) | absent | — | S | Même code que la règle a11y. |
| Moteur de règles UI (paquets, sévérités, cadenas, dérogations) (§2.3) | absent | brique forte : composition et dérogations de `packages/rules` | L | Seule la composition se réutilise, pas l'évaluation. |
| Inventaire, file de conception un écran à la fois (§2.4) | absent | verrous `packages/domain/src/lock.ts`, `Lease` | M | — |
| Studio, rendu par état / viewport / thème, correctifs par portée (§3) | absent | aucun paquet `ir` ni `render-web` (v0.6 §16.2) | L | Plus gros chantier de la refonte. |
| Parcours jouable, commentaires ancrés sur un nœud (§4) | absent | `CommentTargetKind.screen` sans nœud | L | — |
| Validation client par écran, « À revoir » si un token ou un composant change (§5) | partiel | `ReviewTargetKind.screen` en base, masqué par l'API (`prisma-review.repository.ts:32`) et le contrat (`schemas-review.ts:12`) | M | Graphe écran → composants → tokens. |

## Lot 10 · Qualité (passation 15)

| Élément (§) | État | Fichiers | Effort | Risque |
|---|---|---|---|---|
| `quality/scenarios/F-nnn.feature` en Gherkin français (§1) | **contraire** | `TestScenarioSchema` (`tests/scenarios/*.yaml`) | M | Pas de parseur Gherkin. Les étapes des critères permettent de générer du Gherkin. |
| `strategy.yaml`, `quality/fixtures`, `quality/plan/NN-*.md` (§1) | absent | — | M | — |
| Couverture (§4.2) | partiel | `packages/schema/src/rules/rule5.ts` | M | — |
| Statut Passe / Échoue depuis la CI de `main` (§1) | absent | `publishCheck`, `git-check` | M | Après la Baseline. |
| Validation bloquée sans scénario par critère (§5) | absent | — | S | — |

## Lot 11 · Baseline 0 (passation 16, 14 §0)

| Élément (§) | État | Fichiers | Effort | Risque |
|---|---|---|---|---|
| Soumission owner / admin, refus si contrôle bloquant (§1) | absent | aucun code ne crée de `Baseline` (`schema.prisma:1139`) | M | — |
| Validation par le client seul, liée au SHA (§1) | fait (cœur) | `prisma-review.repository.ts` (`assertOpen`, compare-and-set) | — | Passe par `review.submit`, sans `signedName`. |
| Pose du tag `baseline-0` par Koklo (§1) | absent | `createTag` (léger) ; `tagSha`, `taggedAt` jamais écrits | S | Fusion `cadrage` → `main` ou non ? (questions.md) |
| Soumission annulée si la spec change, retrait (§1, §6) | partiel | `STALE_VERSION` ; pas d'état retiré ; index unique partiel « une seule non taguée » | S | — |
| Spec figée après la pose (§1) | absent | `apps/api/src/spec-read/spec-head-resolver.ts:8` lit toujours `cadrage` | M | Rien n'empêche d'écrire après le tag. |
| Page, 5 états, Récapitulatif, Contrôles, Historique, vue client signée (§2-§5) | absent | historique partiel : `reviews`, `audit_log` | L | — |
| Notifications (§6) | partiel | `apps/api/src/notification/notification-emitter.ts` | S | — |

## Lot 12 · Tickets et décision des agents locaux (passations 17, 18)

| Élément (§) | État | Fichiers | Effort | Risque |
|---|---|---|---|---|
| Koklo n'exécute aucun agent (17 §1.1) | **contraire** (paquet isolé) | `packages/delivery/src/claude-code/*`, `agent-*.ts`, ADR `docs/adr/0014-agent-runtime.md` | S | Aucune app n'en dépend. |
| Remontée par CLI et MCP (17 §1.2, §3) | absent | aucun `apps/cli`, aucun `@modelcontextprotocol` | L | Cœur de la phase. |
| Baux réutilisables pour `ticket.start / progress / release` (17 §3) | partiel | `apps/api/src/lease/*`, `Lease` (worktree, heartbeat) | M | Il manque l'outil, le poste, les étapes, la tranche. |
| État « Sans nouvelles » à 20 min, sessions (17 §2, §3) | absent | `Lease.heartbeatAt` | M | Modèle `AgentSession` à créer. |
| Découpage depuis la baseline (18 §1) | absent | `ai.*` : brief, features, critères | M | Dépend du lot 11. |
| Tranche de spec, Agent / Humain, paquet, points (18 §1) | partiel | `Ticket.linkedFeatures`, `assigneeKind member\|runner`, `pkg`, `estimateHours` | M | Enum `TicketPackage` = paquets de Koklo, inadaptée aux clients. |
| Sprints : capacité, création, clôture avec report (18 §1, §2.6) | partiel | `apps/api/src/sprint/*`, `contract-tickets.ts` | M | — |
| Échéances, bande des jours, Chronologie (18 §2.1, §2.4) | absent | `Sprint.startsOn/endsOn` seulement | M | Champ de date sur `Ticket`. |
| Kanban : colonnes ≥ 292 px, glisser, indicateur de dépôt (18 §2.3) | partiel | `apps/web/src/components/kanban-{page,view,column,card}.tsx`, `lib/use-ticket-move.ts` | M | — |
| Règles de transition (PR fusionnée, PR existante, raison, « à prendre en local ») (18 §2.3) | partiel | `packages/domain/src/ticket-transitions.ts`, `apps/api/src/ticket/ticket.service.ts:145` | M | On peut aujourd'hui passer à Terminé sans fusion. |
| Panneau du ticket, `pr.approveAndMerge` humain (18 §2.5) | absent | `GitProvider.mergePullRequest` (`packages/github/src/octokit-git-provider.ts`), historique `apps/api/src/audit/*` | L | Interdire techniquement l'appel par un jeton d'agent. |
| Kanban par projet (18 §4) | **contraire** | `OldestProjectContext`, `apps/web/src/app/kanban/page.tsx` | M | Voir lot 1. |
| Vue client, feuille de route (18 §3) | absent | `apps/api/src/client-space/*` | M | — |

## Lot 13 · Réglages (passation 19, 20, 21 §3)

| Élément (§) | État | Fichiers | Effort | Risque |
|---|---|---|---|---|
| `/settings/[section]`, navigation par rôle, lecture seule, 403 (19 §1) | partiel | `apps/web/src/app/settings/ai/*`, `apps/web/src/lib/roles.ts` | M | — |
| Général : `org.get` / `org.update` (19 §2.1) | absent | `Organization.logo`, `slug` existent | M | Renommer le slug casse des liens ? |
| Membres : invitation avec projets, tableau, en attente, matrice (19 §2.2) | partiel | `invite-form.tsx`, `role-field.tsx`, `members-page.tsx` ; `member.setRole` non utilisé ; pas de `member.remove`, `invitation.list/resend/revoke` | M | — |
| Fournisseurs d'IA : liste, Principal / Secours (19 §2.3, 20) | partiel | `LlmProviderCredential` (unique org × fournisseur), `apps/web/src/components/ai-settings-page.tsx:37` (filtre `anthropic`) | M | — |
| Ajout avec requête de test avant enregistrement (19 §2.3) | partiel | `llm-credential.service.ts` (`set` puis `verify`), `ai-credential-form.tsx:45` | S | La clé est gardée avant le test. |
| Six fournisseurs dont Compatible OpenAI (`baseUrl`) (20) | partiel | enum `LlmProvider` = anthropic, openai, google | M | `baseUrl` : risque SSRF à cadrer. |
| Couche `AiProvider` (Vercel AI SDK) (20) | partiel | port `packages/domain/src/llm-provider.ts`, `packages/llm/src/anthropic/*` (fetch maison) ; fuites : `apps/api/src/ai/ai-call.ts:11,37`, `ai.service.ts:29`, `ai-results.ts:5` | M | Ne pas perdre les garanties de l'adaptateur actuel. |
| Modèle par usage, qualification, secours (20) | absent | `defaultModel`, `DEFAULT_MODELS` | M | — |
| Consommation par fournisseur, plafond mensuel, alerte 80 % (19 §2.3) | partiel | `ai-budget.ts`, `ai-ledger.ts` (jetons non persistés) | M | — |
| GitHub : installations, « À réautoriser », dépôts reliés (19 §2.4) | partiel | `github-{page,installations,status,install-button}.tsx` | S | — |
| Accès et règles du projet, archivage (19 §2.5) | absent | `projectClient.list` (clients seulement) | M | Règles à appliquer, pas seulement afficher. |
| Mon compte : thème Clair / Sombre / Système, notifications (19 §2.6) | partiel | `apps/web/src/lib/theme.ts` (clair / sombre), modèle `Notification` sans préférences | M | « Système » contre la décision H-24 (questions.md). |
| Agents locaux : connexion, postes, révocation, jeton limité au ticket (19 §2.7) | absent | `AuditLog.tokenId` prévu, aucune table de jetons | L | À concevoir avant tout outil MCP. |
| Journal d'audit : écran, catégories, export CSV, un an (21 §3) | partiel | `AuditLog` + triggers immuables (migration `20261030090000_tickets_sprints_leases`), `audit.list` (portée = plus ancien projet) | M | Purge à un an compatible avec les triggers. |

## Lot 14 · Sécurité, partie CI et tickets (21 §0)

| Élément (§) | État | Fichiers | Effort | Risque |
|---|---|---|---|---|
| Contrôles CI « Sécurité » et « Scénarios d'abus » sur les PR | absent | `GitProvider.publishCheck` jamais appelé | M | — |
| Ticket sensible confié à un humain ou à deux relectures | partiel | `Ticket.sensitivity`, `packages/domain/src/ticket-sensitivity.ts` | S | Aucune règle ne l'applique. |

## Lot 15 · Recette (passation 22)

| Élément (§) | État | Fichiers | Effort | Risque |
|---|---|---|---|---|
| Lecture des déploiements GitHub (§0, §2.1) | partiel | `GitProvider.listDeployments`, `packages/domain/src/git-deployment.ts`, enum `WebhookEvent` ; `apps/worker/src/jobs/webhook-delivery.ts:43` ignore tout sauf `push` et `installation` | M | Formats propres à chaque hébergeur. |
| Campagne, retours, notes de version, PV signé, indicateurs, vue client (§2-§3) | absent | modèles `Baseline` / `Review` à imiter, `createTag` | L | La signature engage le client : preuve et audit solides. |
| Aucun aspect financier (§0) | fait | — | — | — |

---

## Ce qui doit être retiré ou remplacé

| Élément | Fichiers | Remplacé par | Lot |
|---|---|---|---|
| Écran Assistant de cadrage (S-framing) | `apps/web/src/app/projects/[projectId]/framing/page.tsx` ; `apps/web/src/components/framing-*.tsx` ; `apps/web/src/lib/framing-*.ts`, `use-framing-*.ts` ; `apps/web/test/framing-*` (18) ; `apps/web/e2e/framing.spec.ts` ; `FramingLink` dans `features-header.tsx`, `features-empty.tsx` | `/spec/functional` + `ProposalReview`. Garder `proposal-editor.tsx`, `proposal-criteria-editor.tsx`, `proposal-issues.tsx`, `use-ai-call.ts`, `ai-error-notice.tsx`, la politique de texte brut et `framing-operations.ts` | 5 |
| Brief | contrat `ai.draftBrief` + schémas (`contract-ai.ts`, `schemas-ai.ts`, OpenAPI) ; `ai.service.ts` `draftBrief` ; `ai-budget.ts` `brief-draft` ; `ai-prompts.ts` ; `spec-scaffold.ts` (`brief/0001-idee-initiale.md`) ; entrée `brief` de `ai.proposeFeatures` ; `docs/functional/guides/frame-with-ai.md` | Dossier d'idée figé `idea-vN` + Synthèse | 2c, 5a |
| Route `/features` | `apps/web/src/app/projects/[projectId]/features/page.tsx` (redirection ; composants conservés) | `/spec/functional?tab=features` | 1 |
| Kanban au niveau de l'organisation | `apps/web/src/app/kanban/*`, `KANBAN_ENTRY`, `/kanban` dans `proxy.ts` et `auth-guard.ts`, boucle `hasNextPage` de `lib/use-kanban-data.ts` | `/projects/[id]/tickets`, chargé par colonne | 1, 12 |
| Projet implicite | `OldestProjectContext` (`apps/api/src/project/project-context.ts`) et ses contrôleurs : ticket, sprint, dépendances, bail, audit, état de projet, commentaires | `projectId` explicite dans le contrat (version majeure) | 1 |
| Liens Membres / GitHub / IA de la barre, routes `/members`, `/github` | `app-sidebar.tsx`, `apps/web/src/app/{members,github}/*` | `/settings/[section]` | 1, 13 |
| Fil d'Ariane v1, liste de projets en vrac | `app-frame.tsx` (`Crumbs`), `features-header.tsx`, `framing-header.tsx`, `nav-projects.tsx`, `nav-main.tsx` (libellé « Navigation ») | `ProjectHeader`, carte projet, « Récents » | 1 |
| Création de projet en deux étapes, reprise locale | `project-create-{sheet,flow,steps,actions}.tsx`, `spec-repo-resume-notice.tsx`, `lib/{creation-resume,use-creation-steps,use-creation-panel,use-creation-page,use-project-creation}.ts`, `repo.createSpec` synchrone | Boîte unique + création en tâche de fond | 4 |
| Tableau des projets | `projects-view.tsx` (`Projects`, `Empty`) | Grille de cartes | 4 |
| Échelle typo v1, tailles en dur | `typography.css`, `text-[30px]` et `text-[22px]` dans `apps/web/src/` | Échelle 01 §0.2 | 0 |
| Bloc Anthropic toujours déplié | `ai-send-policy.tsx` | `InlineAlert` + « Détails » | 0 |
| Filtres en `Select` à libellé | `features-filters.tsx` | Puces pointillées | 1 |
| Exécution d'agents par Koklo | `packages/delivery/src/claude-code/*`, `agent-{runtime,request,tools,credential,budget,output,errors}.ts`, `testing/*`, tests associés ; ADR 0014 | MCP et CLI (agents sur les postes) ; ADR 0014 « remplacée » | 12c |
| Runner et triage autonomes | `packages/delivery/src/run*.ts`, `quota-*.ts` (garder la machine d'étapes si elle sert à `ticket.progress`) | Sessions d'agent remontées par MCP | 12c |
| Titulaire « runner » | `HolderKind.runner`, `AuditActorKind.runner`, `auditActorKindSchema`, `Lease.worktree` | Membre + session d'agent (le journal garde ses anciennes lignes) | 12c |
| Fournisseur IA codé en dur | `ai.service.ts:29`, `ai-call.ts:11,37`, `ai-results.ts:5`, `llm.module.ts`, `ai-settings-page.tsx:37`, `ai-credential-form.tsx:45` | `AiProvider` + modèle par usage | 13b |
| Enum `TicketPackage` (paquets de Koklo) | `schema.prisma` | Paquet libre ou dérivé de l'architecture du projet | 12a |
| Format de spec v1 | `packages/schema/src/entities/{data,screen}.ts`, `parse/kinds.ts`, `spec-scaffold.ts`, `SpecEndpoint` | Formats des passations (`spec_version: 2`) | 5 à 10, 14 |
| Validation par tête globale, client seul | `validation.ts:34`, `REVIEW_SUBMIT_ROLES` | Version par élément, validation d'équipe | 5a |
| Verrou IA en mémoire par organisation | `apps/api/src/ai/ai-gate.ts` | Verrou en base par livrable et par utilisateur × projet | 5a |
| Fiches d'écran | `design/screens/S-framing.md`, `S-features.md`, `S-feature-form.md`, `S-kanban.md`, `S-projects.md` (v6), `S-organizations.md`, `S-members.md`, `S-github.md`, `S-ai-settings.md` | `S-spec-functional`, `SpecItemSheet` (DESIGN.md), `S-tickets`, `S-projects` v7, `S-settings` | voir feuille de route |

Tests à réécrire avec ces retraits :
- **e2e de `apps/web/e2e`** : `sidebar`, `kanban`, `features`, `feature-form`, `framing`, `github`, `ai-settings`, `project-create`, `projects`, `a11y`, `organizations`.
- **e2e de `e2e/tests`** : `kanban`, `r1`, `r2-journeys`, `accept-invitation`, `organizations`.
- **stubs** de `apps/web/e2e/support/`.
- **tests unitaires** de la barre et de la typographie dans `packages/ui/test/`.

## Migrations de données

| Migration | Contenu | Rattrapage des projets existants | Lot |
|---|---|---|---|
| Projet explicite | Aucun déplacement (`Ticket` et `Sprint` portent `projectId`) | Vérifier que l'import du vault (`apps/api/src/cli/import-sprints.ts`, `sprint-import/*`) a bien tout rattaché au plus ancien projet, comme attendu | 1 |
| Dernier projet ouvert, Récents | Table `project_visits (organization_id, user_id, project_id, opened_at)` | Vide : `/` mène à `/projects` | 1 |
| Phase | Calculée, sans colonne : pas de feature et pas de `idea-vN` → `idea` ; sinon `framing` ; tous les livrables validés → `baseline` ; `Baseline` taguée → `iterations` | Projets avec features : `framing` direct, étape Idée « Non utilisée » | 3 |
| Dossier d'idée | Tables `idea_*` | Créer les 10 pages vides pour chaque projet (`origin: template`, 4 requises). Ne pas supprimer `brief/0001-idee-initiale.md` des dépôts ; proposer d'importer son contenu dans Vision en brouillon (questions.md) | 2a |
| Brief | Aucune donnée en base | Purger les brouillons locaux `framingDraftKey` | 5a |
| Propositions et lancements d'agent | Nouvelles tables (lancement, proposition, décision), verrou par livrable | Aucune proposition existante (IA sans état) | 5a |
| Validations | Version par élément : hachage de contenu par entité dans l'index ; `ReviewTargetKind` + flow, rules, roles, deliverable (`ALTER TYPE … ADD VALUE`) ; validation d'équipe | Le trigger `reviews_immutable` interdit la mise à jour : table annexe des versions. Règle : une validation reste valable si le contenu de l'élément n'a pas changé depuis son SHA | 5a |
| Index de spec générique | Table d'entités (kind, specId, zone, chemin, JSON, hachage, texte recherchable `tsvector`) ; index `(project_id, tri, id)` | Réindexation complète des têtes (`apps/worker/src/webhook/index-writer.ts`, `reconcile/`) | 5a puis chaque livrable |
| Format de spec v2 | `spec_version: 2` ; commande de migration en un lot du bot : tables (`T-*.yaml` → cible, types, relations éclatées), endpoints (`E-*` → `zone.verbe`, liens des features), tests (`tests/` → `quality/`), documents en sections, `.koklo/rules.yaml` → `design/rules.yaml`, ajout de `zone:` | Chaque dépôt de spec existant migré une fois, par lot, avec relecture ; `checkVersion` (`packages/schema/src/parse/files.ts`) accepte v1 et v2 pendant la transition | 6 à 10 (une étape par livrable) |
| Règles métier | Vocabulaire : ADR 0012 (`contrainte\|calcul\|workflow` + `tables`, `endpoints`, `exemples`) contre passation 06 §6 (`constraint\|calc\|workflow` + `etats`, `fonctionnalites`) | Choix à faire (questions.md) ; prudence : garder l'ADR et ajouter `etats` et `fonctionnalites` | 5b |
| Création de projet | Table `project_creations` (statut, étape, erreur, nom de dépôt, installation) ; `invitation_projects` | Projet avec `ProjectRepo` spec → terminé ; sans dépôt → « à relancer » | 4 (soldé TK-93) |
| Règles du projet, archivage, préférences | `projects.policies` (JSON), `projects.archived_at`, préférences de thème et de notification | Valeurs par défaut ; thème `light` (H-24) | 13a, 13c |
| Fournisseurs d'IA | Enum `llm_provider` + mistral, openrouter, openai_compatible ; `baseUrl` ; principal / secours ; table modèle par usage ; plafond mensuel ; table de consommation | La clé Anthropic existante devient Principal ; modèles par usage initialisés avec le modèle par défaut actuel | 13b |
| Tickets et sprints | Échéance et début, points, raison de blocage, réalisé par Agent / Humain (depuis `assigneeKind`), paquet libre, capacité de sprint | `estimateHours` conservé à côté des points ; tickets sans sprint → Backlog | 12a |
| Sessions et jetons | Tables `agent_devices`, `agent_sessions`, `tokens` (empreinte, portée, expiration, révocation), lien `AuditLog.tokenId` | Baux actifs `runner` libérés ; lignes `runner` du journal conservées | 12c, 13c |
| Baseline | État retiré / annulé, `signedName`, SHA soumis, cibles des demandes | Aucune baseline existante n'a été créée par le code | 11 |
| Commentaires de spec | Cible par identifiant de spec (pas d'uuid d'index) | — | 6 |

## Briques réutilisables (rappel)

| Brique | Fichiers | Sert à |
|---|---|---|
| Écriture par lots du bot (`Koklo-Ops`, idempotence, `baseSha`) | `apps/api/src/spec-batch/`, `apps/worker/src/spec-write/`, `apps/web/src/lib/use-batch-tracking.ts` | Tous les livrables, publication de l'idée |
| Client GitHub App | `packages/github/src/*`, port `packages/domain/src/git-provider.ts` | Tags `idea-vN`, `baseline-0`, `recette-v*`, déploiements, checks, fusion humaine |
| Webhooks et index | `apps/worker/src/webhook/`, `SpecSnapshot`, `SpecHead` | Impact amont, recette |
| Pipeline IA | `apps/api/src/ai/*`, `packages/domain/src/llm-*.ts`, `packages/llm/` | `AiProvider`, propositions |
| Espace client cloisonné, suggestions, reviews | `apps/api/src/{client-space,project-client,suggestion,review}/` | Vues client, validations |
| Journal d'audit immuable | `AuditLog`, `apps/api/src/tracker/audit.ts` | Activité, journal d'audit |
| Tickets, baux, dépendances | `packages/domain/src/{ticket-transitions,lease,dependency-graph,lock}.ts`, `apps/api/src/{ticket,sprint,lease}/` | Lot 12, sessions |
| Composants web | `kanban-*.tsx`, `features-*.tsx`, `feature-form-*.tsx`, `invite-form.tsx`, `github-*.tsx`, `ai-credential-*.tsx` | Écrans refondus |
| Composition de règles et dérogations | `packages/rules/` | Moteur de règles UI (composition), `koklo/policy` |
| Chiffrement des clés | `apps/api/src/crypto/*`, `llm-credential-aad.ts` | Fournisseurs multiples, jetons |
| Notifications | `apps/api/src/notification/`, `apps/worker/src/jobs/send-notification-email.ts` | Relances, « Sans nouvelles », PV |

## Écarts à la maquette 06 décidés en TK-90 (08/11/2026)

| Maquette | Rendu | Raison |
|---|---|---|
| Aside sous 1024 px non prévu, pas de repli | Panneau sous le document, pleine largeur (B241) | 375 px sans défilement horizontal, un seul chemin au clavier |
| « Envoyé à Anthropic avec la clé de l'organisation » (l.215) | « Envoyé au fournisseur d'IA de l'organisation, avec sa clé. » + « Détails » (B228) | Jamais le nom du fournisseur dans l'interface |
| Icône `auto_awesome` | `wand_stars` (B230) | `auto_awesome` absente du jeu d'icônes |
| Bulle d'agent avec lien vers le document | Pas de lien (B242) | Aucun type « page » dans `EntityChip` |
| Carte « Ce qui manque encore » toujours présente | Après « Voir ce qui manque » (B243) | Un appel du modèle consomme le quota |

| Bouton « Passer au cadrage » : seul l'état désactivé est dessiné (l.62) | État actif : bouton principal du catalogue (B262) | La planche ne montre pas l'état atteint |
| Synthèse, aperçu, « Modifié depuis idea-vN » absents de la planche | Composés avec `Prose`, `EmptyState`, `InlineAlert` (DESIGN.md §5.10, B262) | Décision 05 §2 les décrit sans les dessiner |
| Boutons d'en-tête de l'espace Idée à 375 px : largeur naturelle, 36 px (l.61-62) | Pleine largeur, 44 px (B271) | Cible tactile WCAG 2.2 et fiche S-idea |
| Planche 07 : six cartes de livrables, « quand les 6 sont validés » (l.129, l.339-345) | Sept cartes, « quand les 7 sont validés » (B282) | Décision 21 §0 : Sécurité est le 5e livrable |
| Planche 07 : barre latérale, sélecteur de phase pointillé (l.30-64, l.71-75) | Barre de TK-88 ; pas de sélecteur | Périmés (décision 05 §2) ; le sélecteur est un outil de maquette |
