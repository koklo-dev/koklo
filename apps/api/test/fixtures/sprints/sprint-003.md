---
tags: [sprint/003, release/R0, vault/timeline]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 003 — Web, worker et premier e2e

Release : **R0**

## 🎯 Sprint Goal
Les trois apps démarrent ensemble ; un e2e se connecte et voit la liste des projets.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## 🧑 Prérequis et actions humaines (ignorés par la boucle)
- [x] H-24 — Trancher le thème par défaut (clair ou sombre, éventuellement selon le profil client/équipe) avant TK-14 (`DESIGN.md` §8 question 4)
  - Décision (2026-10-27) : thème **clair par défaut**.

<!-- shipyard-progress:start -->
> [!info] Avancement — 6/6 livrée(s)
> `████████████████`  ·  🟡 0 en cours  ·  🔴 0 bloquée(s)  ·  ⚪ 0 à faire
> _Mis à jour par la boucle de livraison le 2026-10-27._
<!-- shipyard-progress:end -->

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [x] **[TK-12]** apps/worker : démarrage pg-boss et job noop
  - Statut : ✅ **livrée** · TK-12 · PR #24 · 2026-10-27 <!-- shipyard-status:TK-12 -->
  - Labels : pkg:worker, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-7
  - Source : CDC §3, §16.1 (Jobs), §22 point 6 ([[vision]])
  - À faire :
    - Processus séparé, consommateur pg-boss sur la même base
    - Job `noop` enregistré et traité
  - Critères d'acceptation :
    - [x] Test d'intégration : un job `noop` publié est consommé et marqué terminé
- [x] **[TK-13]** packages/ui : thème Indigo clair/sombre, statuts, typographie
  - Statut : ✅ **livrée** · TK-13 · PR #25 · 2026-10-27 <!-- shipyard-status:TK-13 -->
  - Labels : pkg:ui, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-4
  - Source : CDC §16.1 (Front), §16.2 ; Design §1, §2, §3, §7 ([[vision]])
  - À faire :
    - Tailwind + shadcn/ui ; variables `:root` et `.dark` recopiées **à l'identique** de `DESIGN.md` §2.1 (y compris `--radius: 0.5rem`)
    - Couleurs de statut de `DESIGN.md` §2.2 (Validée, À valider, À revoir) en variables dédiées, clair et sombre ; le violet de marque n'est jamais un statut
    - Polices Instrument Sans (400–700) et JetBrains Mono (400–500) **auto-hébergées** (Fontsource ; pas de chargement Google Fonts) ; échelle typographique de `DESIGN.md` §3
    - Les valeurs marquées « à confirmer » (`--destructive`, accent) sont reprises telles quelles et regroupées pour pouvoir changer sans toucher aux composants
  - Critères d'acceptation :
    - [x] Test : chaque variable de `DESIGN.md` §2.1 existe avec la même valeur, en clair et en sombre
    - [x] Test de contraste : toutes les paires texte/fond de §2.1 et §2.2 atteignent 4,5:1 (AA, `DESIGN.md` §7) ; une paire sous le seuil fait échouer la suite
    - [x] Aucune requête vers `fonts.googleapis.com` au chargement
- [x] **[TK-84]** packages/ui : icônes Material Symbols Rounded et composants shadcn
  - Statut : ✅ **livrée** · TK-84 · PR #27 · 2026-10-27 <!-- shipyard-status:TK-84 -->
  - Labels : pkg:ui, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-13
  - Source : Design §4, §5, §7 ([[vision]])
  - À faire :
    - Icônes **Material Symbols Rounded** en SVG chargés à la demande (`@material-symbols/svg-400` ou Iconify `material-symbols`), jamais la police complète ; composant `Icon` (graisse 400, remplissage 0 ; remplissage 1 pour l'état actif et les statuts ; tailles 16/18/20/22/28)
    - Composants shadcn/ui de `DESIGN.md` §5 : Table, Badge, Tabs, Button, Sheet, Card, Accordion, Alert, Select, Popover, Resizable, Avatar, DropdownMenu ; **imports Lucide remplacés** par `Icon`
    - Formes de §5 : rayons 6 px (boutons, champs), 8–10 px (cartes), 10–12 px (panneaux), pastille (badges) ; hauteurs 36–38 px ; bordure 1 px `--border`, ombre seulement sur les éléments flottants
    - Composant `StatusBadge` : couleur de statut **et** icône pleine (`check_circle`, `schedule`, `edit_note`)
  - Critères d'acceptation :
    - [x] Aucun import de `lucide-react` dans le workspace (vérifié par un test ou une règle de lint)
    - [x] Un bouton d'icône sans `aria-label` fait échouer un test
    - [x] `StatusBadge` rend toujours une icône (test pour les trois statuts)
    - [x] Les composants s'importent depuis `@koklo/ui` uniquement par son point d'entrée
- [x] **[TK-14]** apps/web : connexion GitHub et page projets
  - Statut : ✅ **livrée** · TK-14 · PR #28 · 2026-10-27 <!-- shipyard-status:TK-14 -->
  - Labels : pkg:web, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-11, TK-84
  - Source : CDC §3, §16.1, §20.4 (images promouvables), §22 point 5 ; Design §5 ([[vision]])
  - À faire :
    - Next.js App Router, client oRPC via `@orpc/tanstack-query`
    - Gabarit d'application de `DESIGN.md` §5 : barre latérale 248 px, marge de page 32 px, panneau de détail 380–440 px ; empilement sur mobile
    - Bascule clair/sombre (`light_mode` / `dark_mode`) ; thème par défaut selon H-24 ; logo : le « K » temporaire de la maquette (aucune marque définitive, `DESIGN.md` §8)
    - Configuration lue à l'exécution : aucune variable `NEXT_PUBLIC_*` figée au build
    - Pages : connexion (GitHub), liste des projets avec états vide, chargement, erreur
  - Critères d'acceptation :
    - [x] Capture Playwright de chaque état de la page projets jointe à la PR (DoD §19.4 point 3)
    - [x] Étape design du workflow tenue : chaque écran touché a sa fiche `design/screens/<S-id>.md` créée ou mise à jour (réflexion UI/UX, états, alternatives écartées, ligne d'historique) ; captures réelles clair et sombre dans la PR
    - [x] Conforme à `DESIGN.md` : composants et tokens de `@koklo/ui` uniquement (aucune couleur ni icône en dur), rendu vérifié en clair et en sombre, accessibilité §7 (AA, vrais `button`/`a`/`input` avec `label`, `aria-label` sur les boutons d'icône, statut jamais signalé par la couleur seule, variante mouvement réduit)
- [x] **[TK-15]** e2e Playwright : se connecter et voir les projets
  - Statut : ✅ **livrée** · TK-15 · PR #30 · 2026-10-27 <!-- shipyard-status:TK-15 -->
  - Labels : safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-8, TK-12, TK-14
  - Source : CDC §16.3 (`pnpm e2e`), §19.1, §22 point 7 ([[vision]])
  - À faire :
    - `pnpm e2e` : Postgres (Compose), migration, seed, build, `playwright test`
    - Job CI e2e ajouté au workflow ; `pnpm dev` lance web, api, worker et Postgres en une commande
  - Critères d'acceptation :
    - [x] Le test « session de test → liste des projets du seed » est vert en CI
- [ ] **[TK-85]** apps/web : gabarit `sidebar-07` et connexion `login-05` (blocs shadcn/ui)
  - Statut : 🔁 **rouverte** · 2026-10-28 · sidebar-07 et login-05 non installés via la CLI (constat Chrome + code) ; correction par workflow koklo-delivery sur `fix/TK-85-shadcn-blocks-cli`
  - Labels : safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-14, TK-15
  - Source : demande de l'opérateur (2026-10-27) : ne pas réinventer la roue, reprendre les blocs et composants de shadcn/ui ; `DESIGN.md` §5 ([[vision]])
  - À faire :
    - Avant toute installation : appliquer le skill `dependency-selection` (dernière version stable de la CLI `shadcn`, documentation officielle via Context7), puis lire https://ui.shadcn.com/blocks/sidebar
    - `npx shadcn@latest add sidebar-07` pour le gabarit d'application, en remplacement du gabarit fait main de TK-14 (barre latérale, marge de page, panneau de détail, empilement mobile de `DESIGN.md` §5)
    - `npx shadcn@latest add login-05` pour la page de connexion, en remplacement de la page faite main (le seul fournisseur reste GitHub via Better Auth ; on garde la logique et les états existants)
    - Récupérer les composants shadcn déjà disponibles plutôt que d'en écrire (par exemple `code-block`, https://ui.shadcn.com/docs/components/base/code-block) ; n'écrire en propre que ce que shadcn ne fournit pas
    - Adapter chaque bloc installé aux tokens de `DESIGN.md` : couleurs, rayon, thème clair par défaut (H-24) ; les icônes Lucide des blocs sont remplacées par le composant `Icon` (Material Symbols Rounded, choix de TK-84) ; l'écart avec le bloc d'origine se limite à cela (tokens, icônes, textes)
    - Installer les composants dans `packages/ui` quand ils sont partagés, et les blocs dans `apps/web` ; mettre à jour le test e2e de TK-15 si les sélecteurs changent
  - Critères d'acceptation :
    - [ ] Les blocs `sidebar-07` et `login-05` sont installés avec la CLI shadcn (pas recopiés à la main) ; la version de la CLI est justifiée dans la PR (`package | version retenue | dernière stable | source`)
    - [ ] Aucune icône Lucide ni couleur en dur dans le code livré ; rendu vérifié en clair et en sombre, accessibilité §7 (AA, navigation clavier de la barre latérale, `aria-label` sur les boutons d'icône)
    - [ ] Étape design du workflow tenue : fiches `design/screens/<S-id>.md` des écrans touchés mises à jour, captures réelles clair et sombre dans la PR
    - [ ] `pnpm e2e` reste vert en CI

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Tous les TK mergés
- [ ] `pnpm dev` démarre tout en local en une commande (DoD §22)

## 🚧 Risks
- Aucun identifié à la rédaction.
