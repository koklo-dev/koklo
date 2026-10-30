---
id: S-kanban
titre: Kanban des tickets du sprint actif
version: 1
---
## 1. Utilisateurs et objectif
- **Vue équipe** (owner, admin, dev, designer) : voit où en est chaque ticket du sprint actif et le fait avancer d'un statut à l'autre. Arrive depuis la barre latérale (« Kanban »).
- **Vue client / business** : suit l'avancement en **lecture seule**, sans vocabulaire git (vision §1 principe 7). Elle comprend pourquoi elle ne peut pas déplacer.
- Tableau du **projet courant** (le plus ancien de l'organisation active, résolu par l'API), pour le **sprint actif**.

## 2. Tâches et parcours
- Principale : déplacer un ticket vers un autre statut (glisser-déposer ou bouton « Déplacer »).
- Secondaires : repérer les tickets bloqués ; lire clé, paquet, sensibilité, priorité ; réessayer après une erreur.
- Entrée : `/kanban` (barre latérale, `aria-current="page"`). Sorties : `UNAUTHORIZED` redirige vers `/login` ; organisation sans projet : lien vers `/projects`.
- Hors lot : détail de ticket, création, filtres, tri dans une colonne, choix du projet ou du sprint, temps réel.

## 3. Contenu
Sources : `sprint.list({status:"active"})` puis `ticket.list({sprintId})` (pagination suivie jusqu'à épuisement de `nextCursor`), `ticket.transition({key,to})`.
- Titre h1 « Kanban » (30 px/600). Sous-titre texte secondaire 13 px : « Sprint SP-n · <objectif> » ; compteur « N ticket(s) ».
- Mention lecture seule (client/business) sous le sous-titre : icône `lock` + « Lecture seule : votre rôle ne permet pas de déplacer les tickets. »
- **7 colonnes**, dans l'ordre du cycle de vie. Libellé en français, icône en `Icon`, jamais de teinte propre (H6 : `--primary` ne sert pas de statut) :

| Statut | Libellé | Icône | État bibliothèque |
|---|---|---|---|
| backlog | Backlog | `inbox` | **à ajouter au générateur** |
| todo | À faire | `radio_button_unchecked` | **à ajouter** |
| in_progress | En cours | `play_circle` | **à ajouter** |
| in_review | En revue | `fact_check` | existe |
| blocked | Bloqué | `block` | **à ajouter** |
| done | Terminé | `check_circle` (pleine) | existe |
| cancelled | Annulé | `cancel` | **à ajouter** |

  Les cinq icônes à ajouter vont dans `ICON_NAMES` de `packages/ui/scripts/generate-icons.ts` puis `pnpm icons:generate` (comme `logout` en TK-85) ; jamais de SVG inline. DESIGN §4 liste `inbox` etc. comme absentes : à consigner dans DESIGN §4 par le développeur (sous « Interface »).
- **En-tête de colonne** : `Icon` 18 + libellé (14 px/600) + compteur dans un `Badge variant="outline"` (nombre, `aria-label` « N ticket(s) »). Le titre est un `h2`.
- **Carte** (`Card`, rayon 8 px, bordure `--border`, pas d'ombre au repos), de haut en bas :
  1. Ligne 1 : clé `TK-35` (JetBrains Mono 12 px, `--muted-foreground`) ; à droite le bouton « Déplacer » (équipe seulement).
  2. Titre (14 px/500, 3 lignes max, `title` complet en infobulle native).
  3. Ligne de méta (12 px, retour à la ligne autorisé) : `Badge outline` du paquet (`pkg`, JetBrains Mono) ; `Badge outline` sensibilité : « Sensible » avec `lock` 16, ou « Sûr » sans icône ; priorité en **texte** « Priorité haute » / « Priorité critique » / « Priorité moyenne » / « Priorité basse ». La priorité critique et haute utilisent `font-weight 600` et `text-foreground`, les autres `text-muted-foreground` : le sens est dans les mots, la graisse n'est qu'un renfort. Aucune couleur de statut.
  4. Type et assigné : non affichés en v1 (densité, pas de besoin client).
- Tri dans la colonne : priorité décroissante puis clé (déterministe, sans ordre manuel).

## 4. États
- **Chargement** : zone `role="status"` `aria-busy="true"`, libellé visible « Chargement du kanban… », 7 colonnes squelette (en-tête `Skeleton` + 2 ou 3 cartes `Skeleton` de 88 px). Squelette immobile en mouvement réduit.
- **Aucun sprint actif** : `Card` centrée (icône `checklist` 28, titre « Aucun sprint actif », texte « Le kanban affiche les tickets du sprint en cours. Il apparaîtra dès qu'un sprint sera démarré. »). Pas de colonnes, pas de repli sur le backlog.
- **Aucun projet** (`NOT_FOUND`) : `Card` centrée, icône `account_tree`, « Aucun projet pour le moment », lien « Voir les projets » (`a`) vers `/projects`.
- **Sprint sans ticket** : les 7 colonnes sont affichées (compteur 0) et un bandeau de texte secondaire sous le sous-titre dit « Ce sprint ne contient encore aucun ticket. ». Chaque colonne vide montre dans un cadre en pointillés (`border-dashed`, `--border`) « Aucun ticket ».
- **Colonne vide** (autres colonnes remplies) : même cadre « Aucun ticket ». Pour l'équipe, il sert aussi de cible de dépôt (hauteur minimale 96 px) : une colonne vide reste déposable.
- **Données** : 7 colonnes de cartes.
- **Déplacement en cours** : la carte garde sa place, `aria-busy="true"`, opacité réduite (`opacity-60`, jamais seule : le bouton devient `disabled` et affiche « Déplacement… »), non glissable. Mise à jour **non optimiste** : la carte change de colonne à la réponse.
- **Succès** : région `role="status"` (visible discrètement sous le sous-titre, 13 px) « TK-35 déplacé vers En revue. » ; disparaît au déplacement suivant, sans minuterie. La carte reçoit le focus à sa nouvelle place (ou son bouton « Déplacer » si l'action venait du menu).
- **Refus `INVALID_TRANSITION`** : `Alert` destructive fermable (bouton `close`, `aria-label` « Fermer le message ») en haut du tableau, icône `warning`, titre « Déplacement impossible », description « Transition interdite : TK-35 ne peut pas passer de « À faire » à « Terminé ». » (`data.from` et `data.to` traduits). La carte reste dans sa colonne d'origine. Focus : retour au bouton « Déplacer » (clavier) ou à la carte (glisser).
- **`FORBIDDEN`** : `Alert` destructive, icône `lock`, « Vous n'avez pas le droit de déplacer les tickets. Demandez à un propriétaire, un administrateur, un développeur ou un designer. »
- **`CONFLICT`** : `Alert` destructive, icône `warning`, « Ce ticket a changé entre-temps » + description « Rechargez le kanban puis réessayez. » ; si `reason = ticket_has_active_lease` : « Ce ticket est en cours de traitement par un agent. Réessayez quand il aura terminé. » Bouton « Recharger ».
- **`NOT_FOUND` (ticket)** : « Ce ticket n'existe plus. », rechargement automatique du tableau.
- **`INTERNAL` / réseau** (déplacement) : `Alert` destructive « Le déplacement a échoué », « Une erreur est survenue. Réessayez dans un instant. », bouton « Réessayer » (relance le même `transition`).
- **Erreur de chargement** : `Alert` destructive, icône `warning`, « Impossible de charger le kanban », « Une erreur est survenue. Vérifiez votre connexion puis réessayez. », `Button variant="outline"` « Réessayer ».
- **Lecture seule** (client, business, rôle encore inconnu) : ni poignée, ni bouton « Déplacer », cartes non `draggable`, mention du §3. Pas de flash : tant que le rôle est inconnu, rendu lecture seule.
- **Non connecté** : redirection `/login`, sans message.
Un seul message d'erreur de déplacement à la fois (le dernier remplace le précédent).

## 5. Interactions et retours
**Glisser-déposer natif HTML5 (souris, stylet)** :
- Carte `draggable="true"` (équipe seulement, hors déplacement en cours). Curseur `grab` au survol, `grabbing` pendant le glissé. Pas de poignée séparée : toute la carte glisse ; le bouton « Déplacer » reste cliquable.
- Carte source pendant le glissé : `opacity-50` + bordure `--ring` en pointillés. L'image fantôme native du navigateur est conservée.
- Colonne survolée (`dragover`, `preventDefault` pour autoriser le dépôt) : fond `--accent`, bordure `--ring` 2 px, libellé texte « Déposer ici pour passer en <Libellé> » en haut de la liste (le retour n'est jamais la teinte seule). La colonne d'origine n'affiche pas ce retour (déposer dessus ne fait rien).
- Dépôt (`drop`) sur une autre colonne : appelle `ticket.transition({key,to})`. Dépôt hors colonne ou sur la colonne d'origine : annulé, aucun appel.
- Toute colonne est une cible : le client ne connaît pas la table de transitions, le serveur tranche (pas de grisage préventif).

**Alternative clavier et tactile (WCAG 2.5.7, obligatoire et équivalente)** :
- Chaque carte (équipe) contient un vrai `button` « Déplacer » (`Button variant="ghost" size="sm"`, icône `drag_indicator` 16 + texte « Déplacer » visible ; sous 768 px la cible fait 44 px). `aria-label` « Déplacer TK-35 », `aria-haspopup="menu"`, `aria-expanded`.
- Il ouvre un `DropdownMenu` titré « Déplacer TK-35 vers » avec les **6 statuts hors statut courant**, dans l'ordre des colonnes, chacun avec son icône et son libellé. Entrée/Espace/flèche bas ouvrent ; flèches haut/bas naviguent ; Entrée/Espace choisit ; Échap ferme et restitue le focus au bouton.
- Choisir un statut appelle la même mutation que le dépôt, avec les mêmes états et annonces.
- Même chemin au toucher : le glisser HTML5 n'existe pas sur la plupart des navigateurs tactiles, le bouton le remplace.

**Annonces (`aria-live`)** : une région `role="status"` (`aria-live="polite"`) annonce « Déplacement de TK-35 vers En revue… » au début, puis « TK-35 déplacé vers En revue. » ; les refus passent par `Alert` (`role="alert"`, assertive). Au début d'un glissé, la région annonce « TK-35 saisi. Déposez-le sur une colonne. » (info pour lecteur d'écran uniquement, le glisser reste une aide souris).

## 6. Responsive
- **≥ 768 px** : la zone de contenu (marge 32 px) contient un conteneur `overflow-x-auto` ; les 7 colonnes sont en `flex` horizontal, **largeur fixe 280 px** (`min-w-[17.5rem]`), espacement 16 px, hauteur libre (la page défile verticalement). À 1440 px avec barre latérale, 4 colonnes sont visibles, le reste se révèle par défilement horizontal (pas de réduction qui tronquerait les titres). Pas de défilement vertical interne aux colonnes.
- **Sous 768 px** : marge 16 px ; le conteneur défile horizontalement avec `scroll-snap-type: x proximity` et colonnes de **85 % de la largeur** (≈ 300 px) pour montrer qu'il y a une suite à droite. Cibles « Déplacer » et éléments de menu à 44 px. `Alert` pleine largeur. Aucun défilement horizontal de la **page** : seul le conteneur du tableau défile, et il reçoit `tabindex="0"`, `role="region"` et un nom pour être atteignable au clavier.
- Un en-tête de colonne collant n'est pas nécessaire (l'en-tête de page reste visible, hauteur des colonnes courte).
- Le glisser entre colonnes hors écran n'est pas géré (pas de défilement automatique natif fiable) : sous 768 px et pour les colonnes éloignées, c'est le bouton « Déplacer » qui sert.

## 7. Accessibilité
- Repères : `main` du gabarit, `h1` unique « Kanban », chaque colonne un `section` nommé par son `h2` (`aria-labelledby`), liste de cartes en `ul`/`li` (`role="list"`), conteneur de défilement `role="region"` `aria-label` « Colonnes du kanban » et `tabindex="0"`.
- Ordre de focus : trigger de la barre, entrée « Kanban », contenu : région du tableau, puis par colonne de gauche à droite : cartes de haut en bas, chacune avec son bouton « Déplacer » (la carte elle-même n'est pas un contrôle focalisable).
- Rôles et libellés : `button` « Déplacer TK-35 » ; menu `role="menu"` avec éléments `menuitem` « En revue » etc. ; compteur `aria-label` ; carte `aria-busy` pendant l'appel ; mention lecture seule dans le texte (pas dans `title`).
- Statut jamais par la couleur seule : icône + libellé dans chaque en-tête ; priorité et sensibilité en mots ; retour de survol de dépôt doublé d'un texte.
- Contraste AA en clair et en sombre (tokens uniquement ; `--muted-foreground` sur `--card` et `--background` vérifié par axe).
- **Mouvement réduit** : toute transition (couleur de colonne au survol, opacité de la carte, squelette) sous `motion-safe:` ; sous `prefers-reduced-motion: reduce`, les états s'appliquent instantanément, aucun défilement animé (`scroll-behavior: auto`).
- Focus visible (`--ring`), jamais supprimé. Focus restitué après menu, après succès et après refus (voir §4).
- Cibles ≥ 24 px en desktop (WCAG 2.5.8), 44 px sous 768 px.
- Aucune couleur ni icône en dur : composants et tokens de `@koklo/ui` seulement.

## 8. Alternatives écartées
1. **HTML5 natif + bouton « Déplacer » (retenu)** contre `@dnd-kit/react` (0.5.x, pré-1.0, très mobile) et `@dnd-kit/core` (stable mais en fin de vie) : l'alternative clavier/tactile est à livrer de toute façon et vaut mieux que le glisser clavier (annonces génériques en anglais) ; zéro dépendance.
2. **Menu des statuts** contre glisser au clavier (espace puis flèches entre colonnes) : le menu nomme la destination, marche au toucher et au clavier avec un seul geste, et se teste de bout en bout.
3. **Mise à jour non optimiste** contre optimiste avec retour arrière : la table de transitions est stricte, des refus sont fréquents ; la carte qui saute puis revient serait trompeuse et plus complexe à tester.
4. **Tableau défilant horizontalement, colonnes 280 px** contre colonnes qui rétrécissent ou pile verticale en mobile : 7 colonnes rétrécies tronquent clé et titre ; une pile verticale cache le sens « flux » et rend le glisser impossible.
5. **Onglets par statut en mobile (`Tabs`)** : lisibles, mais perdent la vue d'ensemble de l'avancement qui est la raison d'être d'un kanban.
6. **Colonnes teintées par statut** contre en-têtes neutres : DESIGN §2.2 ne définit que trois couleurs de statut (validée, à valider, à revoir) et interdit de détourner le violet ; sept teintes ajouteraient du bruit et un risque de contraste.
7. **Griser les cibles invalides côté client** contre tout proposer : demanderait de dupliquer la table du domaine (web ne dépend pas de `domain`, le serveur fait foi) ; le refus nomme départ et arrivée.
8. **Bouton « Déplacer » absent en lecture seule** contre bouton désactivé : un bouton désactivé n'explique rien ; la mention donne la raison (cohérent avec S-projects).
9. **Panneau de détail au clic sur une carte** : hors lot, aucun contrat de détail.

## 9. Questions ouvertes
- Q1 Nom du projet courant non affiché (non exposé sans ambiguïté) ; dépend d'un futur sélecteur de projet.
- Q2 Sans sprint actif : état vide explicite plutôt que le backlog complet ; à rouvrir si le client veut voir le backlog.
- Q3 Mise à jour optimiste à reconsidérer selon la latence réelle.
- Q4 Cinq icônes à ajouter à la bibliothèque (`inbox`, `radio_button_unchecked`, `play_circle`, `block`, `cancel`) et à DESIGN §4.
- Q5 Glisser tactile non géré (le bouton « Déplacer » le remplace) ; si l'usage tablette devient central, `@dnd-kit/react` avec ADR.
- Q6 Priorité par mot seul en v1 ; une icône de priorité ne semble pas nécessaire.

## 10. Historique
| Version | Date | Ticket | Changement et raison |
|---|---|---|---|
| 1 | 2026-10-30 | TK-35 | Création : 7 colonnes, cartes, glisser-déposer natif et alternative « Déplacer », états et refus serveur, lecture seule client/business, entrée « Kanban » (icône `checklist`) dans la barre latérale. Détail : `.workflow/TK-35/02-design.md` |
