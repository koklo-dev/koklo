---
id: S-features
titre: Fonctionnalités d'un projet (lecture seule)
version: 1.1
---
## 1. Utilisateurs et objectif
- **Vue équipe** (propriétaire, administrateur, développeur, designer) : relit les fonctionnalités de la spec d'un projet, leurs critères d'acceptation et leurs liens (tables, endpoints, écrans). Voit la version de la spec lue (court identifiant de commit) et le chemin du fichier.
- **Vue client / business** : lit les fonctionnalités en langage courant, sans jamais croiser de vocabulaire git (vision §1 principe 7, AC-48-28) : ni « commit », ni « branche », ni SHA, ni chemin de fichier, ni code d'erreur technique.
- Écran **par projet**, en **lecture seule** (TK-48 / 48d). L'écriture (créer, modifier, supprimer) arrive en 48e sur ce même écran : aucun bouton d'écriture ici, aucun emplacement vide laissé à l'écran. Arrive depuis la liste des projets ou la barre latérale.

## 2. Tâches et parcours
- Principale : parcourir la liste des fonctionnalités et ouvrir la fiche de l'une d'elles.
- Secondaires : filtrer par statut et par priorité ; afficher la suite de la liste ; actualiser quand la spec est en préparation ; (propriétaire/administrateur) créer le dépôt de spec d'un projet qui n'en a pas.
- Entrée : `/projects/[projectId]/features`.
  - **Liste des projets** : le nom de chaque projet devient un lien vers cette page (l'état « détail de projet hors lot » de S-projects est levé, voir S-projects v6).
  - **Barre latérale** : les projets du groupe « Projets » deviennent des liens vers cette page ; l'entrée du projet courant porte `aria-current="page"` et l'icône pleine.
  - **Fiche** : `?feature=F-001` ouvre la fiche au chargement (lien partageable). Les filtres vivent aussi dans l'adresse (`?status=…&priority=…`). Un identifiant `feature` qui ne respecte pas `F-nnn` est ignoré.
- Sorties : `UNAUTHORIZED` sans session vers `/login` ; session sans organisation active vers `/organizations` (garde G1, jamais vers `/login` quand une session existe) ; fil d'Ariane vers « Projets ».
- Pas de nouvelle entrée de premier niveau dans la navigation : l'écran est une dépendance d'un projet, pas une section de l'organisation (voir §8, alternative 1).
- Hors lot (48e et suivants) : création, modification, suppression, attente de lot, tables/endpoints/écrans en lecture dédiée, recherche texte, tri, choix de la révision.

## 3. Contenu
Sources du contrat `@koklo/contract` 0.7.0 (aucun changement de contrat) :
`spec.head` (indexation), `spec.listFeatures` (liste), `spec.getFeature` (fiche), `repo.list` (équipe seulement, pour qualifier l'absence de spec), `project.list` (nom du projet pour le titre et le fil d'Ariane), `installation.list` (seulement dans le panneau de création réutilisé).

### 3.1 En-tête
- Fil d'Ariane « Koklo > Projets > `<nom>` > Fonctionnalités » (« Projets » est un lien ; le dernier maillon porte `aria-current="page"`).
- h1 « Fonctionnalités » (30 px/600, −0,025 em) ; sous-titre en texte secondaire 13 px : le nom du projet (`project.list`) ; pendant le chargement du nom : « Projet ».
- Compteur sous le titre, texte secondaire 13 px, dans la région d'état : sans filtre, « N fonctionnalité(s) » (`spec.head.counts.features`) ; avec filtre, « N fonctionnalité(s) affichée(s) » (éléments chargés), avec « sur plus de N » seulement quand une suite existe (`nextCursor`). Jamais un total inventé.
- Ligne de version (texte secondaire 12 px, une seule ligne, absente tant que `spec.head` n'a pas répondu ou s'il vaut `null`) :
  - équipe : icône `commit` 16 + « Version de la spec » + identifiant court (7 premiers caractères de `commitSha`, JetBrains Mono 12 px) + « · indexée le `<date>` » (`indexedAt`, format long français, fuseau local) ;
  - client / business : « Mise à jour le `<date>` » (`indexedAt`). Aucun identifiant technique.

### 3.2 Filtres
Deux `Select` à libellé visible (au-dessus ou à gauche selon la largeur), sans bouton « Appliquer » : le changement relance la requête (retour au début de la liste, curseur oublié).
- « Statut » : Tous / Brouillon / Spécifiée / Implémentée / Adoptée (`featureStatusSchema`).
- « Priorité » : Toutes / Indispensable / Importante / Souhaitable / Reportée (`featurePrioritySchema`).
- Bouton `Button variant="ghost"` « Effacer les filtres », rendu seulement si un filtre est actif.
- Les filtres sont inertes tant que le projet n'a aucune fonctionnalité indexée (états §4.2 à §4.8 sans liste) : ils ne sont pas rendus dans ces états.

### 3.3 Liste (`Table`)
`TableCaption` masquée visuellement : « Fonctionnalités du projet `<nom>` ». Trois colonnes de contenu plus la méta :

| Colonne | Contenu | Source |
|---|---|---|
| Identifiant | `F-001` en JetBrains Mono 12 px, `--muted-foreground` | `specId` |
| Titre | lien (vrai `a`) vers `?feature=<specId>`, 14 px/500, 2 lignes max, `title` complet en infobulle native | `title` |
| Statut | `Badge variant="outline"` : icône + libellé (tableau ci-dessous) | `status` |
| Priorité | texte du libellé de priorité, 13 px (tableau ci-dessous) | `priority` |
| Critères | nombre et libellé « N critère(s) », aligné à droite, 13 px | `criteriaCount` |

Libellés de statut, **icône + texte, jamais une teinte** (les couleurs `status-*` de DESIGN §2.2 sont réservées à la validation client Validée / À valider / À revoir et ne sont pas réutilisées ici : un statut de spec n'est pas un statut de validation) :

| Valeur | Libellé | Icône (existe dans la bibliothèque) |
|---|---|---|
| `brouillon` | Brouillon | `edit_note` |
| `specifiee` | Spécifiée | `fact_check` |
| `implementee` | Implémentée | `task_alt` |
| `adoptee` | Adoptée | `check_circle` (pleine) |

Libellés de priorité (méthode MoSCoW traduite, sans jargon) : `must` Indispensable, `should` Importante, `could` Souhaitable, `wont` Reportée. Le sens est dans les mots ; « Indispensable » est en `font-weight 600` et `text-foreground`, les autres en `text-muted-foreground`. Aucune couleur de statut ni d'alerte.

Tri : celui de l'API (numérique sur `F-nnn`). Aucun tri côté web.

Pagination : page de 50 (`limit` 50). Sous la table, `Button variant="outline"` « Afficher plus de fonctionnalités » tant que `nextCursor` n'est pas `null` ; les éléments s'ajoutent à la suite (pas de remplacement), le focus reste sur le bouton, qui est retiré à la dernière page. Pendant l'appel : `disabled`, `aria-busy`, texte « Chargement… ». La région d'état annonce « 50 fonctionnalités de plus affichées. » (nombre réel).

### 3.4 Fiche d'une fonctionnalité (`Sheet`, 440 px)
Ouverte par le lien du titre ou par `?feature=`. Sources : ligne de la liste (en-tête immédiat) puis `spec.getFeature` (détail).
- En-tête : `F-001` mono + titre en h2 (nom accessible du dialogue) ; sous le titre, badge de statut et priorité (mêmes libellés que la liste).
- « Description » : `description` rendue en **texte brut** avec retours à la ligne conservés (`white-space: pre-wrap`). Aucun rendu Markdown ni HTML (pas de dépendance nouvelle, pas de contenu actif). Description vide : « Aucune description. » en texte secondaire.
- « Critères d'acceptation » : `ol` ; chaque critère : identifiant `AC-1` (mono 12 px) + titre (14 px/500) ; ses étapes en `ul` sans puce, le mot d'ouverture en gras suivi du texte : « Étant donné », « Quand », « Alors », « Et » (`stepType`). Aucun critère : « Aucun critère d'acceptation pour le moment. »
- « Éléments liés » (chaque groupe n'apparaît que s'il n'est pas vide, valeurs en `Badge variant="outline"` JetBrains Mono, non cliquables en 48d car aucune cible n'existe) :
  - équipe : Écrans (`screens`), Rôles (`roles`), Règles (`rules`), Tables (`tables`), Endpoints (`endpoints`), Exigences non fonctionnelles (`nfr`) ;
  - client / business : Écrans, Rôles, Règles seulement (les tables, endpoints et exigences non fonctionnelles sont techniques).
- Pied (équipe seulement) : icône `commit` 16 + « Version de la spec » + identifiant court mono (`commitSha` de la fiche, qui est celui de l'index lu) ; ligne « Fichier » avec `filePath` en mono. Client / business : rien.
- Bouton « Fermer » (`Button variant="outline"`) et croix du `Sheet` (`aria-label` « Fermer la fiche »).

## 4. États
Un seul état principal à la fois. Priorité d'évaluation : session / organisation, `NOT_FOUND`, indexation (`failed`, absence, `building`), erreur de liste, vide, vide filtré, liste.

### 4.1 Chargement
Zone `role="status"` `aria-busy="true"`, libellé visible « Chargement des fonctionnalités… », 5 lignes squelette (tokens `muted`). Aucun contenu périmé. Squelette immobile en mouvement réduit. Les filtres ne sont pas rendus.

### 4.2 Liste (données)
Compteur, ligne de version, filtres, table, éventuel « Afficher plus » (§3).

### 4.3 Vide (spec lue, aucune fonctionnalité, aucun filtre)
`Card` centrée : icône `checklist` (28), titre « Aucune fonctionnalité pour le moment », texte « La spec de ce projet ne décrit encore aucune fonctionnalité. » Aucun bouton en 48d (l'écriture arrive en 48e : le bouton « Nouvelle fonctionnalité » viendra y prendre place pour l'équipe).

### 4.4 Vide filtré
Filtres conservés et rendus. À la place de la table : texte `role="status"` « Aucune fonctionnalité ne correspond à ces filtres. » et `Button variant="outline"` « Effacer les filtres » (le focus reste sur les `Select` au changement ; sur « Effacer » le focus passe au premier `Select`).

### 4.5 Spec en préparation (`building`, ou projet avec dépôt de spec mais rien d'indexé)
Cas : `spec.head` vaut `building`, ou vaut `null` alors que `repo.list` montre un dépôt de spec (équipe), ou vaut `null` pour un rôle qui ne peut pas lire `repo.list` (voir 4.6 pour ce dernier).
`Card` centrée, icône `schedule` (28, statut doublé du texte), titre « La spec est en cours de préparation », texte « Koklo lit le dépôt de spec de ce projet. Les fonctionnalités s'afficheront dès que la lecture sera terminée. » Bouton `Button variant="outline"` « Actualiser ». Région `role="status"` (polie) : « Préparation de la spec en cours. »
- Actualisation automatique **bornée** : une relecture de `spec.head` toutes les 5 s pendant 2 minutes au plus (pas de compte à rebours visible, aucune animation). Au-delà, arrêt silencieux et le texte devient « La préparation prend plus de temps que prévu. Actualisez dans un moment. » (sans erreur factice). L'onglet masqué suspend l'actualisation.
- Quand l'indexation aboutit : la liste remplace la carte, annonce « La spec est prête. » dans la région d'état. Si `building` renvoie déjà des éléments, la liste s'affiche avec, au-dessus, une `Alert` neutre (icône `schedule`) « La spec est en cours de mise à jour : la liste peut être incomplète. »

### 4.6 Projet sans dépôt de spec (reprise au rechargement)
Cas : `spec.head` vaut `null` et `repo.list` ne contient aucun dépôt de rôle `spec` ni `specPath` (lecture réservée à owner, admin, dev, designer). Décision de 48c respectée : **aucun changement de contrat** ; l'information se déduit ici, par projet, sans `hasSpecRepo`. Ce chemin remplace la reprise perdue au rechargement quand le marqueur d'onglet n'existe plus (S-projects §5.2) : tout projet sans dépôt est repris depuis sa page, qu'il figure ou non dans un marqueur.
- Titre « Ce projet n'a pas de dépôt de spec », icône `link` (28).
- **Propriétaire / administrateur** : texte « Sans dépôt de spec, Koklo ne peut pas afficher ni enregistrer les fonctionnalités. Créez-le maintenant : il sera privé et lié à ce projet. » Bouton `Button` principal « Créer le dépôt de spec » (icône `add`) qui ouvre **en place** le panneau de S-projects §3.1 en mode reprise : étape 1 « Terminé » (projet en lecture seule, aucun champ de nom), étape 2 active (compte GitHub, nom du dépôt facultatif, « Créer le dépôt »). Aucun appel à `project.create`. Mêmes erreurs et mêmes actions que S-projects §4.1 (« Autoriser Koklo », « Réessayer », « Relier un dépôt existant », lien `/github` quand aucun compte n'est relié). Succès : le panneau se ferme, le focus revient sur le bouton déclencheur (retiré à ce moment : il passe au titre de la carte suivante, `tabindex="-1"`), `spec.head` et `repo.list` sont invalidés, l'écran passe à 4.5 (« en préparation ») et annonce « Dépôt de spec créé. »
- **Développeur / designer** : texte « Ce projet n'a pas encore de dépôt de spec. Un propriétaire ou un administrateur peut le créer. » Aucun bouton.
- **Client / business** : `repo.list` leur est interdit ; l'écran n'affirme rien sur le dépôt et affiche l'état neutre 4.7.
- `repo.list` en erreur (réseau, `INTERNAL`) : on retombe sur 4.7 avec « Réessayer » (jamais une affirmation fausse sur l'absence de dépôt).

### 4.7 Spec indisponible, rôle sans détail (client, business ; ou information non lisible)
`Card` centrée, icône `schedule`, titre « Aucune fonctionnalité à afficher pour le moment », texte « La spec de ce projet n'est pas encore disponible. Revenez plus tard ou demandez à l'équipe où en est la préparation. » Bouton « Actualiser ». Même actualisation bornée qu'en 4.5. Aucun terme git.

### 4.8 Index en échec (`SPEC_INDEX_FAILED`, 409, ou `spec.head.status = failed`)
`Alert` destructive, icône `warning`, titre « La spec n'a pas pu être lue ». Le web n'appelle pas `listFeatures` quand `spec.head` annonce déjà `failed` ; si `listFeatures`/`getFeature` répondent 409, même rendu.
- Description (par `errorCode`, table fermée, valeur inconnue → texte générique, jamais la valeur brute dans la phrase) :
  - `spec_too_large` : « La spec de ce projet est trop volumineuse pour être lue par Koklo. »
  - autre ou absent : « La spec de ce projet contient un problème qui empêche sa lecture. »
- Équipe : phrase en plus « Corrigez la spec puis poussez la correction : la lecture reprendra seule. » et ligne technique en mono `Code : spec_too_large · version a1b2c3d`. Client / business : « Prévenez l'équipe : la spec doit être corrigée. » (Koklo n'envoie aucune notification ici, le texte ne le suggère pas).
- Bouton `Button variant="outline"` « Actualiser » (relit `spec.head`). Pas de repli sur une autre révision.

### 4.9 Erreur de chargement de la liste
`INTERNAL` ou réseau : `Alert` destructive, icône `warning`, « Impossible de charger les fonctionnalités », « Une erreur est survenue. Vérifiez votre connexion puis réessayez. », `Button variant="outline"` « Réessayer ».
- `VALIDATION` sur la suite de la liste (curseur périmé ou malformé, dette reportée R8) : `Alert` destructive « La liste n'a pas pu être poursuivie », « Revenez au début de la liste puis réessayez. », bouton « Revenir au début » (oublie le curseur, conserve les filtres). Les éléments déjà chargés restent affichés au-dessus.
- Échec de « Afficher plus » : l'alerte s'insère sous la table, les éléments déjà chargés restent ; « Réessayer » relance la même page.

### 4.10 Projet introuvable ou inaccessible (`NOT_FOUND`)
Le contrat ne répond jamais `FORBIDDEN` en lecture : un projet d'une autre organisation et un projet inexistant donnent la **même** réponse `NOT_FOUND`. Pas d'état « accès refusé » distinct (il révélerait l'existence du projet). `Card` centrée, icône `lock`, titre « Projet introuvable », texte « Ce projet n'existe pas ou vous n'y avez pas accès. » Lien `a` « Voir les projets » vers `/projects`. Aucune alerte rouge, aucun appel supplémentaire.

### 4.11 États de la fiche
- **Chargement** : en-tête déjà rempli depuis la ligne ; sous l'en-tête, `role="status"` `aria-busy="true"` « Chargement de la fiche… » et 3 blocs squelette.
- **Données** : §3.4.
- `NOT_FOUND` (la fonctionnalité a disparu de la spec, ou fichier manquant à la version indexée) : `Alert` destructive « Cette fonctionnalité n'existe plus dans la spec. », bouton « Fermer » ; la liste est relue en arrière-plan.
- `PROVIDER_UNAVAILABLE` (503, App GitHub non configurée, installation suspendue ou désinstallée) : `Alert` destructive, icône `warning`, « Le détail est momentanément indisponible », « La liste reste consultable. Réessayez dans un instant. » (équipe : + « Vérifiez l'état de l'application GitHub » avec lien `/github` pour owner/admin seulement) ; bouton « Réessayer ». L'en-tête (titre, statut, priorité, nombre de critères) reste visible.
- `PROVIDER_RATE_LIMITED` (429) : « Trop de demandes pour le moment. Réessayez dans un instant. » + « Réessayer ». Aucun compte à rebours.
- `PROVIDER_AUTH_EXPIRED` (403) : c'est l'« accès refusé » rencontré en pratique, côté fournisseur. Titre « Koklo n'a plus accès au dépôt de spec ». Owner/admin : « Autorisez de nouveau Koklo sur GitHub, puis revenez à cette fiche. » + lien `a` « Ouvrir la page GitHub » (`/github`). Autres rôles : « Demandez à un propriétaire ou à un administrateur d'autoriser de nouveau Koklo. » La liste reste consultable.
- `SPEC_INDEX_FAILED` : rendu de 4.8 dans la fiche (la fiche ne peut pas se lire).
- Autre erreur : « Impossible de charger la fiche » + « Réessayer ».

### 4.12 Session
`UNAUTHORIZED` sans session : redirection `/login`, sans message ; avec session mais sans organisation active : `/organizations`.

## 5. Interactions et retours
- Aucune action d'écriture. Les seules actions : ouvrir/fermer la fiche, filtrer, effacer les filtres, afficher plus, actualiser, réessayer, créer le dépôt de spec (owner/admin, 4.6).
- Ouvrir la fiche : clic ou Entrée sur le lien du titre ; la ligne entière réagit au clic souris (confort), pas au clavier (le lien suffit). L'adresse reçoit `?feature=F-001` (`history.pushState` : Retour du navigateur ferme la fiche). Fermer retire le paramètre et rend le focus au lien de la ligne d'origine (ou, si la ligne n'est plus à l'écran, au titre de la page).
- Filtrer : mise à jour de l'adresse (`replaceState`), requête relancée, région d'état annonce « N fonctionnalité(s) affichée(s). » ou « Aucune fonctionnalité ne correspond à ces filtres. ». Les éléments précédents ne restent pas affichés pendant le rechargement (état chargement du corps seulement, filtres gardés).
- Réessayer / Actualiser : relance uniquement la requête en échec ; la région d'état annonce le résultat. Aucune alerte persistante après succès.
- Création du dépôt de spec : détail de S-projects §4.1 et §5 (aucune règle nouvelle).
- Pas de toast. Confirmations par région `role="status"`.
- Vocabulaire des textes : « fonctionnalité » (pas « feature »), « spec » (terme du produit), « dépôt de spec », « version de la spec ». Jamais « commit », « branche », « SHA », « repository », « index », « indexation » côté client ; côté équipe, « commit » n'apparaît que dans les libellés `aria-label` de l'identifiant de version (« Version de la spec abc1234 ») et jamais dans les phrases des états.

## 6. Responsive
Gabarit de S-projects §6 (barre latérale 248 px repliable, marge 32 px ; sous 768 px menu en `Sheet`, marge 16 px, cibles 44 px).
- **≥ 768 px** : table complète (Identifiant, Titre, Statut, Priorité, Critères). Filtres sur une ligne, `Select` de 220 px. Fiche en `Sheet` latéral de 440 px.
- **< 768 px** : table réduite à deux colonnes (Identifiant, Titre) ; sous le titre, une ligne méta (`md:hidden`) regroupe statut (badge), priorité (texte) et « N critère(s) » avec retour à la ligne autorisé ; les colonnes Statut, Priorité, Critères sont masquées par `hidden md:table-cell` (retirées de l'arbre d'accessibilité, aucune information perdue). Aucun défilement horizontal de la page à 375 px. Filtres empilés en pleine largeur (44 px), « Effacer les filtres » pleine largeur. « Afficher plus de fonctionnalités » pleine largeur, 44 px. La fiche passe en pleine largeur ; le pied reste dans le flux (pas de barre collante : le contenu défile dans le panneau). Cartes d'état (4.3 à 4.10) pleine largeur, boutons 44 px. `Alert` pleine largeur.
- Texte jamais tronqué sans `title` ; les titres longs passent à la ligne (pas d'ellipse sur la fiche).

## 7. Accessibilité
- Repères : `main` dans `SidebarInset`, h1 unique « Fonctionnalités », fil d'Ariane dans une `nav` nommée, fiche = dialogue modal nommé par son h2. `data-testid="app-shell"` conservé.
- Ordre de focus : trigger de barre latérale, fil d'Ariane, filtres (« Statut », « Priorité »), « Effacer les filtres », liens de titre dans l'ordre de la table, « Afficher plus ». Focus visible (`--ring`). Aucun piège.
- Fiche : `Sheet` modal avec focus piégé ; focus initial sur le titre de la fiche (`tabindex="-1"`), pas sur « Fermer » (on lit d'abord) ; Échap ferme et restitue le focus au lien d'origine ; croix `aria-label` « Fermer la fiche ».
- Table : vrai `table` avec `TableCaption`, `th scope="col"`, identifiants et titres en cellules ; la colonne titre contient le seul élément interactif de la ligne.
- Statuts doublés d'une icône **et** d'un libellé (statut de fonctionnalité, `schedule` de préparation, `warning` d'erreur, `lock` d'introuvable) ; priorité en mots. Jamais la couleur seule.
- Régions annoncées : une seule `role="status"` polie par écran pour compteur, chargement, « La spec est prête », « N de plus affichées » ; les erreurs en `Alert` (`role="alert"`, assertive), une seule à la fois par zone (liste / suite de liste / fiche).
- Libellés : `Select` avec `label` visible et lié ; `aria-label` « Version de la spec abc1234 » sur l'identifiant court (équipe) ; icônes décoratives `aria-hidden`. Lien « Voir les projets » et lien `/github` sont de vrais `a` ; « Actualiser », « Réessayer », « Afficher plus », « Créer le dépôt de spec » de vrais `button`.
- Contraste AA en clair et en sombre par les tokens (`foreground`, `muted-foreground`, `border`, `destructive`) ; le texte atténué n'utilise jamais l'opacité. Axe sans violation sur chaque état.
- Mouvement réduit : aucune animation nouvelle ; squelette pulsant seulement sous `motion-safe:` ; ouverture du `Sheet` neutralisée sous `prefers-reduced-motion: reduce` ; l'actualisation automatique de 4.5 ne s'accompagne d'aucun indicateur animé.
- Texte : français clair via i18n (anglais prévu), sans « OAuth », « token », « jeton », « repository », « SHA », « index ».

## 8. Alternatives écartées
1. **Entrée « Fonctionnalités » dans la navigation principale** : l'écran dépend d'un projet et l'organisation en compte plusieurs ; un choix de projet préalable serait nécessaire. Écartée au profit de liens depuis la liste des projets et la barre latérale.
2. **Fiche en page dédiée (`/projects/[id]/features/F-001`)** : route dynamique de plus à garder (proxy, garde) et perte du contexte de liste (filtres, position). Le `Sheet` avec `?feature=` garde le contexte et reste partageable (même modèle que le panneau de détail de DESIGN §5).
3. **Cartes au lieu d'une table** : les fonctionnalités sont comparées sur plusieurs champs (statut, priorité, critères) et DESIGN §5 prévoit `Table` pour les écrans denses ; le repli mobile par ligne méta suffit.
4. **Pagination numérotée (page précédente/suivante)** : le curseur est opaque et avant seulement ; « Afficher plus » est la forme honnête.
5. **Couleurs `status-*` pour le statut de fonctionnalité** : elles disent la validation client (Validée / À valider / À revoir), pas l'avancement d'une spec ; confusion de sens. Badge neutre icône + texte retenu.
6. **Indiquer « sans dépôt » sur chaque ligne de `/projects`** : N appels `repo.list` (un par projet), interdits aux rôles client/business, et un contrat à changer (`hasSpecRepo`) alors que la décision de 48c est de ne pas le changer. La page projet porte l'information, une fois, au bon endroit.
7. **Rendre la description en Markdown** : dépendance nouvelle et contenu actif ; texte brut en 48d, rendu enrichi à revoir avec 48e si l'éditeur le demande.
8. **Bouton « Créer le dépôt » qui renvoie vers `/projects`** : double saut et perte du contexte ; le panneau de 48c est réutilisé en place.
9. **Page « Accès refusé » distincte** : le contrat répond `NOT_FOUND` pour un projet inaccessible précisément pour ne pas révéler son existence ; un état séparé irait contre cette décision.
10. **Actualisation automatique sans borne** : charge inutile et message « toujours en cours » faussement rassurant ; bornée à 2 minutes, puis action manuelle.

## 9. Questions ouvertes
- Statuts de spec (brouillon, spécifiée, implémentée, adoptée) : libellés et icônes proposés, à confirmer avec le propriétaire du produit. Ils ne reprennent pas les couleurs de validation.
- Libellés de priorité (Indispensable, Importante, Souhaitable, Reportée) : traduction libre de MoSCoW, à valider.
- La `description` est du texte brut en 48d ; si la spec contient du Markdown, il s'affichera tel quel jusqu'à décision.
- Les éléments liés (écrans, tables, endpoints) ne sont pas cliquables : aucune cible n'existe. À revoir quand un écran de spec existera.
- Un projet dont la création de dépôt a échoué mais dont le dépôt orphelin existe chez GitHub est repris par « Relier un dépôt existant » (S-projects §5.3) ; la suppression reste manuelle.
- 48c, non bloquant 1 (réponse perdue de `project.create` : doublon possible au réessai) : sans idempotence au contrat ; hors de cet écran, à suivre.
- 48c, non bloquants 2 et 3 (marqueur de reprise absent après `UNAUTHORIZED` à l'étape 2 ; compte sélectionné disparu : « Projet créé. » sans dépôt ni reprise) : **résolus pour l'utilisateur** par 4.6, car un projet sans dépôt est toujours repris depuis sa page. Le code du panneau reste à corriger si on y touche (voir §11).
- 48c, non bloquant 4 (texte d'erreur générique visible brièvement pendant la redirection `UNAUTHORIZED`) : à corriger dans le panneau réutilisé (ne rien afficher tant que la redirection est en cours).

## 10. Historique
| Version | Date | Ticket | Changement et raison |
|---|---|---|---|
| 1 | 2026-10-31 | TK-48 (48d) | Création : liste des fonctionnalités d'un projet en lecture seule (filtres, pagination par « afficher plus »), fiche en `Sheet`, états chargement, vide, vide filtré, en préparation, projet sans dépôt de spec avec reprise en place, index en échec, introuvable, erreurs de fiche, vocabulaire sans git côté client. Détail : `.workflow/TK-48/02-design-48d.md` |
| 1.1 | 2026-10-31 | TK-48 (48d, refactor) | États réellement livrés conformes à la fiche (tous les états de §4, clair et sombre, 375 px). Une seule correction d'écran : la zone défilante de la fiche est une région nommée « Détail de la fonctionnalité », atteignable au clavier (Tab, focus visible `--ring`), exigence axe `scrollable-region-focusable`. Captures générées. |

## 11. Plan d'implémentation web et tests (brief développeur, 48d)
Aucun changement de contrat ni de nouvelle dépendance. Fichiers sous `apps/web/src`, chacun <= 300 lignes.

Routes et garde
- `app/projects/[projectId]/features/page.tsx` (+ `layout.tsx` comme les autres pages gardées). `projectId` validé comme uuid : invalide, rendu 4.10 sans appel d'API.
- `lib/auth-guard.ts` et `proxy.ts` : étendre la garde aux chemins dynamiques `/projects/<uuid>/features` **sans** ouvrir de contournement (`GuardedPath` devient une résolution par motif ; le matcher du proxy couvre le motif ; ne pas affaiblir les tests existants). Test dédié : sans session, `/projects/<uuid>/features` redirige vers `/login` ; session sans organisation vers `/organizations` ; chemin voisin (`/projects/<uuid>/features/x`, `/projects/<uuid>`) non traité comme gardé s'il n'existe pas (404 Next).
- `components/projects-view.tsx` : nom du projet = lien `a` vers la page (suffixe `sr-only` « : fonctionnalités ») ; test existant adapté, pas affaibli. `components/nav-projects.tsx` : `SidebarMenuButton asChild` avec `Link`, `aria-current`, retire `cursor-default`.

Composants (réutiliser `Table`, `Sheet`, `Select`, `Badge`, `Alert`, `Button`, `Icon`, `Skeleton`, `ErrorNotice`, `LoadingStatus`, `Breadcrumb`)
- `components/features-page.tsx` (coque, états), `features-list.tsx` (table, mobile, pagination), `features-filters.tsx`, `feature-sheet.tsx` (+ `feature-detail.tsx`), `features-empty.tsx` (4.3, 4.4), `spec-preparing.tsx` (4.5, 4.7), `spec-repo-missing.tsx` (4.6, ouvre `ProjectCreateSheet` en mode reprise : `projectId` et nom fournis, étape 1 terminée), `spec-index-failed.tsx` (4.8), `feature-error.tsx` (4.11).
- `lib/feature-labels.ts` : libellés et icônes de statut, libellés de priorité, libellés d'étapes (tests : une entrée par valeur du contrat, aucune valeur inconnue rendue brute).
- `lib/use-features.ts` : `useInfiniteQuery` sur `spec.listFeatures` (limit 50, filtres, `getNextPageParam` = `nextCursor`) ; `lib/use-spec-head.ts` : `spec.head` avec `refetchInterval` conditionnel (5 s, 2 min, `refetchIntervalInBackground: false`) ; `repo.list` activée seulement si `spec.head` vaut `null` et rôle owner/admin/dev/designer (`lib/roles.ts` : ajouter `canReadRepos` = `canMoveTickets`). `spec.getFeature` activée à l'ouverture de la fiche.
- `lib/features-url.ts` : lecture/écriture de `status`, `priority`, `feature` dans l'adresse (valeurs validées par les enums et le motif `F-nnn`, inconnues ignorées). `lib/spec-errors.ts` : table `errorCode` -> texte (4.8) et table code d'erreur -> état de fiche (4.11).
- Erreurs lues par `errorCode`/`errorData` (`lib/api-error.ts`), `UNAUTHORIZED` par `use-unauthorized-redirect`.
- Refactor actif sur les fichiers touchés : `project-create-sheet.tsx` (mode reprise paramétrable, ne rien afficher pendant la redirection `UNAUTHORIZED`, cas `closeOutcome` NOT_FOUND signalé comme échec de dépôt et non « Projet créé. »), `projects-page.tsx`, `nav-projects.tsx`.

Tests attendus (Red), AC-48-23 et AC-48-28
- Unitaires `feature-labels`, `features-url`, `spec-errors` (un texte par code, inconnu -> générique, aucune valeur brute dans la phrase).
- `features-page.test.tsx` : chargement (statut + squelette) ; liste (colonnes, liens `?feature=`, tri conservé, libellés icône + texte) ; vide ; vide filtré avec « Effacer les filtres » ; filtres envoyés au contrat (`status`, `priority`) et curseur oublié ; « Afficher plus » ajoute à la suite et disparaît quand `nextCursor` est `null` ; erreur de liste + « Réessayer » ; `VALIDATION` de suite -> « Revenir au début » ; `NOT_FOUND` -> 4.10 sans autre appel ; `UNAUTHORIZED` -> `/login`.
- Indexation : `head` `null` + `repo.list` vide + owner/admin -> 4.6 avec bouton ; même cas dev/designer -> sans bouton ; client/business -> 4.7 et **aucun appel** à `repo.list` ; `repo.list` en erreur -> 4.7 ; `head` `null` + dépôt de spec -> 4.5 ; `building` -> 4.5 / bandeau ; `failed` -> 4.8 sans appel à `listFeatures` ; `listFeatures` 409 -> 4.8 ; actualisation automatique : 5 s, arrêt à 2 min, suspendue onglet masqué (timers simulés).
- Reprise : « Créer le dépôt de spec » -> `repo.createSpec` appelé avec `projectId` et `installationId`, **zéro** `project.create` ; succès -> 4.5 et annonce ; erreurs 48c rendues (`USER_TOKEN_REQUIRED` -> « Autoriser Koklo »).
- Fiche : ouverture par `?feature=F-001` au chargement ; identifiant invalide ignoré ; fermeture retire le paramètre et restitue le focus ; contenu complet (description brute en `pre-wrap`, critères et étapes, liens) ; équipe voit version, fichier et groupes techniques, **client/business voient aucun terme git ni chemin ni SHA ni tables/endpoints** (AC-48-28, test sur le DOM) ; erreurs 503, 429, 403 (`PROVIDER_AUTH_EXPIRED` avec lien `/github` pour owner/admin seulement), 404, 409.
- Garde et navigation : tests `auth-guard` / `proxy`, `projects-view` (lien), `nav-projects` (lien + `aria-current`).
- Accessibilité : `TableCaption`, `th scope`, un seul `role="status"`, `Select` nommés, focus du `Sheet`, mobile 375 px sans défilement horizontal (colonnes masquées retirées de l'arbre), aucune couleur/icône en dur (`design-conformity.test.ts`), mouvement réduit.
- e2e Playwright `apps/web/e2e/features.spec.ts` (faux API / pile locale avec faux fournisseur, jamais github.com) : liste, filtre, fiche, `?feature=`, chaque état de §4, clair/sombre, 375 px, axe sans violation par état ; rôle client en lecture sans terme git ; reprise de dépôt de spec sur un projet créé sans dépôt.
- Preuve navigateur (Chrome, pile locale + faux fournisseur, base seedée) : liste, fiche, projet sans dépôt, index en échec, clair et sombre, mobile. Staging réel : lecture seule, NEEDS-HUMAN pour la création de dépôt réelle.

## 12. Captures (48d, générées par `apps/web/e2e/features.spec.ts`, clair et sombre)
Dossier `design/screens/captures/S-features/` (32 images) : `loading`, `data`, `empty`, `empty-filtered`, `preparing`, `no-repo-manager`, `no-repo-dev`, `unavailable-client`, `index-failed`, `list-error`, `not-found`, `feature-sheet`, `feature-sheet-client`, `feature-error-provider`, `feature-error-auth`, chacun en `-light.png` et `-dark.png` ; `data-light-mobile.png` et `feature-sheet-light-mobile.png` (375 px). Les captures des autres écrans régénérées par la même passe e2e ne sont pas versionnées lorsqu'elles ne diffèrent que par du bruit de rendu.

L'axe des e2e est exécuté avec les étiquettes WCAG (`wcag2a`, `wcag2aa`, `wcag21aa`), comme les autres écrans ; les règles « best-practice » (landmarks de la barre latérale, `label-content-name-mismatch` du menu utilisateur) relèvent du gabarit sidebar-07 et non de cet écran.
