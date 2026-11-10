---
id: S-projects
titre: Liste des projets et création
version: 7.1
---
## 1. Utilisateurs et objectif
Personne connectée de l'organisation. **Équipe** (owner, admin, dev, designer, business en lecture) : voit tous les projets, repère ce qui attend une action, crée un projet (owner et admin seulement). **Client** : voit seulement ses projets, sans création ; avec un seul projet, il est redirigé vers sa vue d'ensemble (B305). Entrée : `/projects` (après connexion ou depuis « Tous les projets »). Maquette qui fait foi : `docs/refonte/maquettes/08-Lot4Projects.html` (`pnpm maquette 08`) ; passation 04 ; B297 à B308. Remplace la v6 (tableau, panneau en deux étapes, notice de reprise).

## 2. Tâches et parcours
- Principale : retrouver un projet et voir ce qui attend une action (phase, avancement, prochaine étape, personnes, dernière activité).
- Secondaires : rechercher (nom du projet ou du client), filtrer par phase, trier (activité récente, nom, action attendue d'abord), créer un projet, suivre ou reprendre la création du dépôt de spec.
- Barre latérale : sans projet actif, groupe « Récents » (3 projets, tuile de 22 px) au-dessus d'« Organisation » (« Tous les projets » actif). Sorties : carte = lien vers `/projects/[id]` ; « Ouvrir le projet » sur la carte de création.

## 3. Contenu
Sources : `project.cards` (`items[]`, `total`, `facets`, `attention`, `audience`, `nextCursor`), `project.recent`, `project.creationStatus`, `installation.list` (comptes GitHub actifs), `project.create`, `project.retryRepo`.
- En-tête d'organisation : « <organisation> / Projets », h1 « Projets » 24/600, résumé « N projets · M attendent une action », « Nouveau projet » (`add`, owner et admin ; sous 768 px pleine largeur sous le titre).
- Barre d'outils : `SearchField` « Rechercher un projet ou un client » ; `FilterChip` « Tous · Idée · Cadrage · Itérations » avec compteurs serveur (`role="group"` « Filtrer par phase », `aria-pressed`) ; « Trié par : activité récente » (menu : activité récente, nom, action attendue d'abord).
- Carte (ordre de haut en bas) : tuile 40 aux initiales (teinte `colorKey`), nom, client (« Marie Lefèvre · Salon Lumière » ou « Aucun client invité »), `PhasePill` ; avancement (Idée « Dossier d'idée · 5 pages stables sur 10 » ; Cadrage « Livrables validés · 2 sur 7 » ; Itérations « Sprint SP-7 · 5 tickets sur 8 ») avec jauge ; encart de prochaine étape (attention ambre `schedule`, sinon neutre `arrow_forward`, « Rien n'attend d'action ») ; pied : 3 avatars au plus (client en premier, ambre) + « acteur, date relative ». Nom accessible : tiré du contenu visible (pas d'`aria-label` : axe refuse un nom plus court que le texte affiché, WCAG 2.5.3), par exemple « Portail de réservation Marie Lefèvre · Salon Lumière Phase : Cadrage · 2/4 Livrables validés 2 sur 7 Le cahier fonctionnel attend la validation de Marie … » (B310 j).
- Pied de liste : `ListFooter` (« Fin de la liste · N projets », suite à 80 % du défilement, « Charger la suite » au clavier). Pages de 24, pas de virtualisation (B300).
- État dans l'URL : `?q=`, `?phase=`, `?sort=`.

## 4. États
- **Chargement** : 3 cartes squelettes (`motion-safe:`), `aria-busy`, libellé « Chargement des projets… ». **Aucun projet** : `EmptyState` « Aucun projet pour l'instant » + « Créez un projet pour commencer le dossier d'idée avec votre client. » + « Nouveau projet » (client : sans action). **Sans résultat** : `EmptyState inline` « Aucun projet ne correspond » + « Effacer les filtres » (la recherche porte sur tous les projets, pas seulement ceux affichés). **Erreur** : `InlineAlert` erreur « Impossible de charger les projets » + « Réessayer » ; erreur de la page suivante : `ListFooter` erreur. **Non connecté** : redirection `/login`.
- **Droits** : le client n'a ni bouton ni boîte ; l'API refuse (403) `project.create`, `retryRepo`, `setEuOnly` aux autres rôles.

### 4.1 Boîte « Nouveau projet » (`Dialog` 520, plein écran en bas sous 768 px)
Focus initial sur « Nom du projet » ; Échap ou « Annuler » ferme (confirmation si un champ est saisi) ; le focus revient sur « Nouveau projet ». Titre « Nouveau projet », phrase « Le projet démarre par le dossier d'idée. Le dépôt de spec est créé en arrière-plan. »
- **Nom du projet** (obligatoire, 1 à 100). **Client (facultatif)** : une adresse e-mail, aide « Il recevra une invitation pour écrire l'idée avec vous. » (B303).
- **Structure du dossier d'idée** : `fieldset` + `legend`, deux `RadioCard` : « Cadrage par défaut » (10 pages, défaut) et « Dossier vide » (« Vous créez vos pages vous-même. » ; les 4 pages requises existent, B308). Liste fournie par le serveur.
- **Compte GitHub du dépôt de spec** : `Select` seulement s'il y a plusieurs installations actives, **sans présélection** (choix obligatoire : « Choisissez le compte GitHub du dépôt. ») ; un seul compte : « Dépôt créé sur <compte> » ; **aucun** : `InlineAlert` neutre « Aucun compte GitHub n'est relié. Le projet sera créé, le dépôt de spec attendra que vous installiez l'application. » + lien « Relier GitHub ». Repli « Nom du dépôt : <slug>-spec · modifier » (lettres, chiffres, points, tirets, tirets bas, 100 au plus). Liste des comptes en chargement ou en erreur : « Créer le projet » désactivé avec son texte (`aria-describedby`).
- **Données en UE** (owner et admin) : `Switch` « Les données de ce projet restent dans l'UE » (B304), éteint par défaut.
- Pied : « Annuler », « Créer le projet » (« Création… », désactivé pendant l'envoi, clé d'idempotence unique par ouverture). Erreurs de champ : `aria-invalid` + `aria-describedby`, résumé en haut si plusieurs ; `VALIDATION` sur `clientEmail` (« Cette adresse est déjà membre avec un autre rôle. »). `FORBIDDEN` : `InlineAlert` erreur « Vous n'avez pas le droit de créer un projet. ».

### 4.2 Carte de création (en tête de grille, `role="status"`)
Dès que `project.create` répond, la boîte se ferme et la carte apparaît (cadre pointillé `--primary`, fond `--diff-bg`) : « Projet créé », « Dossier d'idée prêt (N pages) », « Invitation envoyée au client » (si client ; l'adresse n'est pas dans l'état du serveur, qui redessine la carte après un rechargement), « Création du dépôt de spec sur GitHub… » (`Spinner`), « Vous pouvez déjà ouvrir le projet et écrire l'idée. », « Ouvrir le projet ». Sondage 3 s de `project.creationStatus` tant qu'une création est en cours ; elle se réaffiche après rechargement depuis l'état serveur ; à la fin elle devient une carte normale (phase Idée).
Échecs du dépôt (tous ceux de la v6, `error_code` serveur → phrase et action ; action « Réessayer » = `project.retryRepo`, jamais désactivée par minuterie) :
| Code | Phrase | Action |
|---|---|---|
| `no_account` (`skipped`) | « Aucun compte GitHub n'est relié. Le dépôt de spec attendra que vous installiez l'application. » | « Relier GitHub » puis « Réessayer » (owner/admin) |
| `name_taken` | « Le nom <nom> est déjà pris sur <compte>. » | champ en ligne « Choisir un autre nom » puis `retryRepo` |
| `user_token_required`, `missing-user-token` | « Koklo a besoin de votre autorisation GitHub pour créer ce dépôt. » | « Autoriser Koklo » (owner/admin) sinon « Demandez à un administrateur » |
| `auth_expired_user` | « L'autorisation GitHub a expiré. » | « Réautoriser Koklo » ou « Demandez à un administrateur » |
| `auth_expired_installation` | « L'accès de Koklo à ce compte GitHub a expiré. Réinstallez l'application depuis la page GitHub. » | « Ouvrir la page GitHub » + « Réessayer » |
| `resource_not_accessible` | « GitHub refuse la création d'un dépôt sur <compte>. Un propriétaire du compte doit accorder ce droit à l'application. » | « Réessayer » |
| `provider_unavailable` | « GitHub ne répond pas. Votre projet est enregistré ; réessayez plus tard. » | « Réessayer » |
| `rate_limited` (`retry_after_ms`) | « GitHub limite temporairement les demandes. Réessayez dans environ N seconde(s). » | « Réessayer » |
| `account_unavailable` | « Ce compte GitHub n'est plus disponible. Choisissez-en un autre. » | sélecteur de compte puis « Réessayer » |
| `invalid_name` | message du nom invalide sous le champ | « Réessayer » |
| `forbidden` | « Vous n'avez plus le droit de créer un dépôt. Demandez à un propriétaire ou à un administrateur. » | aucune |
| `unknown` | « Le dépôt de spec n'a pas pu être créé. Une erreur est survenue. » | « Réessayer » |
| invitation | « L'invitation n'a pas pu être envoyée. Invitez le client depuis Réglages > Membres. » | lien |
Le projet reste utilisable dans tous les cas ; dépôt déjà relié au projet = réussite. Une carte en échec reste en tête tant que le dépôt n'existe pas.

## 5. Interactions et retours
Filtre, recherche (anti-rebond 200 ms) et tri remettent la liste en haut ; les compteurs viennent du serveur. Retour depuis un projet : pages chargées et position restaurées. Annonce `role="status"` de la page : « 24 projets de plus chargés · 48 sur 61 », « Projet « <nom> » créé. ». Le groupe « Récents » se met à jour à l'ouverture d'un projet (`project.visit`).

## 6. Responsive
Grille `auto-fill minmax(320px, 1fr)` : 2 colonnes sous 1024 px, 1 sous 720 px. Sous 768 px : « Nouveau projet » pleine largeur sous le titre, boîte plein écran (`Dialog`, B311 d), boutons 44 px, filtres en défilement horizontal si besoin. Aucun défilement horizontal à 375 px.

## 7. Accessibilité
h1 « Projets » ; la grille est un `ul`, une carte = un lien au nom accessible complet ; filtres nommés (« Cadrage, 2 projets »). Boîte : `role="dialog"`, `aria-modal`, piège de focus, titre = nom accessible. Carte de création : `role="status"`, chaque étape annoncée une fois, icône + texte (jamais la couleur seule), `Spinner` sous `motion-safe:`. Les tuiles sont décoratives. Contrastes AA clair et sombre ; axe sans violation sur chaque état. Pas de « jeton », « token », « OAuth », « repository » dans les textes.

## 8. Alternatives écartées
(1) Tableau (v6) : remplacé par les cartes, qui portent la prochaine étape. (2) Panneau en deux étapes (v6) : une boîte, le dépôt naît en arrière-plan. (3) `project.list` paginé en rupture 3.0.0 : écarté (B297). (4) Virtualisation par rangée : écartée (B300). (5) Réglage UE dans une page de projet inventée : renvoyé au lot 13c (B304). (6) Bandeau de reprise séparé : la carte de création se réaffiche depuis l'état serveur.

## 9. Questions ouvertes
B297 à B311 (`docs/refonte/questions.md`, décidées en autonomie). Archivage de projets, plusieurs clients à la création et vue liste compacte : plus tard (passation 04 §12).

## 10. Historique
| Version | Date | Ticket | Changement et raison |
|---|---|---|---|
| 1 à 6.1 | 2026-10 à 2026-11 | TK-24 à TK-88 | Tableau des projets, panneau de création en deux étapes, reprise (voir l'historique git de ce fichier) |
| 7 | 2026-11-09 | TK-93 | Refonte d'après la passation 04 et la planche 08 : grille de cartes, filtres et tri serveur, groupe « Récents », boîte « Nouveau projet » en une étape, carte de création avec tous les échecs de la v6, vue client, données en UE (A5) |
| 7.1 | 2026-11-10 | TK-93 lot C | Boîte et carte livrées : `no_account` garde sa carte avec « Réessayer », invitation sans adresse, `Dialog` plein écran sous 768 px, plus de marqueur de reprise (B311) |
