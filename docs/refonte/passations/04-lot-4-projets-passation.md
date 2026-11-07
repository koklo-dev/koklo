# Refonte UI · Lot 4 · Projets et création de projet : passation à l'agent dev

> Validé par Brice le 05/11/2026 (planche à valider).
> Maquette de référence : canevas « Koklo — maquettes » (copie locale qui fait foi : `docs/refonte/maquettes/08-Lot4Projects.html` ; lire le code avec `pnpm maquette <numéro>`), planche **Lot 4 · Projets et création** (« Nouveau projet » ouvre la boîte de dialogue ; « Créer le projet » montre la carte de création en arrière-plan ; les filtres de phase fonctionnent).
> Prérequis : lots 0 et 1 (`design/refonte/lots-0-1-passation.md`), lot 2a pour la structure du dossier d'idée (`design/refonte/lot-2-idee-passation.md`), lot 3 pour la phase et la prochaine étape (`design/refonte/lot-3-vue-ensemble-passation.md`).

Refonte de **S-projects** (route `/projects`). L'étape Design passe la fiche `design/screens/S-projects.md` en version 7 à partir de ce document. Tous les états d'erreur existants de S-projects (nom pris, jeton GitHub, aucun compte GitHub, création partielle, reprise) sont conservés ; seule leur forme change (§6).

## 1. Objectif

La liste des projets devient un tableau de bord du freelance : pour chaque projet, sa phase, son avancement et **ce qui attend une action**, pour savoir où aller sans ouvrir chaque projet. La création passe de deux étapes techniques (« Projet » puis « Dépôt de spec ») à **une seule boîte de dialogue** ; le dépôt de spec est créé en arrière-plan et le projet s'ouvre immédiatement sur l'espace Idée.

## 2. Gabarit (≥ 1280 px)

- `AppShell` étendu, **sans groupe « Projet »** (aucun projet actif sur cette page). À la place, un groupe **« Récents »** : les 3 derniers projets ouverts (tuile 22 px aux initiales + nom tronqué), liens directs. Groupe « Organisation » avec « Tous les projets » actif.
- `ProjectHeader` en version organisation : ligne 1 « <organisation> / Projets » ; ligne 2 h1 « Projets », résumé « N projets · M attendent une action », action principale **« Nouveau projet »** (`add`).
- Barre d'outils : recherche (nom de projet ou de client), filtres de phase en pastilles bascule « Tous · Idée · Cadrage · Itérations » avec compteurs (`role="group"`, `aria-pressed`), tri à droite « Trié par : activité récente » (menu : activité récente, nom, action attendue en premier).
- Grille de cartes `repeat(auto-fill, minmax(320px, 1fr))`, gap 16.

## 3. Carte de projet

Toute la carte est un lien vers la vue d'ensemble du projet (`/projects/[id]`), rayon 14, padding 18, bordure `--border`, survol : bordure `--border-strong`.

De haut en bas :
1. **Tuile** 40 px rayon 10 aux initiales du projet, couleur stable dérivée de l'identifiant du projet parmi 5 teintes douces (indigo, cyan, vert, ambre, rose ; paires clair / sombre dans la planche, contrastes AA vérifiés) ; **nom** 16/600 ; **client** 13 px `--muted-foreground` (« Marie Lefèvre · Salon Lumière », ou « Aucun client invité ») ; à droite la **phase** en pastille contour : `PhaseRail size="sm"` réduit à 4 traits de 10×4 px + « Cadrage · 2/4 ».
2. **Avancement de la phase** : libellé et valeur sur une ligne, jauge en dessous (10 crans au plus) :
   - Idée : « Dossier d'idée » · « 5 pages stables sur 10 » ;
   - Cadrage : « Livrables validés » · « 2 sur 6 » ;
   - Itérations : « Sprint <id> » · « 5 tickets sur 8 ».
3. **Prochaine étape** : la même donnée que la carte du lot 3 (`project.nextAction`, titre seul), dans un encart 13 px rayon 8 : variante attention (ambre, icône `schedule`) si une action humaine est attendue, sinon neutre (`--surface`, icône `arrow_forward`). Rien à faire : « Rien n'attend d'action ».
4. **Pied** : pile de 3 avatars au plus (client en premier, ambre) + « <dernier acteur>, <date relative> ».

`aria-label` de la carte : « Portail de réservation, Cadrage, livrables validés 2 sur 6, le cahier fonctionnel attend la validation de Marie ».

Tri par défaut : **activité récente**. Le compteur « M attendent une action » compte les projets dont la prochaine étape est en variante attention.

### 3.1 Vue client
Un client membre de plusieurs projets de l'organisation voit la même page, limitée à ses projets ; libellés de la prochaine étape tournés vers lui (« Vous avez 2 fonctionnalités à valider »). Pas de bouton « Nouveau projet ». Un client avec un seul projet est redirigé directement vers sa vue d'ensemble.

## 4. Boîte de dialogue « Nouveau projet »

`Dialog` modal (largeur 520 px, fond `--raised`, rayon 14), focus initial sur « Nom du projet », Échap ou « Annuler » ferme (avec confirmation si un champ a été saisi).

- Titre « Nouveau projet » + phrase 13 px : « Le projet démarre par le dossier d'idée. Le dépôt de spec est créé en arrière-plan. »
- **Nom du projet** (obligatoire, 1 à 100 caractères).
- **Client** (facultatif) : adresse e-mail. Aide : « Il recevra une invitation pour écrire l'idée avec vous. » L'invitation est envoyée à la création avec le rôle client (procédures d'invitation existantes de S-members). Plusieurs adresses : non au lot 4 (une seule ; les autres depuis Réglages ou la vue d'ensemble).
- **Structure du dossier d'idée** : deux cartes radio (`fieldset` + `legend`) : « Cadrage par défaut » (sélectionnée, « 10 pages : vision, problème, utilisateurs, périmètre… Modifiable ensuite. ») et « Dossier vide » (« Vous créez vos pages vous-même. » — les 4 pages requises sont quand même créées, vides, car elles conditionnent le passage au cadrage). La liste vient des gabarits côté serveur (lot 2 §4) ; d'autres structures s'y ajouteront sans changer l'écran.
- **Compte GitHub du dépôt de spec** : sélecteur des installations GitHub actives et autorisées (S-github), affiché seulement s'il y en a plusieurs ; sinon une ligne de texte « Dépôt créé sur <compte> ». Repli « Nom du dépôt : `<slug>-spec` · modifier » (champ facultatif, règles actuelles de S-projects : lettres, chiffres, points, tirets, tirets bas, 100 caractères).
- Pied : « Annuler » (secondaire) et **« Créer le projet »** (principal). Pendant l'envoi : « Création… », bouton désactivé, double envoi impossible (clé d'idempotence existante).
- Erreurs de saisie liées au champ (`aria-describedby`, `aria-invalid`), résumé en haut de la boîte si plusieurs.

## 5. Création en arrière-plan

Dès que le projet et son dossier d'idée sont créés en base (rapide), la boîte se ferme et :
- une **carte de création** apparaît en tête de grille (cadre pointillé `--primary`, fond `--diff-bg`, `role="status"`) avec une liste d'étapes : « Projet créé » (coche verte), « Dossier d'idée prêt (N pages) » (coche verte), « Création du dépôt de spec sur GitHub… » (indicateur `progress_activity`, animation `motion-safe:` seulement) ; phrase « Vous pouvez déjà ouvrir le projet et écrire l'idée. » ; bouton « Ouvrir le projet → » ;
- l'espace Idée fonctionne sans dépôt (lot 2 : seule la publication attend le dépôt).

Fin de création : la carte devient une carte de projet normale (phase Idée). Si l'utilisateur a déjà ouvert le projet, rien ne s'affiche d'autre ; la vue d'ensemble montre l'état du dépôt dans sa prochaine étape s'il a échoué (règle 2 du lot 3).

## 6. États

| État | Rendu |
|---|---|
| Chargement | Squelettes de 3 cartes (`motion-safe:`), `aria-busy` |
| Aucun projet | `EmptyState` « Aucun projet pour l'instant » + « Créez un projet pour commencer le dossier d'idée avec votre client. » + « Nouveau projet » |
| Filtre ou recherche sans résultat | `EmptyState` compact « Aucun projet ne correspond » + « Effacer les filtres » |
| Erreur de chargement | `InlineAlert` erreur sous l'en-tête + « Réessayer » |
| Aucun compte GitHub (create-no-account) | Dans la boîte : `InlineAlert` neutre à la place du sélecteur, « Aucun compte GitHub n'est relié. Le projet sera créé, le dépôt de spec attendra que vous installiez l'application. » + lien « Relier GitHub » (owner / admin) ; la création reste possible |
| Nom de dépôt déjà pris (create-partial-name-taken) | Sur la carte de création : l'étape dépôt passe en erreur (`error`, texte erreur) « Le nom <nom> est déjà pris sur <compte>. » + « Choisir un autre nom » (champ en ligne dans la carte) |
| Jeton GitHub expiré (create-partial-token) | Étape dépôt en erreur « L'autorisation GitHub a expiré. » + « Réautoriser » (owner / admin) ou « Demandez à un administrateur » |
| Autre échec du dépôt (create-partial) | Étape en erreur + « Réessayer » ; le projet reste utilisable |
| Reprise après rechargement (resume-notice) | La carte de création se réaffiche avec l'étape en cours, depuis l'état serveur ; plus de bandeau séparé |

## 7. Contrat oRPC

- `project.list(filter?, sort?)` → pour chaque projet : `id, name, initials, colorKey, clientContact?, phase, progress: { label, done, total, valueLabel }, nextAction?: { title, attention }, people[≤3], lastActivity: { actor, at }, creation?: { steps[], status }`. Une seule requête ; textes construits côté serveur (comme `project.overview`, lot 3).
- `project.create({ name, clientEmail?, ideaTemplate, githubInstallationId?, repoName? })` → `{ projectId }` dès la création en base ; création du dépôt en tâche de fond (mécanisme existant de S-projects), suivi par `project.creationStatus(projectId)` ou au rafraîchissement de la liste (sondage 3 s tant qu'une création est en cours, arrêté ensuite).
- `project.retryRepo({ projectId, repoName? })` pour les états d'échec.
- `project.recent()` → 3 derniers projets ouverts par l'utilisateur (pour la barre).

## 8. Responsive

- **< 1024 px** : grille en 2 colonnes, puis 1 sous 720 px ; filtres de phase en défilement horizontal si nécessaire.
- **< 768 px** : « Nouveau projet » devient un bouton pleine largeur sous le titre ; la boîte de dialogue devient plein écran (`Sheet` du bas), boutons 44 px.

## 9. Accessibilité

- h1 « Projets » ; la grille est une liste (`ul` de cartes) ; une carte = un lien avec `aria-label` complet (§3).
- Filtres : `role="group"` nommé, `aria-pressed` ; compteurs lus avec le libellé (« Cadrage, 2 projets »).
- Boîte de dialogue : `role="dialog"`, `aria-modal`, piège de focus, retour du focus sur « Nouveau projet » à la fermeture.
- Carte de création : `role="status"`, chaque étape annoncée une fois quand elle change.
- Tuiles de couleur décoratives (`aria-hidden`) ; aucune information portée par la seule couleur.
- Contrastes AA clair et sombre ; axe sans violation sur chaque état.

## 10. Critères d'acceptation

- [ ] Grille de cartes avec phase, avancement, prochaine étape, avatars, dernière activité ; tri par activité ; filtres et recherche.
- [ ] Groupe « Récents » dans la barre quand aucun projet n'est actif.
- [ ] Boîte de dialogue unique ; client invité à la création ; choix de la structure du dossier ; compte GitHub sélectionnable seulement s'il y en a plusieurs.
- [ ] Projet ouvrable immédiatement ; dépôt créé en arrière-plan ; tous les échecs de S-projects v6 couverts sur la carte de création.
- [ ] Vue client limitée à ses projets ; redirection directe s'il n'en a qu'un.
- [ ] Captures : liste, filtrée, vide, création en cours, chaque échec, boîte de dialogue ; clair, sombre, 375 px.

## 11. Ticket à ajouter au sprint (format du vault)

```
- [ ] **[TK-?]** Lot 4 · Projets : liste en cartes (phase, avancement, prochaine étape, activité), filtres et tri, groupe « Récents » dans la barre, boîte « Nouveau projet » en une étape (client invité, structure du dossier d'idée, compte GitHub), dépôt de spec en arrière-plan avec carte de création et ses états d'échec, vue client. Réf. design/refonte/lot-4-projets-passation.md. `pkg:api` `pkg:contract` `pkg:web` — dépend des lots 0, 1, 2a et 3
```

## 12. Questions ouvertes (non bloquantes)

- Archivage de projets (filtre « Archivés ») : à prévoir plus tard.
- Inviter plusieurs personnes du côté client dès la création : non au lot 4.
- Vue liste compacte en plus des cartes pour les freelances avec beaucoup de projets : à voir à l'usage.
