---
id: S-organizations
titre: Choisir ou créer une organisation
version: 1
---
## 1. Utilisateurs et objectif
Toute personne connectée (vue équipe) **sans organisation active** : premier login, ou nouvelle session dont l'organisation n'est pas encore choisie. Aussi toute personne active qui veut créer une autre organisation ou en changer (depuis le menu du TeamSwitcher). Objectif : arriver dans une organisation, sinon en créer une. Ce rôle de porte d'entrée résout la lacune G1 : « connecté mais sans organisation » n'est plus une erreur d'autorisation, c'est un écran.

## 2. Tâches et parcours
- Principale : saisir un nom et créer l'organisation (`organization.create`, l'utilisateur devient propriétaire et l'organisation est active sur sa session), puis arriver sur `/projects`.
- Secondaire : ouvrir une organisation existante (`authClient.organization.setActive`), se déconnecter, basculer clair/sombre.
- Règle de parcours (sans boucle) : seule l'absence de session mène à `/login`. Session sans organisation active : `/projects` et `/members` renvoient vers `/organizations`. `/organizations` ne renvoie jamais vers `/login` quand une session existe.
- Aiguillage à l'arrivée sans organisation active (après `organization.list`) :
  - 0 organisation : formulaire de création seul.
  - 1 organisation : activation automatique puis `/projects`, avec un état « Ouverture de <nom>… » (la personne n'a rien à choisir).
  - 2 organisations ou plus : liste à choisir, formulaire de création en dessous.
- Avec une organisation déjà active (arrivée via le menu du TeamSwitcher) : pas d'activation automatique ; la liste marque l'organisation active et un lien « Retour aux projets » est affiché.
- Pas de barre latérale : écran plein page centré, hors gabarit d'application (même famille que S-login), car sans organisation active la navigation n'a rien à montrer.

## 3. Contenu
Sources : `organization.list` (`{ id, name, slug, role }[]`), `organization.create` (`{ name, slug? }`).
- h1 : « Créer votre organisation » (0 organisation) ou « Choisir une organisation » (au moins une).
- Phrase (0 organisation) : « Une organisation regroupe vos projets et votre équipe. Vous en serez le propriétaire. »
- Liste (si au moins une) : une ligne par organisation, nom, rôle en `Badge` outline (Propriétaire, Administrateur, Développeur, Designer, Client, Business), bouton « Ouvrir » (`aria-label` « Ouvrir l'organisation <nom> »). L'organisation active porte l'icône `check` et le texte « Active » au lieu du bouton.
- Formulaire : champ « Nom de l'organisation » (obligatoire, 1 à 100 caractères) ; bouton « Créer l'organisation ». Sous un `Collapsible` « Personnaliser l'identifiant » : champ « Identifiant » (police mono, 2 à 48 caractères, minuscules, chiffres et tirets), aide « Laissé vide, il est déduit du nom. » ⚠️ à confirmer côté API (voir 9).
- Pied : bouton texte « Se déconnecter » (`signOut`), bascule de thème en haut à droite (comme S-login).

## 4. États
- **Chargement** (`organization.list`) : `role="status"` `aria-busy`, texte « Chargement de vos organisations… » et squelette de carte. Le formulaire n'apparaît pas avant la réponse (évite le flash avant aiguillage).
- **Activation automatique** (1 organisation) : `role="status"`, texte « Ouverture de <nom>… », aucun bouton ; en cas d'échec, retombe sur la liste avec l'erreur d'activation.
- **Vide** (0 organisation) : formulaire de création seul, c'est l'état normal du premier login.
- **Création en cours** : champs en lecture seule, bouton `disabled` + `aria-busy`, libellé « Création… ».
- **Erreur de saisie** (au submit, schéma Zod du contrat) : nom vide « Saisissez le nom de l'organisation. » ; nom trop long « Le nom ne peut pas dépasser 100 caractères. » ; identifiant invalide « Utilisez 2 à 48 lettres minuscules, chiffres ou tirets. » Erreur sous le champ, `aria-invalid`, `aria-describedby`, focus sur le premier champ en erreur.
- **`CONFLICT slug_taken`** : le `Collapsible` s'ouvre, erreur sous « Identifiant » : « Cet identifiant est déjà utilisé. Choisissez-en un autre. » Le champ reçoit le focus. (Le nom, lui, n'a pas besoin d'être unique.)
- **`INTERNAL` / réseau** (création, liste, activation) : `Alert` destructive, icône `warning`, titre « Impossible de continuer », texte « Une erreur est survenue. Vérifiez votre connexion puis réessayez. » ; la saisie est conservée ; bouton « Réessayer » pour la liste.
- **`FORBIDDEN`** : sans objet (tout utilisateur connecté peut créer une organisation).
- **`UNAUTHORIZED`** avec session perdue : `/login`, sans message. Si la session existe, jamais `/login`.

## 5. Interactions et retours
Création réussie : navigation immédiate vers `/projects` (état vide du propriétaire avec son appel à l'action), sans confirmation intermédiaire ; la destination fait foi. Ouvrir une organisation : bouton en cours (`aria-busy`), puis `/projects`, requêtes en cache invalidées. Validation au submit, pas à la frappe. Entrée dans le champ nom valide le formulaire. Le focus arrive sur le champ « Nom de l'organisation » à l'ouverture quand il n'y a rien à choisir.

## 6. Responsive
Sous 768 px : carte pleine largeur moins deux marges de 16 px, boutons pleine largeur, cibles 44 px, lignes d'organisation empilées (nom puis rôle, bouton « Ouvrir » en dessous). Dès 768 px : carte centrée, largeur max 448 px, boutons à largeur de contenu pour « Ouvrir », pleine largeur pour « Créer l'organisation ».

## 7. Accessibilité
- Structure : `main` > `Card` ; un seul `h1` ; `data-testid="organizations-page"`.
- Ordre de focus : bascule de thème, éventuel « Retour aux projets », liste (boutons « Ouvrir »), champ nom, « Personnaliser l'identifiant », champ identifiant, « Créer l'organisation », « Se déconnecter ». Focus visible via l'anneau `ring`.
- `Field`, `Label` associé à chaque `Input` ; aide liée par `aria-describedby` ; le `Collapsible` expose `aria-expanded`.
- Erreurs : `role="alert"` (Alert destructive) pour les erreurs globales ; erreurs de champ liées au champ et annoncées ; jamais la couleur seule (icône `warning` + texte).
- Organisation active : icône `check` + texte « Active », pas de couleur seule.
- Chargement et activation automatique annoncés (`role="status"`).
- Mouvement réduit : aucune animation propre ; squelette immobile sous `prefers-reduced-motion`.

## 8. Alternatives écartées
1. **Un écran porte d'entrée unique (retenu)** contre deux routes (`/organizations/new` et `/organizations/select`) : la même personne passe de l'un à l'autre selon son nombre d'organisations ; un seul écran évite une redirection de plus et un état de plus à tester, et couvre aussi le cas « session neuve, organisation à rouvrir ».
2. **Activation automatique si une seule organisation (retenu)** contre toujours montrer le choix : un choix à une option, à chaque connexion, est du bruit pour le cas le plus fréquent.
3. **Écran plein page centré (retenu)** contre rendu dans le gabarit sidebar : sans organisation active, la barre latérale n'a ni nom d'équipe ni navigation utile, et `project.list` y échouerait.
4. **Identifiant (slug) dans un `Collapsible` (retenu)** contre champ toujours visible ou champ absent : toujours visible alourdit le premier contact (le slug n'a pas de sens pour un client) ; absent rend `slug_taken` impossible à corriger.
5. **Redirection immédiate sans confirmation (retenu)** contre écran « Organisation créée » : le toast n'existe pas dans `@koklo/ui` et un écran intermédiaire ajoute un clic ; `/projects` vide avec « Créer un projet » est la confirmation.
6. **Rediriger vers `/login` sur `UNAUTHORIZED`** (comportement actuel) écarté : c'est la boucle G1.

## 9. Questions ouvertes
- ⚠️ À confirmer côté API : que fait `organization.create` sans `slug` (déduction du nom ?) ; le texte d'aide en dépend. Sinon, rendre le champ visible et obligatoire.
- Icône `group`/`domain` absente de la bibliothèque : la liste utilise `person` si une icône est voulue ; sinon texte seul. Aucune icône n'est requise.
- Nom d'une organisation non unique : deux organisations de même nom sont distinguées par le rôle seulement ; à revoir si le cas apparaît.

## 10. Historique
| Version | Date | Ticket | Changement et raison |
|---|---|---|---|
| 1 | 2026-10-29 | TK-24 | Création : porte d'entrée sans organisation active (G1), création, choix et activation automatique. Détail : `.workflow/TK-24/02-design.md` |
