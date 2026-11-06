# Refonte UI · Lot 3 · Vue d'ensemble du projet : passation à l'agent dev

> Validé par Brice le 05/11/2026.
> Maquette de référence : canevas « Koklo — maquettes » (https://claude.ai/artifact/F6nuypdhrWp1Y7x8QwRiFm), planche **Lot 3 · Vue d'ensemble du projet** (le sélecteur en pointillés « Idée / Cadrage / Itérations » sert seulement à montrer les trois phases dans la maquette : il n'existe pas dans le produit).
> Plan d'ensemble : doc « Koklo — Refonte UI/UX et espace Idée : audit et plan » (https://claude.ai/artifact/3LVANUqXWDENdWVbhAiNRS).
> Prérequis : lots 0 et 1 livrés (`design/refonte/lots-0-1-passation.md`). Le lot 2 (`design/refonte/lot-2-idee-passation.md`) alimente la phase Idée ; la vue d'ensemble doit fonctionner sans lui (§9).

Nouvel écran **S-overview**, route `/projects/[projectId]` (remplace la redirection provisoire du lot 1). L'étape Design crée la fiche `design/screens/S-overview.md` à partir de ce document.

## 1. Objectif

C'est la page d'accueil d'un projet. Elle répond en un coup d'œil à trois questions :
1. **Où en est-on ?** — le fil de phase.
2. **Qu'est-ce qui bloque, et que faire maintenant ?** — la carte « Prochaine étape ».
3. **Qu'est-ce qui a bougé ?** — les indicateurs, la liste principale et l'activité.

Elle s'adapte à la phase du projet : Idée, Cadrage, Baseline 0, Itérations. Le contenu change, la structure reste la même.

Publics :
- **Équipe** (propriétaire, admin, développeur, designer) : tout.
- **Client et business** : même page, avec des libellés tournés vers eux (§6.3) et sans les actions réservées à l'équipe (Inviter, actions techniques). Pour le client, c'est la page d'arrivée après connexion.

## 2. Gabarit (≥ 1280 px)

`AppShell` étendu, entrée « Vue d'ensemble » active. `ProjectHeader` puis une colonne de contenu (marges 24/32/40 px, sections espacées de 24 px), dans cet ordre :

1. **En-tête** (`ProjectHeader`, §3).
2. **Fil de phase** (`PhaseRail` grand, §4).
3. **Prochaine étape** (§5).
4. **Indicateurs** : 4 cartes (§6).
5. **Deux colonnes** : à gauche (fluide, `flex: 999 1 460px`) le **bloc principal** de la phase (§7) ; à droite (320–420 px) **Activité** puis **Personnes** (§8).

## 3. En-tête

- Ligne 1 : « <projet> / Vue d'ensemble ».
- Ligne 2 : h1 « Vue d'ensemble » ; résumé 13 px « Client : <nom du contact client> · démarré le <date> » (si aucun client invité : « Aucun client invité » + lien « Inviter » pour l'équipe) ; à droite :
  - secondaire « Inviter » (`person_add`), équipe seulement ;
  - **action principale selon la phase** :

| Phase | Action principale | Destination |
|---|---|---|
| Idée | Ouvrir l'espace Idée | `/projects/[id]/idea` |
| Cadrage | Continuer le cadrage | Le livrable le plus en retard (§7.2), sinon l'Assistant de cadrage |
| Baseline 0 (en attente de validation) | Voir la validation | Écran de validation (lot 12) ; tant qu'il n'existe pas : Spec · Fonctionnel |
| Itérations | Ouvrir les tickets | `/projects/[id]/tickets` |

## 4. Fil de phase

`PhaseRail` grand du lot 0, dans une carte (bordure `--border`, rayon 12, padding 20/24).

| Étape | Sous-titre (exemples) |
|---|---|
| Idée | En cours : « Dossier en cours, 5 pages stables sur 10 » ; terminée : « Dossier stable » |
| Cadrage | À venir : « Après le dossier d'idée » ; en cours : « 2 livrables validés sur 6 » ; terminée : « 6 livrables validés » |
| Baseline 0 | À venir : « Posée à la validation du client » ; terminée : « Posée le <date> » |
| Itérations | À venir : « Sprints et demandes de changement » ; en cours : « Sprint <id> en cours » |

- Étape en cours : `aria-current="step"`.
- **Calcul de la phase** (serveur, champ `project.phase`) :
  - `idea` tant que le premier brief n'a pas été généré depuis le dossier (lot 2c) et qu'aucune fonctionnalité n'existe ;
  - `framing` ensuite, tant que le tag `baseline-0` n'existe pas ;
  - `baseline` : tous les livrables validés mais tag pas encore posé (état transitoire) ;
  - `iterations` dès que `baseline-0` existe.
- Projets existants sans dossier d'idée mais avec des fonctionnalités : `framing` directement, l'étape Idée s'affiche « passée » avec le sous-titre « Non utilisée ».

## 5. Carte « Prochaine étape »

Une seule action, **la plus prioritaire**, calculée côté serveur (`project.nextAction`). Carte pleine largeur : fond, bordure et texte « attention » du lot 0 ; tuile d'icône 40 px ; surtitre 12 px capitales « PROCHAINE ÉTAPE » ; titre 15/600 ; une phrase 13 px ; bouton contour 36 px à droite.

Règles, de la plus prioritaire à la moins prioritaire (la première qui s'applique gagne) :

| # | Condition | Titre | Action |
|---|---|---|---|
| 1 | Clé IA absente ou invalidée (équipe owner/admin) | « L'IA n'est pas configurée pour l'organisation » | Configurer l'IA |
| 2 | Spec en échec de préparation | « La préparation de la spec a échoué » | Voir le détail |
| 3 | Phase Idée, propositions de l'agent en attente | « <Nom> a répondu à l'agent : N propositions à relire » | Relire |
| 4 | Phase Idée, pages requises non stables | « Il reste N pages requises à stabiliser » | Ouvrir <première page> |
| 5 | Phase Cadrage, livrable client « À valider » depuis ≥ 48 h | « Le cahier fonctionnel attend la validation de <client> » | Relancer <prénom> |
| 6 | Phase Cadrage, livrable « À revoir » | « <client> demande des changements sur <livrable> » | Voir les remarques |
| 7 | Phase Cadrage, livrable équipe non validé le plus en retard | « Le <livrable> reste à valider par l'équipe » | Ouvrir |
| 8 | Itérations, PR en attente de revue | « N tickets attendent une revue de code » | Voir les PR |
| 9 | Itérations, demande de changement en attente du client | « CR-n attend la décision de <client> » | Ouvrir |
| — | Rien à faire | La carte devient neutre : « Rien n'attend d'action. » + rien d'autre | — |

- **Vue client** : seules les règles qui demandent une action du client s'appliquent, formulées pour lui (« Vous avez 2 fonctionnalités à valider », « 2 propositions de l'agent attendent votre avis »). Sinon : « Rien n'attend votre action. L'équipe travaille sur <livrable>. »
- « Relancer » ouvre un message prérempli (lot ultérieur) ; au lot 3, il copie un lien direct vers le livrable dans le presse-papiers avec la confirmation « Lien copié ». Pas d'envoi d'e-mail au lot 3.
- `role="note"` ; le bouton est un vrai lien ou bouton selon l'action.

## 6. Indicateurs

Grille `repeat(auto-fit, minmax(200px, 1fr))`, 4 cartes : icône 18 + libellé 13 px `--muted-foreground`, valeur 26/600, jauge optionnelle (crans de 6 px, `--primary` / `--border-strong`), sous-titre 13 px.

### 6.1 Par phase

| Phase | Carte 1 | Carte 2 | Carte 3 | Carte 4 |
|---|---|---|---|---|
| Idée | Maturité du dossier « 5 sur 10 » + jauge · « pages stables » | Propositions à relire « 2 » · « de l'agent, depuis hier » | Échanges avec le client « 14 » · « messages cette semaine » | Dernière version « hier » · « publiée dans le dépôt de spec » |
| Cadrage | Livrables validés « 2 sur 6 » + jauge · « données et architecture » | Validations client attendues « 2 » · « fonctionnel et design, obligatoires » | Suggestions du client « 1 » · « SG-3 · <titre> » | Version de la spec « <sha> » · « N versions depuis le début » |
| Itérations | Sprint <id> « 5 sur 8 » + jauge · « tickets terminés · J-3 » | Sessions d'agent « 2 » · « en cours · TK-104, TK-106 » | Demandes de changement « 1 » · « CR-2 en revue client » | Critères testés « 18 sur 21 » · « dernière CI de main » |

### 6.2 Données manquantes
Un indicateur dont la donnée n'existe pas encore (ex. sessions d'agent avant le lot Tickets) **n'est pas affiché** : la grille passe à 3 cartes. Jamais de « 0 » ni de « — » inventé.

### 6.3 Vue client
Le client voit les indicateurs de son point de vue : Cadrage → « Livrables validés », « À valider par vous », « Vos suggestions », « Dernière mise à jour ». Pas de SHA ni de vocabulaire git (rappel PRODUCT.md : vue client sans vocabulaire git).

## 7. Bloc principal

### 7.1 Phase Idée : « Dossier d'idée »
Carte liste (titre h2 16/600 + lien « Ouvrir le dossier → » en `--primary`) : 5 pages au plus, triées par priorité (propositions en attente, puis requises non stables, puis récemment modifiées). Ligne : numéro de position en `EntityChip` mono, titre 500 + ligne secondaire 12 px (« 1 proposition de l'agent », « Modifié par Marie il y a 5 min », « Aucun indicateur de succès »), statut de page à droite (Stable, À relire, Brouillon, À explorer).

### 7.2 Phase Cadrage : « Livrables du cadrage »
- h2 « Livrables du cadrage » + phrase 13 px `--muted-foreground` « La baseline 0 se pose quand les 6 sont validés. Le client valide obligatoirement le fonctionnel et le design. »
- Grille `repeat(auto-fit, minmax(260px, 1fr))`, gap 12, **6 cartes** dans l'ordre : Cahier fonctionnel, Design, Modèle de données, Architecture, Cahier technique, Qualité. Chaque carte est un lien vers le livrable (`/projects/[id]/spec/<livrable>`) :
  - ligne 1 : tuile icône 32 px (`--secondary`, icônes du lot 1 §1.0), nom 600, `DeliverableStatus` à droite ;
  - ligne 2 : contenu en 13 px `--muted-foreground` (« 7 fonctionnalités · 4 règles · 3 rôles · 2 parcours », « 6 tables · 7 relations · 3 jeux d'exemple », « 12 endpoints · 4 exigences non fonctionnelles »…) ;
  - jauge d'avancement (crans de 5 px, 12 au plus ; `--primary`, ou vert si validé) ;
  - ligne 4 : avancement en clair à gauche (« 4 fonctionnalités validées sur 7 », « Validé par Moussa le 4 nov. ») ; valideur à droite : **« Validation client · obligatoire »** (icône `person`, 600, `--foreground`) pour Fonctionnel et Design, « Validation de l'équipe · le client lit et commente » (icône `groups`, `--muted-foreground`) pour les autres.
- Livrable dont l'écran n'est pas encore livré (lots 6 à 11) : carte affichée avec statut « À faire » et ligne 2 « Bientôt disponible », non cliquable (pas de lien mort), sauf si des fichiers existent déjà dans le dépôt (comptés quand même).
- **Calcul des statuts** (serveur, `project.deliverables`) :
  - Fonctionnel et Design : `validated` si validés par le client sur la version courante ; `pending` (À valider) si soumis ; `in_progress` s'il existe du contenu ; `todo` sinon. « À revoir » prime sur « À valider ».
  - Autres livrables : `validated` si validés par un membre de l'équipe (propriétaire, admin ou développeur) sur la version courante ; mêmes autres états.
  - Toute modification d'un livrable validé le repasse en `in_progress` (la validation pointe un commit précis, conception §3 « Review »).

### 7.3 Phase Itérations : « Sprint <id> · <objectif> »
Carte liste + lien « Ouvrir le kanban → » : 5 tickets au plus, triés (en revue, en cours, puis récemment terminés). Ligne : `EntityChip` `TK-n`, titre + ligne secondaire (« PR #42 · agent · CI verte », « Session d'agent en cours »), statut (En revue, En cours, Terminé, À faire). Sans sprint actif : `EmptyState` « Aucun sprint en cours » + « Planifier un sprint » (équipe).

### 7.4 Phase Baseline 0 (transitoire)
Même grille que 7.2, les 6 cartes validées, et au-dessus une `InlineAlert` neutre « Tous les livrables sont validés. La baseline 0 peut être posée. » + action « Poser la baseline 0 » (propriétaire / admin).

## 8. Colonne de droite

### 8.1 Activité
Carte, h2 « Activité », 5 entrées au plus + lien « Tout voir » (journal complet, lot ultérieur). Une entrée : avatar 32 px rond + texte 13 px + date relative 12 px. Couleurs d'avatar (toujours avec initiales ou libellé, jamais la couleur seule) :
- **Client** : fond / texte « À valider » ambre (clair `#fef3c7` / `#92400e`, sombre `#78350f` / `#fde68a`) ;
- **Équipe** : `--secondary` / `--secondary-foreground` ;
- **Agent** : `--primary` / `--primary-foreground`, initiales « IA ».

Source : `JournalAudit` (conception §3), filtré sur les événements lisibles par un humain (validation, proposition de l'agent, publication, PR ouverte ou fusionnée, demande de changement, page stabilisée). Le client ne voit pas les événements techniques (commits bruts, CI) : seulement leurs effets formulés pour lui. Phrases complètes, jamais d'identifiant seul : « Marie a validé F-001 Réserver un créneau », « L'agent a ouvert la PR #42 pour TK-104 ».

### 8.2 Personnes
Carte, h2 « Personnes » : avatar, nom 13/500, rôle dans le projet en 12 px (« Client · valide le cadrage », « Propriétaire · freelance », « Développeur »). Le client en premier. Au plus 5 + « N autres ». Équipe : action « Inviter » en pied de carte si aucun client n'est invité.

## 9. Contrat oRPC

Une seule procédure agrégée, pour un seul aller-retour au chargement :

```
project.overview(projectId) → {
  project: { id, name, startedAt, clientContact? },
  phase: 'idea' | 'framing' | 'baseline' | 'iterations',
  phaseSteps: [{ key, state: 'done'|'current'|'todo', subtitle }],
  nextAction?: { rule, title, body, action: { label, href? , kind } , audience },
  stats: [{ key, label, value, gauge?: { done, total }, subtitle }],   // déjà filtrées par rôle et disponibilité
  main:
    | { kind: 'idea', pages: [...] }
    | { kind: 'deliverables', items: [{ key, status, content, done, total, progressLabel, validator: 'client'|'team', available }] }
    | { kind: 'sprint', sprint?, tickets: [...] },
  activity: [{ actor: { kind: 'client'|'team'|'agent', name, initials }, text, at }],
  people: [{ name, initials, role, kind }]
}
```

- Les textes (titres de la prochaine étape, sous-titres, libellés) sont **construits côté serveur en français** à partir de gabarits, pour rester identiques dans le web et le CLI (`koklo status`). L'écran n'assemble pas de phrases.
- Données d'un lot pas encore livré (dossier d'idée, statuts de livrables, sessions d'agent) : champs absents, et l'écran se replie (§6.2, §7.2). Au minimum au lot 3 : phase, prochaine étape (règles 1, 2, 5, 6), fonctionnalités et validations existantes, activité depuis le journal existant.
- Rafraîchissement : à l'ouverture et au retour sur l'onglet (`visibilitychange`) ; pas de sondage permanent.

## 10. États

- **Chargement** : squelettes du fil de phase, de la carte prochaine étape, des 4 indicateurs et des listes (`motion-safe:`), `aria-busy`.
- **Projet neuf** (rien) : phase Idée, prochaine étape « Commencez le dossier d'idée » + « Ouvrir l'espace Idée », indicateurs masqués, bloc principal = `EmptyState` du lot 2 §7.1, activité « Le projet vient d'être créé. ».
- **Erreur de chargement** : `InlineAlert` erreur sous l'en-tête « Impossible de charger la vue d'ensemble. » + « Réessayer » ; l'en-tête et la navigation restent utilisables.
- **Projet introuvable, 401, droits** : comme S-features.

## 11. Responsive

- **1024–1279 px** : colonne de droite passe sous le bloc principal (pleine largeur), Activité et Personnes côte à côte.
- **< 1024 px** : fil de phase en 2 × 2 (les traits de liaison disparaissent, chaque étape garde sa pastille et son état) ; indicateurs en 2 colonnes.
- **< 768 px** : fil de phase vertical (pastilles à gauche, trait vertical) ; carte prochaine étape avec le bouton pleine largeur sous le texte ; indicateurs en 1 colonne ; grille des livrables en 1 colonne ; boutons de 44 px.

## 12. Accessibilité

- h1 unique ; h2 par section (Livrables du cadrage, Activité, Personnes…) ; le fil de phase est une `ol` dans une `section` nommée « Phases du projet », étape en cours `aria-current="step"`.
- Cartes de livrables : un seul lien par carte (toute la carte), `aria-label` complet : « Cahier fonctionnel, à valider, validation client obligatoire, 4 fonctionnalités validées sur 7 ».
- Jauges décoratives (`aria-hidden`) : la valeur est toujours écrite en clair à côté.
- Avatars décoratifs : le nom ou le rôle est dans le texte.
- Contrastes AA clair et sombre ; axe sans violation sur chaque phase et chaque état.

## 13. Critères d'acceptation

- [ ] `/projects/[projectId]` affiche S-overview ; la redirection provisoire du lot 1 est retirée ; « Vue d'ensemble » active dans la barre.
- [ ] Phase calculée côté serveur selon §4 ; projets existants classés correctement (test par cas : sans fonctionnalité, avec fonctionnalités sans baseline, avec `baseline-0`).
- [ ] Prochaine étape : une seule, règles de §5 testées une par une, vue client distincte.
- [ ] Indicateurs par phase ; aucun indicateur sans donnée affiché.
- [ ] Grille des 6 livrables en phase Cadrage, valideur affiché, cartes non livrées non cliquables.
- [ ] Activité avec trois types d'acteurs, sans événement technique côté client.
- [ ] `project.overview` en un seul appel ; textes construits côté serveur.
- [ ] Captures : phases Idée, Cadrage, Itérations, projet neuf, erreur ; vue équipe et vue client ; clair, sombre, 375 px.

## 14. Ticket à ajouter au sprint (format du vault)

```
- [ ] **[TK-?]** Lot 3 · Vue d'ensemble du projet : route /projects/[projectId], procédure project.overview (phase, prochaine étape, indicateurs, bloc principal par phase dont la grille des 6 livrables du cadrage, activité, personnes), vues équipe et client. Réf. design/refonte/lot-3-vue-ensemble-passation.md. `pkg:api` `pkg:contract` `pkg:web` — dépend des lots 0 et 1
```

## 15. Questions ouvertes (non bloquantes)

- « Relancer » le client : simple lien copié au lot 3 ; envoi d'un e-mail ou d'une notification depuis Koklo à prévoir avec les notifications.
- Plusieurs actions dans « Prochaine étape » (liste de 2 ou 3) au lieu d'une seule : retenu une seule par défaut, à revoir à l'usage.
- Journal d'activité complet (« Tout voir ») : écran à concevoir plus tard.
