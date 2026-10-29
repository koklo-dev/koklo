---
id: S-projects
titre: Liste des projets
version: 4
---
## 1. Utilisateurs et objectif
Personne connectée (vue équipe d'abord). Elle arrive après la connexion (`/projects`). Objectif : voir les projets auxquels elle a accès. Cet écran décrit aussi le **gabarit d'application** réutilisé par les écrans suivants.

## 2. Tâches et parcours
- Principale : repérer un projet par son nom.
- Secondaire : relancer le chargement en cas d'erreur ; basculer clair/sombre.
- Entrées : `/projects` (redirection depuis `/login` avec session). Sortie : sans session ou erreur `UNAUTHORIZED`, redirection vers `/login`. Le détail d'un projet est hors lot : les lignes ne sont pas des liens tant que la page détail n'existe pas.
- Création (TK-24) : le bouton « Créer un projet » (icône `add`, propriétaire et administrateur seulement) ouvre un panneau latéral (`Sheet`, 400 px) avec le champ « Nom du projet ». Entrée : `/projects` exige une organisation active ; sans organisation active, redirection vers `/organizations` (jamais vers `/login` quand une session existe, lacune G1).

## 3. Contenu
Source : `project.list` (`{ id: uuid, name: string }[]`).
- Titre de page « Projets » (h1, 30 px/600).
- Données : colonne unique « Nom » (`name`). `id` n'est pas affiché (identifiant technique).
- Gabarit (`sidebar-07`, TK-85) : logo « K » + nom « Koklo » en tête de barre latérale ; deux entrées de navigation : « Projets » (icône `account_tree`) et « Membres » (icône `person`, TK-24), `aria-current="page"` sur la page courante, icône remplie quand active ; bascule de thème en pied de barre ; `SidebarTrigger` dans l'en-tête du contenu. Aucune donnée de démo du bloc (équipes, projets factices, utilisateur).
- Correction TK-85 : blocs fidèles, installés par la CLI. En-tête de barre : TeamSwitcher « Koklo » seul (logo K, sans menu). Navigation : NavMain « Projets » (sans sous-menu). Groupe NavProjects : projets réels de `project.list`, non cliquables, masqué si vide, en chargement ou en erreur. Pied : NavUser (nom, e-mail, initiales de la session ; menu = thème + « Se déconnecter » via `signOut`). En-tête de contenu : `SidebarTrigger`, séparateur, fil d'Ariane « Koklo > Projets ». La bascule de thème quitte le pied de barre pour le menu utilisateur.
- Pied de barre latérale : `APP_VERSION` non affichée (pas de besoin utilisateur).

- TK-24, TeamSwitcher : n'est plus statique. Il affiche le nom de l'organisation active (repli « Koklo » pendant le chargement), le rôle en texte secondaire et l'icône `unfold_more`. Menu (`DropdownMenu`) : libellé « Organisations », une ligne par organisation (`check` sur l'active, changement via `setActive` puis rechargement des données), séparateur, « Créer une organisation » (icône `add`, vers `/organizations`).
- TK-24, création de projet : `Sheet` titre « Créer un projet », champ « Nom du projet » (1 à 100 caractères), boutons « Créer le projet » et « Annuler ». Source : `project.create`. Succès : le panneau se ferme, le focus revient sur le bouton déclencheur, la liste se recharge, une région `role="status"` annonce « Projet « <nom> » créé. » et le compteur monte.

## 4. États
- **Chargement** : zone `role="status"` `aria-busy="true"` avec libellé visible « Chargement des projets… » et 3 lignes squelette (tokens `muted`). Aucun contenu périmé. Squelette immobile en mouvement réduit.
- **Vide** (`[]`) : `Card` centrée : icône `account_tree` (28), titre « Aucun projet pour le moment ». Propriétaire ou administrateur : texte « Créez votre premier projet pour commencer. » et bouton « Créer un projet ». Autres rôles : texte « Les projets auxquels vous avez accès apparaîtront ici. », sans bouton. Pas de tableau vide.
- **Données** : `Table` avec `TableCaption` masquée visuellement « Liste des projets », un `TableHead` « Nom », une ligne par projet. Compteur « N projet(s) » sous le titre.
- **Erreur** (`INTERNAL`, réseau) : `Alert` destructive, icône `warning`, titre « Impossible de charger les projets », description « Une erreur est survenue. Vérifiez votre connexion puis réessayez. », bouton `Button variant="outline"` « Réessayer » qui relance `project.list` (passe en état chargement).
- **Non connecté / `UNAUTHORIZED`** : redirection vers `/login`, sans message.
- Droits insuffisants (TK-24) : la liste est filtrée côté API ; pour les rôles autres que propriétaire et administrateur, le bouton « Créer un projet » n'est pas rendu. Si l'API répond `FORBIDDEN` à la création : `Alert` destructive dans le panneau, icône `lock`, « Vous n'avez pas le droit de créer un projet. Demandez à un propriétaire ou à un administrateur. », saisie conservée.
- Création en cours : champ en lecture seule, bouton `disabled` + `aria-busy`, « Création… ».
- Erreur de saisie : nom vide « Saisissez le nom du projet. » ; plus de 100 caractères « Le nom ne peut pas dépasser 100 caractères. » (sous le champ, `aria-invalid`, `aria-describedby`, focus sur le champ).
- Erreur `INTERNAL` à la création : `Alert` destructive dans le panneau, « Le projet n'a pas pu être créé », « Une erreur est survenue. Réessayez dans un instant. »
- Session sans organisation active (G1) : redirection vers `/organizations`, sans message.

## 5. Interactions et retours
« Réessayer » remet l'écran en chargement puis en données/vide/erreur. Bascule de thème immédiate, persistée (cookie/localStorage), sans flash au rechargement ; défaut clair (H-24). Panneau de détail : emplacement réservé (380–440 px, `aside` absent du DOM tant qu'aucun détail n'existe), aucune interaction.

## 6. Responsive
Gabarit : barre latérale **248 px** (`--sidebar-width: 15.5rem`) repliable en icônes (48 px, Tooltip), marge de page **32 px**, panneau de détail **380–440 px** réservé (absent du DOM).
Sous 768 px : barre latérale masquée, ouverte en `Sheet` par le trigger de l'en-tête (logo « K », « Projets », bascule de thème dedans), marge 16 px, cibles 44 px, tableau sans défilement horizontal à 375 px, `Alert` pleine largeur.

## 7. Accessibilité
- Repères : `nav` (aria-label « Navigation principale ») dans la sidebar, `main` dans `SidebarInset`, titre h1 unique, aucun `aside` vide. `data-testid="app-shell"` conservé.
- Ordre de focus : trigger, lien « Projets », bascule de thème, contenu (« Réessayer » en erreur). Focus visible. Menu utilisateur : `aria-label` « Menu utilisateur », Échap restitue le focus. Mobile : Sheet avec focus piégé, Échap ferme et restitue le focus au trigger.
- `SidebarTrigger` : vrai `button`, `aria-label` « Réduire la barre latérale » / « Ouvrir la barre latérale », `aria-expanded` ; icônes `left_panel_close` / `left_panel_open`. Replié, le texte des liens reste sr-only et un Tooltip s'affiche au survol et au focus. Raccourci Ctrl/Cmd+B du bloc conservé.
- Item actif : `aria-current="page"` posé explicitement (le bloc ne pose que `data-active`).
- Bascule de thème : `IconButton` `aria-label` « Passer au thème sombre » / « Passer au thème clair » ; `dark_mode` en clair, `light_mode` en sombre.
- Statuts doublés d'une icône : erreur `warning` + texte ; chargement texte + squelette ; vide icône + texte.
- Chargement annoncé (`role="status"`), erreur annoncée (`role="alert"` via `Alert`).
- Mouvement réduit : le squelette ne pulse que sous `motion-safe:` ; transitions neutralisées sous `prefers-reduced-motion: reduce`.
- Contraste AA en clair et en sombre, vérifié par axe sur les 4 états.

## 8. Alternatives écartées
1. **`Table` (retenu)** contre grille de `Card` : DESIGN.md prévoit des tableaux denses, et les prochaines colonnes (statut, version) s'y ajouteront sans refonte.
2. **Barre latérale 248 px repliable (retenu, TK-85)** contre barre supérieure seule ou barre fixe non repliable : les écrans suivants ont besoin d'une navigation étendue ; le repli libère la largeur des tableaux ; en mobile la `Sheet` remplace la barre supérieure.
3. **Squelette + libellé** contre spinner seul : le libellé donne un nom annoncé aux lecteurs d'écran et le squelette évite le saut de mise en page.
4. **Erreur en ligne avec « Réessayer »** contre redirection vers une page d'erreur : l'utilisateur garde le contexte et la navigation.
5. **Panneau de détail absent du DOM** contre colonne vide visible : une colonne vide de 380 px fait croire à une fonction manquante.
6. **`--sidebar` = `var(--card)` + bordure (TK-85)** contre teinte dédiée ou `--muted` : pas de nouveau token, pas d'ombre (DESIGN §5).
7. **NavUser réel (retenu, correction TK-85)** contre bascule de thème seule ou menu de démo (Compte, Facturation, Notifications) : seules actions réelles, thème et déconnexion.
8. **TeamSwitcher à entrée unique sans menu** contre équipes factices ou « Ajouter une équipe » : aucune notion d'équipe dans le contrat.

9. **Création dans un `Sheet` (TK-24, retenu)** contre page `/projects/new` : un seul champ, le contexte de la liste est conservé et le projet apparaît derrière le panneau à la fermeture.
10. **`Sheet` (retenu)** contre formulaire en ligne au-dessus du tableau : le formulaire en ligne pousse le tableau et se confond avec lui ; contre `Dialog` : absent de `@koklo/ui`. L'emplacement 380–440 px de DESIGN §5 est le même gabarit.
11. **Bouton absent pour les rôles non gestionnaires (TK-24)** contre bouton désactivé : un bouton désactivé n'explique rien.

## 9. Questions ouvertes
- TK-24 : pas de composant `Dialog` dans `@koklo/ui` ; `Sheet` utilisé. Pas de toast : confirmations par région `role="status"`.
- Colonnes à ajouter au tableau quand le contrat exposera plus que `id` et `name`.
- Icône `logout` absente de DESIGN §4 : ajoutée au générateur pour « Se déconnecter » (TK-85 correction).
- Items de navigation 32 px (bloc) contre 36-38 px (DESIGN §5) : bloc conservé ; 44 px sous 768 px.
- Repli en icônes (`collapsible="icon"`) absent de DESIGN §5 : conservé car c'est le bloc demandé (Q1 TK-85).
- Largeur 248 px (DESIGN §5) préférée aux 256 px du bloc.
- Cookie `sidebar_state` du bloc (état de repli, sans donnée personnelle) : à citer dans la future politique de confidentialité.
- Icône `refresh` absente de la bibliothèque : « Réessayer » reste texte seul.

## 10. Historique
| Version | Date | Ticket | Changement et raison |
|---|---|---|---|
| 1 | 2026-10-27 | TK-14 | Création : gabarit d'application et liste des projets, 4 états + redirection |
| 2 | 2026-10-27 | TK-85 | Gabarit remplacé par `sidebar-07` : repli en icônes, Sheet mobile, mapping `--sidebar-*` sur les tokens, 248 px, nav nommée et `aria-current` conservés ; contenu et 4 états inchangés. Détail : `.workflow/TK-85/02-design.md` |
| 3 | 2026-10-28 | TK-85 (correction) | Retour à `sidebar-07` fidèle (CLI) : TeamSwitcher, NavMain, NavProjects réels, NavUser avec déconnexion, fil d'Ariane ; largeur 248 px et marges 32/16 px alignées sur DESIGN §5, reste du bloc conservé ; 44 px mobile. Détail : `.workflow/TK-85/02-design.md` |
| 4 | 2026-10-29 | TK-24 | Création de projet (`Sheet`, rôles owner/admin), état vide avec appel à l'action, TeamSwitcher réel (organisation active, changement, création), entrée « Membres », garde G1 vers `/organizations`. Détail : `.workflow/TK-24/02-design.md` |
