---
tags: [sprint/005, release/R0, vault/timeline]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 005 — Organisations, membres, projets

Release : **R0**

## 🎯 Sprint Goal
Se connecter en staging, créer une organisation et un projet (résultat vérifiable de R0).

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [x] **[TK-20]** Extension Prisma multi-tenant
  - Labels : pkg:db, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-7
  - Source : CDC §15, §18.4 ([[vision]])
  - À faire :
    - `organization_id` indexé sur chaque table métier
    - Extension du client : toute requête sur un modèle métier exige un contexte d'organisation, sinon erreur
  - Critères d'acceptation :
    - [x] Une requête sans contexte échoue avec une erreur nommée (test)
    - [x] Une requête avec contexte ne voit que son organisation (test sur deux organisations)
- [x] **[TK-21]** Contrat : organisations, membres, projets
  - Labels : pkg:contract, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-9
  - Source : CDC §4, §14 ([[vision]])
  - À faire :
    - Procédures `organization.create`, `organization.list`, `member.invite`, `member.list`, `member.setRole`, `project.create`
    - Erreurs typées (permission refusée, conflit)
  - Critères d'acceptation :
    - [x] Test de contrat mis à jour (version incrémentée)
- [x] **[TK-22]** Lien magique et envoi d'emails
  - Labels : pkg:api, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-11, TK-12
  - Source : CDC §16.1 (Auth), §16.5 (Emails), §20.3 ([[vision]])
  - À faire :
    - Better Auth lien magique ; email envoyé par un job pg-boss (Resend via `RESEND_API_KEY`, `MAIL_DOMAIN`, `EMAIL_FROM`)
    - En CI, emails capturés (aucun secret)
  - Critères d'acceptation :
    - [x] Test d'intégration : demande de lien → email capturé → connexion avec le lien
    - [x] Un lien expiré est refusé
- [x] **[TK-23]** Organisations, membres et rôles (plugin organisations)
  - Labels : pkg:api, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-20, TK-21
  - Source : CDC §14, §15 ([[vision]])
  - À faire :
    - Plugin organisations de Better Auth ; rôles du §14 ; guards NestJS par procédure
    - `project.create` dans le module `project`
  - Critères d'acceptation :
    - [x] Matrice de permissions du §14 testée pour les procédures livrées
    - [x] Un client ne peut pas créer de projet
- [x] **[TK-24]** Web : organisations, membres, création de projet
  - Labels : pkg:web, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-23
  - Source : CDC §21 (R0) ([[vision]])
  - À faire :
    - Pages : créer une organisation, inviter un membre, créer un projet
  - Critères d'acceptation :
    - [x] e2e : se connecter, créer une organisation, créer un projet
    - [x] Preuve navigateur jointe
    - [x] Étape design du workflow tenue : chaque écran touché a sa fiche `design/screens/<S-id>.md` créée ou mise à jour (réflexion UI/UX, états, alternatives écartées, ligne d'historique) ; captures réelles clair et sombre dans la PR
    - [x] Conforme à `DESIGN.md` : composants et tokens de `@koklo/ui` uniquement (aucune couleur ni icône en dur), rendu vérifié en clair et en sombre, accessibilité §7 (AA, vrais `button`/`a`/`input` avec `label`, `aria-label` sur les boutons d'icône, statut jamais signalé par la couleur seule, variante mouvement réduit)
- [x] **[TK-86]** Web : acceptation d'une invitation (`/accept-invitation/<id>`)
  - Labels : pkg:web, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-23, TK-24
  - Source : limite connue de TK-23 et TK-24 (le lien de l'e-mail d'invitation, `<BETTER_AUTH_URL>/accept-invitation/<id>`, donne une 404). Le CDC §14 ne décrit pas le parcours d'acceptation : il ne cite que la table des invitations (§18) ; le parcours est à confirmer par la personne qui valide le ticket ([[vision]])
  - À faire :
    - Page `/accept-invitation/<id>` : l'invité rejoint l'organisation avec le rôle de l'invitation (acceptation portée par Better Auth, aucune nouvelle procédure du contrat attendue ; à confirmer à l'analyse)
    - Sans session : renvoi vers `/login`, puis retour sur l'invitation après la connexion
    - Cas d'erreur : invitation expirée, annulée, déjà acceptée ou inconnue ; adresse de la session différente de celle invitée ; déjà membre
  - Critères d'acceptation :
    - [x] e2e : une personne invitée se connecte, ouvre le lien, accepte, puis apparaît dans `/members` avec le rôle invité et l'organisation devient active sur sa session
    - [x] Chaque cas d'erreur affiche un message clair en français, jamais une 404 ni une page vide
    - [x] Un lien d'invitation ne révèle ni jeton ni autre donnée de l'organisation avant l'acceptation ; aucun jeton dans les logs
    - [x] Preuve navigateur jointe
    - [x] Étape design du workflow tenue : fiche `design/screens/<S-id>.md` créée (réflexion UI/UX, états, alternatives écartées, ligne d'historique) ; captures réelles clair et sombre dans la PR
    - [x] Conforme à `DESIGN.md` : composants et tokens de `@koklo/ui` uniquement, rendu vérifié en clair et en sombre, accessibilité §7

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Résultat R0 vérifié en staging : connexion, création d'organisation et de projet

## 🚧 Risks
- Aucun identifié à la rédaction.
