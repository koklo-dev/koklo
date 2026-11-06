---
tags: [sprint/019, vault/timeline, design/refonte]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 019 — Refonte : coquille et réglages

> Réécrit le 2026-11-06 (refonte du 6 novembre). Version précédente : « Refonte UI : espace Idée » (TK-89 à TK-91), déplacée au sprint 020.

## 🎯 Sprint Goal
Navigation à deux niveaux (organisation, projet) avec la barre « SPEC 0/7 », l'en-tête `ProjectHeader` et la recherche ⌘K ; le kanban vit sous son projet ; les Réglages s'affichent selon le rôle ; l'organisation enregistre plusieurs fournisseurs d'IA avec un principal et un secours.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## 🧑 Prérequis et actions humaines (ignorés par la boucle)
- Sprint 018 livré.
- [ ] H-26 — Répondre aux questions A1 (plafond mensuel), A5 (données en UE) et B16 (thème « Système ») de `docs/refonte/questions.md`
- Références : `docs/refonte/passations/01-lots-0-1-passation.md` §Lot 1, `05-decisions-2026-11-05-spec-sans-brief.md` §2 « Lot 1 », `21-lot-14-securite-passation.md` §0, `19-lot-13-reglages-passation.md`, `20-decisions-2026-11-06-fournisseurs-ia.md`.

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-96]** Projet explicite dans le contrat : retrait d'`OldestProjectContext`
  - Labels : pkg:contract, pkg:api, pkg:web, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : —
  - Source : `docs/refonte/passations/01-lots-0-1-passation.md` §1.2 (tickets sous le projet) ; `docs/refonte/ecarts.md` (écart structurant 1)
  - À faire :
    - Ajouter `projectId` aux procédures tickets, sprints, dépendances, baux, audit, état de projet et commentaires (`packages/contract/src/schemas-tickets.ts`, `contract-tickets.ts`, `contract-collaboration.ts`) ; version majeure du contrat
    - Remplacer `OldestProjectContext` (`apps/api/src/project/project-context.ts`) par un contexte résolu depuis l'entrée, avec contrôle d'accès au projet (`prisma-project-access.ts`)
    - Adapter les appels web existants (kanban, audit) en passant le projet
    - Vérifier que l'import du vault (`apps/api/src/cli/import-sprints.ts`, `sprint-import/*`) a bien rattaché ses tickets au projet attendu
  - Critères d'acceptation :
    - [ ] Aucune procédure ne déduit plus le projet : `OldestProjectContext` supprimé (test de garde)
    - [ ] Avec deux projets, tickets, sprints et audit de l'un ne sont jamais visibles depuis l'autre (test serveur)
    - [ ] Un membre sans accès au projet reçoit 403 ou 404 sur chaque procédure
- [ ] **[TK-88]** Lot 1 · Coquille : `AppShell`, barre « SPEC N/7 », `ProjectHeader`, routes projet, ⌘K, correctifs
  - Labels : pkg:web, pkg:ui, pkg:api, pkg:contract, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-87, TK-94, TK-96
  - Source : `docs/refonte/passations/01-lots-0-1-passation.md` §1.1 à §1.7 ; `05-decisions-2026-11-05-spec-sans-brief.md` §1.7, §2 « Lot 1 » ; `21-lot-14-securite-passation.md` §0 (7 livrables, lot 14a) ; `12-lot-8-technique-passation.md` §8.4 ; maquette `docs/refonte/maquettes/05-Lot1Shell.html` (barre : suivre la planche `10-Lot5Fonctionnel.html`, la 05 est périmée, questions B2)
  - Note : Réécrit le 2026-11-06. Absorbe le ticket « Lot 14a · Spec à 7 livrables » (21 §7).
  - À faire :
    - `AppShell` : barre collante pleine hauteur, 256 / 64 px, état en `localStorage`, tiroir sous 768 px (`packages/ui/src/components/sidebar.tsx`, `apps/web/src/components/app-frame.tsx`) ; sélecteur d'organisation ; carte projet avec `PhaseRail sm` ; groupes Projet et Organisation ; pied
    - Groupe « SPEC » : en-tête 11 px + compteur « N/7 », 7 entrées numérotées (Fonctionnel, Données, Architecture, Technique, Sécurité, Design, Qualité), cadenas et infobulle pour les entrées indisponibles, sans chevron ; disponibilité dérivée côté serveur en attendant `spec.deliverables` (TK-100) ; entrée « Assistant de cadrage » vers l'écran actuel jusqu'au lot 5
    - Retirer de la barre Kanban d'organisation, Membres, GitHub, IA, la liste de projets en vrac, le libellé « Navigation » (`app-sidebar.tsx`, `nav-projects.tsx`, `nav-main.tsx`)
    - Routes : `/projects/[id]` (redirige vers Spec · Fonctionnel), `/idea` et `/spec/*` en `EmptyState` « Bientôt », `/spec/functional?tab=features` (écran actuel, `/features` redirige), `/projects/[id]/tickets` (kanban actuel par projet, `/kanban` redirige), `/settings/[section]` avec les trois écrans existants (`/members`, `/github`, `/settings/ai` redirigent) ; gardes `auth-guard.ts` et `proxy.ts` ; `/` vers le dernier projet ouvert (table `project_visits`)
    - `ProjectHeader` (3 lignes, onglets en liens) sur Assistant de cadrage, Spec · Fonctionnel, Tickets ; retrait du fil d'Ariane v1
    - Palette ⌘K (`cmdk`, ADR) : recherche serveur, 20 résultats, anti-rebond 200 ms
    - Correctifs 1.6 : focus du menu utilisateur, ombre de bord du kanban, message « Réessayez dans 30 s » unique
  - Critères d'acceptation :
    - [ ] Tous les écrans connectés rendus dans `AppShell` ; captures clair / sombre / 375 px de chaque écran existant
    - [ ] Barre étendue, repliée et tiroir mobile testés au clavier (ordre de focus, `aria-current`, `aria-label` des icônes seules, `aria-disabled` des entrées verrouillées)
    - [ ] Groupe « SPEC » avec ses 7 entrées numérotées et le compteur « N/7 » ; entrées non livrées en `EmptyState`, aucun lien mort
    - [ ] ⌘K ouvre la palette, Échap la ferme, résultats navigables aux flèches ; la recherche porte sur des éléments non chargés
    - [ ] Kanban accessible sous `/projects/[projectId]/tickets` uniquement ; `/features`, `/kanban`, `/members`, `/github` redirigent
    - [ ] Réglages regroupés ; plus aucune entrée Membres / GitHub / IA dans la barre
    - [ ] `ProjectHeader` sur Assistant de cadrage, Spec · Fonctionnel, Tickets ; fil d'Ariane v1 retiré
  - Questions : B2 (planche 05 périmée), B3 (⌘K serveur), B4 (`/settings/[section]`)
- [ ] **[TK-97]** Lot 13a · Réglages : navigation par rôle, Général, Membres, Mon compte
  - Labels : pkg:web, pkg:api, pkg:contract, pkg:db, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-88
  - Source : `docs/refonte/passations/19-lot-13-reglages-passation.md` §1, §2.1, §2.2, §2.6, §3 ; maquette `docs/refonte/maquettes/24-Lot13Reglages.html` (Propriétaire, Développeur, Client)
  - À faire :
    - Navigation secondaire de 240 px selon le rôle ; section non autorisée → section par défaut ; bandeau de lecture seule ; 403 serveur
    - Général : `org.get` / `org.update` (avatar, nom, slug, chiffres)
    - Membres : invitation avec projets obligatoires pour Client / Business (table `invitation_projects`), tableau (rôle, projets, activité, menu), `member.updateRole` (jamais sur soi), `member.remove`, invitations en attente (`invitation.list`, `resend`, `revoke`), matrice « Ce que chaque rôle peut faire » ; pagination numérotée (07, schéma 1.2) ; reprendre `invite-form.tsx`, `role-field.tsx`, `members-page.tsx`
    - Mon compte : nom, e-mail, thème Clair / Sombre / Système, préférences de notification par e-mail (respectées par le worker)
    - Fiches `S-organizations.md`, `S-members.md` passent en « remplacée par S-settings »
  - Critères d'acceptation :
    - [ ] Navigation et accès selon le rôle (propriétaire, développeur, client), bandeau de lecture seule, 403 serveur
    - [ ] Invitation, invitations en attente, matrice des rôles
    - [ ] Un client ne voit que les projets choisis à son invitation (test serveur)
    - [ ] Captures : chaque section × rôle, clair, sombre, 375 px
  - Questions : B16 (« Système » ajouté, « Clair » par défaut)
- [ ] **[TK-98]** Lot 13b · Fournisseurs d'IA : écran, ajout testé, principal et secours, modèle par usage, consommation
  - Labels : pkg:web, pkg:api, pkg:contract, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-95, TK-97
  - Source : `docs/refonte/passations/19-lot-13-reglages-passation.md` §2.3, §3 ; `20-decisions-2026-11-06-fournisseurs-ia.md` §Écran ; maquette `docs/refonte/maquettes/24-Lot13Reglages.html` (Fournisseurs d'IA, liste de modèles ouverte)
  - À faire :
    - Procédures `aiProvider.list/add/verify/replaceKey/remove/setPrimary`, `aiModel.listQualified`, `aiUsage.set`, `aiSettings.update`, `aiUsage.report`
    - Ajout guidé (6 fournisseurs en cartes radio, clé `type=password`, adresse pour Compatible OpenAI) : requête de test **avant** enregistrement, clé chiffrée, jamais réaffichée (reprendre `apps/api/src/llm-credential/*`, `apps/api/src/crypto/*`)
    - Liste Principal / Secours / « Intermédiaire » (OpenRouter), modèle par usage avec « Changer » (`listbox`), interrupteur de secours, consommation par fournisseur et plafond mensuel
    - Remplacer le filtre `anthropic` de `ai-settings-page.tsx:37` et `ai-credential-form.tsx:45` ; fiche `S-ai-settings.md` remplacée
  - Critères d'acceptation :
    - [ ] Plusieurs fournisseurs : ajout avec requête de test, principal / secours, retrait, modèle par usage, bascule de secours, OpenRouter marqué intermédiaire et exclu des projets « données en UE »
    - [ ] Une clé qui échoue au test n'est jamais enregistrée (test)
    - [ ] Section réservée au propriétaire et à l'administrateur (403 serveur)
    - [ ] Captures : ajout de fournisseur, liste de modèles ouverte, clair, sombre, 375 px
  - Questions : A1 (pas de plafond par défaut), A5, B18

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Captures clair / sombre / 375 px comparées à la planche au même état, jointes aux PR ; écart voulu et expliqué
- [ ] axe-core sans violation sur chaque écran touché ; tests de droits côté serveur

## 🚧 Risks
- TK-96 change le contrat de toutes les procédures de pilotage : version majeure, e2e et stubs à reprendre.
- La coquille touche tous les écrans et toutes les captures ; les e2e `sidebar`, `kanban`, `features`, `projects`, `github`, `ai-settings` sont à réécrire.
- La planche 05 est plus ancienne que les décisions (barre « 2/6 », chevron) : chaque écart doit être expliqué dans la PR.
