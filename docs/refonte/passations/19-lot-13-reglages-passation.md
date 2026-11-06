# Refonte UI · Lot 13 · Réglages : passation à l'agent dev

> Validé par Brice le 06/11/2026 après recette visuelle.
> Maquette : canevas « Koklo — maquettes » (https://claude.ai/artifact/F6nuypdhrWp1Y7x8QwRiFm), planche **Lot 13 · Réglages**. Sélecteur de maquette : Propriétaire / Développeur / Client.
> À lire avant : **`decisions-2026-11-06-fournisseurs-ia.md`**, **`decisions-2026-11-06-agents-locaux.md`**, `lot-12-tickets-passation.md`, conception v0.6. Remplace `design/screens/S-organizations.md`, `S-members.md`, `S-ai-settings.md`, `S-github.md`.

Route `/settings/[section]`. Coquille habituelle (barre latérale du projet, Réglages actif) ; en-tête « Réglages » + pastille du rôle + résumé (« Atelier Lumière · 3 projets · 6 membres », pour un client « Vous voyez seulement les réglages de votre compte. »). Sous l'en-tête : navigation secondaire à gauche (240 px), contenu à droite (titre de section + une phrase d'explication).

## 1. Navigation selon le rôle

| Groupe | Section | Propriétaire / admin | Développeur | Client |
|---|---|---|---|---|
| Organisation | Général | ✓ | – | – |
| | Membres (badge du nombre) | ✓ | lecture seule | – |
| | Fournisseurs d'IA | ✓ | – | – |
| | GitHub | ✓ | – | – |
| Projet · <nom> | Accès et règles | ✓ | lecture seule | – |
| Vous | Mon compte | ✓ | ✓ | ✓ |
| | Agents locaux (MCP) | ✓ | ✓ | – |

Un groupe sans section visible est masqué. Section non autorisée dans l'URL → section par défaut (Membres, ou Mon compte pour un client). Lecture seule : bandeau `lock` « Lecture seule : seuls les propriétaires et les administrateurs modifient cette section. » et aucun bouton d'action. Le serveur refuse de toute façon (403).

## 2. Sections

### 2.1 Général
Avatar d'organisation, nom, adresse (slug), Enregistrer. Chiffres : projets, membres, fournisseurs d'IA (« Anthropic, OpenAI · ≈ 38 € ce mois »), postes d'agent.

### 2.2 Membres
- **Inviter** : e-mail, rôle (Administrateur, Développeur, Designer, Client, Business), projets (obligatoire pour Client / Business). « Un client ne voit que les projets choisis ici. L'invitation expire après 7 jours ; la personne se connecte avec GitHub ou par lien magique. »
- Tableau : membre (avatar, nom, e-mail), rôle (pastille ; menu pour le propriétaire, jamais sur lui-même), projets, dernière activité, menu d'actions. Client en ambre.
- **Invitations en attente** (bordure pointillée) : e-mail, qui / quand / expiration, rôle, Renvoyer · Annuler.
- `<details>` « Ce que chaque rôle peut faire » : matrice 9 actions × 6 rôles (coche verte / tiret), `aria-label` par cellule. Les agents ne sont jamais des membres.

### 2.3 Fournisseurs d'IA (propriétaire / admin)
Voir la décision du 06/11. Clés BYOK, facturées par le fournisseur, seulement pour le travail en ligne.
- **Fournisseurs** : une ligne par clé (initiales, nom, pastille **Principal** en primaire ou **Secours**, « Vérifiée », qui / quand). Actions : Mettre en principal (pas sur le principal), Vérifier, Remplacer la clé, Retirer (pas sur le principal). OpenRouter porte la pastille ambre **Intermédiaire** et la note sur les données en UE.
- **Ajouter un fournisseur** : choix en cartes radio (Anthropic, OpenAI, Google Gemini, Mistral AI, OpenRouter, Compatible OpenAI ; les fournisseurs déjà ajoutés sont masqués) → champ clé (`type=password`), + adresse de l'API pour Compatible OpenAI → **Vérifier et enregistrer** (requête de test ; la clé n'est gardée que si elle répond ; chiffrée, jamais réaffichée).
- **Modèle par usage** : Espace Idée, Livrables de la spec, Récapitulatif de la baseline, Découpage en tickets. Puce mono « Fournisseur · modèle » + **Changer** (`aria-expanded`) qui déplie une `listbox` des modèles qualifiés des fournisseurs configurés (badge « économique »). Si le fournisseur d'un usage est retiré, l'usage retombe sur le modèle par défaut du principal.
- **Basculer sur le fournisseur de secours** (`role="switch"`) : texte dynamique « Si X répond en erreur ou atteint sa limite, la demande repart chez Y… » ; désactivé avec « Ajoutez un deuxième fournisseur… » s'il n'y a qu'une clé.
- **À quoi servent ces clés** (coches : Idée, livrables, récap et découpage ; `block` rouge : agents de code, jamais) et **Consommation du mois** (total estimé, jetons, barre par fournisseur, plafond mensuel tous fournisseurs, alerte 80 %, suspension au plafond).

### 2.4 GitHub
Une carte par installation de l'application Koklo (compte, état Autorisée / **À réautoriser** en ambre), dépôts reliés (nom mono, rôle `spec` / `monorepo`, projet). « Installer sur un autre compte GitHub ».

### 2.5 Accès et règles du projet
- **Qui a accès** : personnes du projet, rôle, note (« valide le fonctionnel, le design et la baseline »…).
- **Règles** (interrupteurs) : Revue humaine avant toute fusion et Spec jamais fusionnée automatiquement (**verrouillées**, `lock`, « Imposé par Koklo ») ; Bloquer une capture différente d'un écran validé ; Le client peut commenter les tickets (désactivé par défaut) ; Un ticket, un agent à la fois.
- **Archiver le projet** (propriétaire seulement) : lecture seule pour tous, dépôts non touchés, bouton rouge « Archiver… » avec confirmation.

### 2.6 Mon compte
Nom, e-mail, thème (Clair / Sombre / Système), « Me prévenir par e-mail » (interrupteurs). Équipe : validation ou changement client, PR à relire, agent sans nouvelles depuis 20 min, consommation d'IA à 80 % (propriétaire), résumé de la semaine. Client : livrable ou écran à valider, fonctionnalité prête à essayer, réponse à un commentaire.

### 2.7 Agents locaux (MCP)
- **Connecter votre agent** en 3 étapes : `npm install -g @koklo/cli`, `koklo login` (ouvre le navigateur), ajouter le serveur MCP, avec onglets **Claude Code** (`claude mcp add koklo -- koklo mcp`), **Codex** (`~/.codex/config.toml`), **Cursor** (`.cursor/mcp.json`) et un bouton Copier. Puis « prends le ticket TK-108 ».
- **Postes connectés** : poste, outil · ticket · dernière remontée, état (Actif, **Sans nouvelles** ambre, Inactif), Révoquer (le développeur ne voit que son poste).
- **Ce qu'un agent ne peut jamais faire** : fusionner une PR, valider au nom du client, poser une baseline, lire un autre ticket que le sien, utiliser les clés d'IA de l'organisation. Jeton d'agent limité au ticket, écriture sur sa seule branche, expiration 12 h.

## 3. Contrat

| Procédure | Usage |
|---|---|
| `org.get` / `org.update` | Général |
| `member.list`, `member.updateRole`, `member.remove`, `invitation.create` / `resend` / `revoke` | Membres |
| `aiProvider.list`, `aiProvider.add({ kind, apiKey, baseUrl? })` (test avant enregistrement), `aiProvider.verify`, `aiProvider.replaceKey`, `aiProvider.remove`, `aiProvider.setPrimary` | Fournisseurs |
| `aiModel.listQualified({ usage })`, `aiUsage.set({ usage, provider, model })`, `aiSettings.update({ fallback, monthlyCap })`, `aiUsage.report({ month })` | Modèles, secours, consommation |
| `github.installations.list` | GitHub |
| `project.access.list`, `project.policies.update`, `project.archive` | Accès et règles |
| `me.update`, `me.notifications.update` | Mon compte |
| `agentDevice.list`, `agentDevice.revoke` ; CLI `koklo login`, `koklo mcp` | Agents locaux |

Toutes les écritures sont vérifiées côté serveur selon le rôle. Les clés d'IA sont chiffrées au repos et ne sortent jamais de l'API.

## 4. Critères d'acceptation
- [ ] Navigation et accès selon le rôle (propriétaire, développeur, client), bandeau de lecture seule, 403 serveur.
- [ ] Invitation, invitations en attente, matrice des rôles.
- [ ] Plusieurs fournisseurs : ajout avec requête de test, principal / secours, retrait, modèle par usage, bascule de secours, OpenRouter marqué intermédiaire et exclu des projets « données en UE ».
- [ ] Règles verrouillées impossibles à désactiver ; archivage réservé au propriétaire.
- [ ] Agents locaux : instructions par outil, postes, révocation ; aucun agent n'utilise les clés de l'organisation.
- [ ] Captures : chaque section × rôle, ajout de fournisseur, liste de modèles ouverte, clair, sombre, 375 px.

## 5. Points à confirmer
- Plafond mensuel par défaut (100 € sur la maquette) et comportement exact au plafond.
- Durée du jeton d'agent (12 h).
- Option « Le client peut commenter les tickets » : désactivée par défaut ?
- Liste des modèles qualifiés au lancement ; règle « données en UE » par fournisseur.

## 6. Tickets
```
- [ ] **[TK-?]** Lot 13a · Réglages : navigation par rôle, Général, Membres (invitations, matrice), Mon compte. Réf. design/refonte/lot-13-reglages-passation.md §1, §2.1, §2.2, §2.6.
- [ ] **[TK-?]** Lot 13b · Fournisseurs d'IA : couche AiProvider (Vercel AI SDK), clés multiples, test à l'ajout, modèle par usage, secours, consommation et plafond. Réf. §2.3 et decisions-2026-11-06-fournisseurs-ia.md. — dépend de 13a
- [ ] **[TK-?]** Lot 13c · GitHub, Accès et règles du projet, Agents locaux (CLI, MCP, postes, révocation). Réf. §2.4, §2.5, §2.7. — dépend de 13a et du lot 12c
```
