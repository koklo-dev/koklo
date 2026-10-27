---
id: S-projects
titre: Liste des projets
version: 1
---
## 1. Utilisateurs et objectif
Personne connectée (vue équipe d'abord). Elle arrive après la connexion (`/projects`). Objectif : voir les projets auxquels elle a accès. Cet écran décrit aussi le **gabarit d'application** réutilisé par les écrans suivants.

## 2. Tâches et parcours
- Principale : repérer un projet par son nom.
- Secondaire : relancer le chargement en cas d'erreur ; basculer clair/sombre.
- Entrées : `/projects` (redirection depuis `/login` avec session). Sortie : sans session ou erreur `UNAUTHORIZED`, redirection vers `/login`. Le détail d'un projet est hors lot : les lignes ne sont pas des liens tant que la page détail n'existe pas.
- Pas de création de projet dans ce lot (aucune action inventée).

## 3. Contenu
Source : `project.list` (`{ id: uuid, name: string }[]`).
- Titre de page « Projets » (h1, 30 px/600).
- Données : colonne unique « Nom » (`name`). `id` n'est pas affiché (identifiant technique).
- Gabarit : logo « K » + nom « Koklo » en tête de barre latérale ; une entrée de navigation « Projets » (icône `account_tree`, `aria-current="page"`, remplie car active) ; bascule de thème.
- Pied de barre latérale : `APP_VERSION` non affichée (pas de besoin utilisateur).

## 4. États
- **Chargement** : zone `role="status"` `aria-busy="true"` avec libellé visible « Chargement des projets… » et 3 lignes squelette (tokens `muted`). Aucun contenu périmé. Squelette immobile en mouvement réduit.
- **Vide** (`[]`) : `Card` centrée : icône `account_tree` (28), titre « Aucun projet pour le moment », texte « Les projets auxquels vous avez accès apparaîtront ici. » Pas de tableau vide, pas de bouton inventé.
- **Données** : `Table` avec `TableCaption` masquée visuellement « Liste des projets », un `TableHead` « Nom », une ligne par projet. Compteur « N projet(s) » sous le titre.
- **Erreur** (`INTERNAL`, réseau) : `Alert` destructive, icône `warning`, titre « Impossible de charger les projets », description « Une erreur est survenue. Vérifiez votre connexion puis réessayez. », bouton `Button variant="outline"` « Réessayer » qui relance `project.list` (passe en état chargement).
- **Non connecté / `UNAUTHORIZED`** : redirection vers `/login`, sans message.
- Droits insuffisants : sans objet (la liste est filtrée côté API).

## 5. Interactions et retours
« Réessayer » remet l'écran en chargement puis en données/vide/erreur. Bascule de thème immédiate, persistée (cookie/localStorage), sans flash au rechargement ; défaut clair (H-24). Panneau de détail : emplacement réservé (380–440 px, `aside` absent du DOM tant qu'aucun détail n'existe), aucune interaction.

## 6. Responsive
Gabarit : barre latérale **248 px** fixe, marge de page **32 px**, panneau de détail **380–440 px** réservé.
Sous 768 px : barre latérale remplacée par une barre supérieure empilée au-dessus du contenu (logo « K », « Projets », bascule de thème), marge 16 px, cibles 44 px, tableau sans défilement horizontal à 375 px, `Alert` pleine largeur.

## 7. Accessibilité
- Repères : `header`/`nav` (aria-label « Navigation principale »), `main`, titre h1 unique.
- Ordre de focus : lien « Projets », bascule de thème, contenu (« Réessayer » en erreur). Focus visible.
- Bascule de thème : `IconButton` `aria-label` « Passer au thème sombre » / « Passer au thème clair » ; `dark_mode` en clair, `light_mode` en sombre.
- Statuts doublés d'une icône : erreur `warning` + texte ; chargement texte + squelette ; vide icône + texte.
- Chargement annoncé (`role="status"`), erreur annoncée (`role="alert"` via `Alert`).
- Mouvement réduit : le squelette ne pulse que sous `motion-safe:` ; transitions neutralisées sous `prefers-reduced-motion: reduce`.
- Contraste AA en clair et en sombre, vérifié par axe sur les 4 états.

## 8. Alternatives écartées
1. **`Table` (retenu)** contre grille de `Card` : DESIGN.md prévoit des tableaux denses, et les prochaines colonnes (statut, version) s'y ajouteront sans refonte.
2. **Barre latérale fixe 248 px (retenu)** contre barre supérieure seule : les écrans suivants (features, tickets) ont besoin d'une navigation étendue ; la barre supérieure ne sert qu'en mobile.
3. **Squelette + libellé** contre spinner seul : le libellé donne un nom annoncé aux lecteurs d'écran et le squelette évite le saut de mise en page.
4. **Erreur en ligne avec « Réessayer »** contre redirection vers une page d'erreur : l'utilisateur garde le contexte et la navigation.
5. **Panneau de détail absent du DOM** contre colonne vide visible : une colonne vide de 380 px fait croire à une fonction manquante.

## 9. Questions ouvertes
- Colonnes à ajouter au tableau quand le contrat exposera plus que `id` et `name`.
- Menu utilisateur (avatar, déconnexion) : non prévu dans ce lot, aucune sortie de session visible ; à décider.
- Icône `refresh` absente de la bibliothèque : « Réessayer » reste texte seul.

## 10. Historique
| Version | Date | Ticket | Changement et raison |
|---|---|---|---|
| 1 | 2026-10-27 | TK-14 | Création : gabarit d'application et liste des projets, 4 états + redirection |
