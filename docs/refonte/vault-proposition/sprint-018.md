---
tags: [sprint/018, vault/timeline, design/refonte]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 018 — Refonte : fondations

> Réécrit le 2026-11-06 (refonte du 6 novembre). Version précédente : « Refonte UI : fondations et shell projet » (TK-87, TK-88) ; TK-88 passe au sprint 019.

## 🎯 Sprint Goal
La galerie `/dev/ui` montre les composants de la refonte en clair et en sombre ; les écrans existants utilisent les nouveaux statuts et l'échelle typographique ; les listes portent leur total et se chargent au défilement ; l'IA existante passe par `AiProvider` sans changement visible.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## 🧑 Prérequis et actions humaines (ignorés par la boucle)
- [x] H-25 — Questions B15, B19 et A4 tranchées par Brice le 2026-11-06 (`docs/refonte/questions.md`, dépôt `koklo`)
- Références : `docs/refonte/passations/01-lots-0-1-passation.md` §Lot 0, `07-principe-listes-longues.md`, `20-decisions-2026-11-06-fournisseurs-ia.md` ; audit `docs/refonte/ecarts.md`.

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-87]** Lot 0 · Fondations : jetons v2, échelle typographique, 8 composants, boutons, galerie `/dev/ui`
  - Labels : pkg:ui, pkg:web, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : —
  - Source : `docs/refonte/passations/01-lots-0-1-passation.md` §0.1 à §0.5 (dépôt `koklo`) ; maquette `docs/refonte/maquettes/04-Lot0Fondations.html` (clair, sombre)
  - Note : Réécrit le 2026-11-06 d'après l'archive de la refonte ; les composants de listes passent dans TK-94.
  - À faire :
    - Jetons `--surface`, `--raised`, `--border-strong`, ombre des éléments flottants et couleurs d'alerte dans `packages/ui/src/styles/` (`theme.css`, `status.css`) ; `--diff-bg` (lot 2 §6.4)
    - Échelle typographique 01 §0.2 dans `packages/ui/src/styles/typography.css` ; retirer les `text-[30px]` et `text-[22px]` de `apps/web/src/`
    - Composants `LifecycleStatus`, `ValidationStatus` (+ « Non soumise »), `DeliverableStatus` (+ variante compacte), `PriorityIndicator`, `EntityChip` (+ primitive `HoverCard`), `InlineAlert`, `EmptyState`, `PhaseRail` (grand et `sm`) dans `packages/ui`
    - Bouton désactivé en pointillés avec raison liée (`aria-describedby`) dans `packages/ui/src/components/button.tsx`
    - Remplacer les badges de statut et de priorité de S-features, S-framing, S-kanban, S-github ; bloc d'envoi en `InlineAlert` + « Détails », sans nom de fournisseur (« agent IA », B15) (`apps/web/src/components/ai-send-policy.tsx`)
    - Galerie `/dev/ui` (équipe, fermée en production par drapeau)
    - Garde « aucune couleur en dur » étendu à tout `apps/web/src` (glob, plus de liste blanche)
  - Critères d'acceptation :
    - [ ] Jetons de 0.1 dans les styles ; aucune couleur en dur dans `apps/web` (test de garde étendu aux nouveaux jetons)
    - [ ] Les 8 composants de 0.3 dans `packages/ui`, avec tests (rendu, `aria-label`, variantes) et axe sans violation en clair et en sombre
    - [ ] Les écrans existants remplacent leurs badges de statut et de priorité par ces composants (S-features, S-framing, S-kanban, S-github)
    - [ ] Le bloc d'envoi au fournisseur d'IA passe en `InlineAlert` + « Détails » dans S-framing et S-ai-settings, toujours rendu avant toute requête
    - [ ] Échelle typographique 0.2 appliquée partout (h1 24 px)
    - [ ] Galerie `/dev/ui` photographiée en clair et en sombre ; inaccessible en production
  - Décision : B15 (tranchée) : le bloc ne nomme jamais le fournisseur ; il parle d'« action IA » ou d'« agent IA » (ex. « Votre texte est envoyé à l'agent IA avec la clé de l'organisation. »)
- [ ] **[TK-94]** Socle listes longues : contrat paginé avec total, composants de liste, `seed:large`
  - Labels : pkg:contract, pkg:ui, pkg:api, pkg:web, pkg:db, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : —
  - Source : `docs/refonte/passations/07-principe-listes-longues.md` §0 à §6, §8 ; `08-lots-5-6-volume-reel-passation.md` §4 ; maquette `docs/refonte/maquettes/12-PrincipeListes.html` (4 schémas, 5 états de pied de liste)
  - À faire :
    - `ListInput` / `ListOutput` (avec `total`, `facets`, `around`) et `PageInput` / `PageOutput` dans `@koklo/contract` ; étendre `pageInputSchema` / `pageOf` (`packages/contract/src/schemas-tickets.ts`) ; version majeure du contrat
    - Composants `VirtualList`, `CountBar`, `ListFooter` (4 états), `Pagination`, `GroupSection`, `DiagramMinimap`, `ZoneNode` dans `packages/ui` ; ADR pour `@tanstack/react-virtual`
    - Recherche plein texte (`tsvector`) et index `(project_id, tri, id)` sur les listes existantes (fonctionnalités, tickets)
    - Appliquer le schéma 1.1 à la liste des fonctionnalités (`apps/web/src/lib/use-features-list.ts`) ; arrêter le chargement complet du kanban (`apps/web/src/lib/use-kanban-data.ts`)
    - `pnpm seed:large` (projet de démonstration en volume, dépôt de spec compris) ; second profil aux volumes des planches
  - Critères d'acceptation :
    - [ ] Données de test de charge : 1 000 fonctionnalités, 300 règles, 80 tables, 500 tickets, 400 propositions dans un projet de démonstration (`pnpm seed:large`)
    - [ ] Chaque vue reste fluide (60 i/s au défilement, première page < 300 ms côté serveur sur ce jeu)
    - [ ] Recherche et filtres testés sur des éléments non chargés
    - [ ] Lien direct vers un élément hors de la première page
    - [ ] États de pied de liste capturés (suite, chargement, erreur, fin) et recherche vide
    - [ ] Liste virtualisée : `aria-setsize` = total, `aria-posinset` réel ; arrivée d'une page annoncée sans voler le focus ; « Charger la suite » atteignable au clavier
  - Décision : B19 (tranchée) : deux profils, `seed:large` (charge) et `seed:planche` (volumes des planches), utilisables en local pour recetter
- [ ] **[TK-95]** Couche `AiProvider` : Vercel AI SDK, modèle par usage, secours, comptage persisté
  - Labels : pkg:llm, pkg:domain, pkg:api, pkg:db, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : —
  - Source : `docs/refonte/passations/20-decisions-2026-11-06-fournisseurs-ia.md` §Décision, §Mise en œuvre ; `19-lot-13-reglages-passation.md` §2.3 (moteur seulement, l'écran est TK-98)
  - À faire :
    - Interface interne `AiProvider` (résolution usage → fournisseur + modèle, bascule de secours, comptage des jetons) à partir du port `packages/domain/src/llm-provider.ts` ; ajout du flux de texte au port
    - Adaptateurs Vercel AI SDK : `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/mistral`, `@ai-sdk/openai-compatible`, `@openrouter/ai-sdk-provider` ; `generateObject` avec les schémas Zod existants ; garder les garanties de `packages/llm/src/anthropic/*` (corps borné, erreurs typées, tarifs) ; ADR 0015 complétée
    - Retirer les fuites de fournisseur codé en dur : `apps/api/src/ai/ai-call.ts:11,37`, `ai.service.ts:29`, `ai-results.ts:5`, `apps/api/src/llm/llm.module.ts`
    - Base : enum `llm_provider` + mistral, openrouter, openai_compatible ; `baseUrl` (garde anti-SSRF) ; principal / secours ; table du modèle par usage (Espace Idée, Livrables de la spec, Récapitulatif de la baseline, Découpage en tickets) ; table de consommation par fournisseur et par mois ; plafond mensuel d'organisation
    - Migration : la clé Anthropic existante devient Principal ; les 4 usages pointent par défaut sur Anthropic, modèle Sonnet (A4)
    - Suite de qualification par usage (jeu de dossiers de référence, sortie conforme au schéma Zod)
  - Critères d'acceptation :
    - [ ] Aucun import d'un SDK de fournisseur hors de `packages/llm` (test de garde)
    - [ ] Les appels IA existants (propositions de fonctionnalités, critères) passent par `AiProvider` sans changement de comportement (tests existants verts)
    - [ ] Bascule de secours testée : erreur ou limite du principal → la demande repart chez le secours ; désactivable
    - [ ] Jetons et coût persistés par fournisseur et par mois ; plafond mensuel : alerte à 80 %, propositions suspendues au plafond
    - [ ] OpenRouter marqué « Intermédiaire » et jamais choisi en secours sur un projet qui exige des données en UE
    - [ ] Une clé d'IA de l'organisation n'est accessible à aucun chemin d'agent de code (test)
  - Décision : A4 (tranchée) : par défaut, Anthropic en Sonnet pour les 4 usages
  - Questions : A5 (seul OpenRouter exclu), B18

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Captures clair / sombre / 375 px comparées à la planche au même état, jointes aux PR ; écart voulu et expliqué
- [ ] axe-core sans violation sur chaque écran touché

## 🚧 Risks
- L'échelle typographique et le bouton désactivé touchent tous les écrans : toutes les captures existantes changent.
- `total` dans les listes et le flux du port IA changent le contrat : version majeure, clients web à adapter dans la même PR.
- Remplacer l'adaptateur Anthropic maison par le Vercel AI SDK sans perdre ses garanties (corps borné, erreurs, tarifs).
