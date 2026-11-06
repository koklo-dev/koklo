# Refonte UI · Lot 11 · Validation et Baseline 0 : passation à l'agent dev

> Validé par Brice le 05/11/2026 après recette visuelle.
> Maquette : canevas « Koklo — maquettes » (https://claude.ai/artifact/F6nuypdhrWp1Y7x8QwRiFm), planche **Lot 11 · Validation et Baseline 0**. Sélecteurs de maquette : Prête, Chez le client, Vue client, Changements, Posée ; Démo / **Volume réel**.
> À lire avant : `lot-3-vue-ensemble-passation.md` (§4 phases, §7.4), `lot-10-qualite-passation.md`, `principe-proposer-avec-agent.md`, conception v0.6 (Review, Release / Baseline).

Ce lot livre la page **Baseline 0** (route `/projects/[id]/baseline`, entrée « Baseline 0 » dans la barre latérale entre Qualité et Tickets, badge d'état). Quand les 6 livrables sont validés, l'équipe soumet la baseline au client ; **le client seul la valide** ; Koklo pose alors le tag `baseline-0` sur le dépôt de spec et le projet passe en phase Itérations.

## 1. Règles

- Soumission (owner, admin) possible seulement si **aucun contrôle bloquant** (§4.2).
- **Validation : client uniquement** (conception §9) ; la pose du tag est faite par Koklo à la validation, pas par un humain (l'agent n'a jamais ce droit).
- La validation pointe le **SHA** soumis ; si la spec change entre la soumission et la validation, la soumission est annulée (bandeau « La spec a changé depuis la soumission ») et il faut resoumettre.
- Après la pose : spec figée ; toute modification passe par une **demande de changement** (CR) ; `project.phase = 'iterations'` ; tickets générables (lot 12).

## 2. Gabarit

- Barre latérale : carte de phase dynamique (« Baseline 0 · 3 sur 4 », puis « Itérations · 4 sur 4 ») ; entrée Baseline 0 avec badge Prête / Chez le client / À valider (client) / Changements / Posée.
- En-tête : h1 « Baseline 0 », statut, résumé **sous le titre**, actions à droite. Onglets **Récapitulatif** (`summarize`), **Contrôles** (`rule`, compteur ambre des contrôles en échec ; masqué pour le client), **Historique** (`history`).
- Contenu en deux colonnes : principale (`flex: 999 1 620px`) et colonne **Validation** à droite (340–420 px).
- En tête de la colonne principale, **3 étapes** (cartes 52 px) : Les 6 livrables validés (« 6 sur 6 ») → Validation du client (« À soumettre », « Chez Marie Lefèvre », « Changements demandés ») → Baseline posée (« baseline-0 · 6 nov. ») ; pastille 28 px : coche verte (fait), numéro sur primaire + contour et halo (en cours), « ! » ambre (changements), numéro en contour (à venir).

## 3. États

| État | Statut (en-tête) | Résumé | Actions | Colonne droite |
|---|---|---|---|---|
| Prête | « Prête à soumettre » `--soft`, `flag` | « 6 livrables validés sur 6 · aucun contrôle bloquant · version d19a03c » | **Proposer avec l'agent** · **Soumettre au client** (primaire) | texte d'explication, liste de pré-contrôles (coches vertes, info ambre non bloquante), « Soumettre à Marie Lefèvre » pleine largeur (pointillé si bloqué) |
| Chez le client | « Chez le client » ambre | « Soumise à Marie Lefèvre le 5 nov. à 18:02 · version… » | Copier le lien | encadré ambre « Soumise il y a 2 h. Marie a ouvert la page à 19:40 et lu 4 livrables sur 6. » ; Copier le lien · Retirer la demande |
| Vue client | « À valider par vous » ambre | « Version du 5 nov. · 6 livrables » | — | voir §5 |
| Changements | « Changements demandés » ambre | « 3 demandes de Marie Lefèvre · 2 livrables repassent « À revoir » » | Proposer avec l'agent · **Traiter les demandes** | demandes (cible mono, statut À traiter / Accepté par l'équipe, texte), « Traiter les demandes » |
| Posée | « Posée » vert | « Baseline 0 posée le 6 nov. · tag baseline-0 · d19a03c · validée par Marie Lefèvre » | Récapitulatif PDF · bientôt (désactivé) · **Générer les tickets du premier sprint** | Tag, Version, Validée par, Le ; encadré « Ce qui change maintenant » (3 puces) |

Bandeaux dans la colonne principale : **Posée** (vert, tuile `flag`, « La baseline 0 est posée… la construction peut commencer ») ; **Changements** (ambre, « Marie Lefèvre demande 3 changements avant de valider… la baseline repart à l'étape 1 une fois les livrables revalidés »). Les livrables concernés par une demande passent « À revoir » (carte bordée ambre, barre latérale).

## 4. Onglets

### 4.1 Récapitulatif
- **Les 6 livrables** : grille `minmax(280px, 1fr)` ; carte = lien vers le livrable : tuile icône, nom, pastille Validé / À revoir, contenu chiffré, « Validé par … le … » (icône `person` si client, `groups` si équipe), SHA mono (équipe seulement).
- **Récapitulatif pour le client** : carte avec en-tête « Proposé par l'agent, relu par Moussa · 5 nov. » (client : « Rédigé par l'équipe pour vous ») ; sections en clair, **sans identifiants ni jargon** : Ce que le produit fera · Ce qui n'est pas compris · Comment on vérifiera · Après votre validation. Fichier `baseline/recap.md` (rédigé via « Proposer avec l'agent » → Rédiger le récapitulatif client ; modifiable par l'équipe).

### 4.2 Contrôles (équipe)
Contrôles croisés recalculés à chaque version (`baseline.checks`). Ligne : icône d'état (vert / rouge / info ambre), **titre et détail à gauche, avec l'action éventuelle juste dessous** (bouton orange, icône `arrow_forward` : « Voir l'écran », « Répondre »), puis à droite deux colonnes alignées : pastille **Bloquant** (`--soft`) / **Informatif** (contour) dans une colonne de 96 px, valeur mono (min. 64 px, alignée à droite).

| Contrôle | Type |
|---|---|
| Chaque fonctionnalité indispensable a un écran ou une opération | Bloquant |
| Chaque critère d'acceptation a un scénario | Bloquant |
| Chaque écran est validé par le client sur la version courante | Bloquant |
| Aucun choix technique « à trancher » | Bloquant |
| Aucun livrable « À revoir » | Bloquant |
| Commentaires du client sans réponse | Informatif |
| Exigences sans scénario automatique (vérifiées à la main) | Informatif |

### 4.3 Historique
Frise : pastille 30 px (la plus récente sur primaire), phrase complète, date. Événements : dossier figé, validation de chaque livrable, soumission, changements demandés, validation et pose du tag.

## 5. Vue client

- Encadré d'accueil : « Dernière étape du cadrage » · « Votre projet est prêt à être construit » · ce que signifie la validation.
- Pas d'onglet Contrôles, pas de SHA.
- Colonne « Votre validation » : rappel (« Vous avez déjà validé le cahier fonctionnel et chaque écran… ») ; case **« J'ai relu le récapitulatif et je l'accepte comme référence du projet »** ; champ **« Votre nom, pour signer »** ; **Valider la baseline 0** (primaire, désactivé tant que la case n'est pas cochée) ; **Demander des changements** (ouvre une saisie de demandes ancrées sur un élément ou un écran) ; mention « Version du 5 nov. · votre validation est datée et liée à cette version précise ».

## 6. Contrat

| Procédure | Usage |
|---|---|
| `baseline.get({ projectId })` | état, livrables, récapitulatif, historique |
| `baseline.checks({ projectId })` | contrôles croisés (bloquant / informatif, valeur, action) |
| `baseline.submit({ projectId, sha })` | soumission (owner, admin) ; 409 si contrôle bloquant |
| `baseline.withdraw({ projectId })` | retirer la demande |
| `baseline.approve({ projectId, sha, signedName })` | client seulement ; pose `baseline-0` sur le dépôt de spec, `project.phase = 'iterations'` |
| `baseline.requestChanges({ projectId, sha, items: [{ target, text }] })` | client ; cibles passées « À revoir » |
| `ai.proposeDeliverable({ deliverable: 'baseline', mode: 'recap' \| 'check' \| 'risks' })` | bouton agent commun |

Événements journalisés (`JournalAudit`) et notifications : soumission (au client), validation et changements demandés (à l'équipe).

## 7. Critères d'acceptation

- [ ] 5 états, 3 étapes, 3 onglets, vue client avec signature.
- [ ] Soumission impossible avec un contrôle bloquant ; validation par le client seul, liée au SHA ; tag `baseline-0` posé.
- [ ] Changements demandés : cibles « À revoir », retour à l'étape 1.
- [ ] Phase du projet et carte de phase mises à jour (lot 3) ; « Générer les tickets du premier sprint » mène au lot 12.
- [ ] Contrôles : actions orange sous le texte, colonnes de droite alignées.
- [ ] Captures : chaque état × onglet, clair, sombre, 375 px.

## 8. Tickets

```
- [ ] **[TK-?]** Lot 11a · Baseline 0 : baseline.get / checks / submit / withdraw, page équipe (étapes, Récapitulatif, Contrôles, Historique), récapitulatif via l'agent. Réf. design/refonte/lot-11-baseline-passation.md §1 à §4, §6. — dépend du lot 10
- [ ] **[TK-?]** Lot 11b · Baseline 0 : vue client (signature, demandes de changements), baseline.approve (tag baseline-0, phase iterations), baseline.requestChanges, notifications. Réf. §3, §5, §6. — dépend de 11a
```
