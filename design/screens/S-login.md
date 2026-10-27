---
id: S-login
titre: Connexion
version: 2
---
## 1. Utilisateurs et objectif
Toute personne non connectée (vue équipe d'abord ; la vue client suivra avec ses propres entrées). Elle arrive par l'URL de l'application ou par la redirection depuis `/projects` sans session. Objectif : ouvrir une session via GitHub, le seul fournisseur du lot.

## 2. Tâches et parcours
- Principale : cliquer « Continuer avec GitHub » (`signIn.social({ provider: "github" })`, retour vers `/projects`).
- Secondaire : basculer clair/sombre.
- Entrée : `/login`, ou redirection depuis une page protégée. Sortie : GitHub puis `/projects`. Avec une session valide, `/login` redirige vers `/projects`.
- Pas de barre latérale : écran plein page centré (bloc shadcn `login-05`), hors gabarit d'application (le gabarit commence à S-projects).

## 3. Contenu
Ordre d'importance : logo « K » temporaire (repère, pas une marque) ; titre « Connexion à Koklo » (h1) ; phrase « Connectez-vous avec votre compte GitHub pour accéder à vos projets. » ; bouton principal ; bascule de thème en haut à droite. Aucune donnée oRPC. Aucun champ de saisie : les champs e-mail/mot de passe, « mot de passe oublié », Apple/Google, inscription et mentions légales de `login-05` sont retirés.
Mise en page (TK-85) : colonne centrée, `bg-muted`, logo « K » au-dessus de la `Card`, bascule de thème en haut à droite.

## 4. États
- Par défaut : bouton actif.
- Envoi en cours (clic, redirection) : bouton `disabled` + `aria-busy="true"`, libellé « Redirection vers GitHub… » ; retour au repos si l'appel échoue.
- Erreur de connexion (échec de `signIn` ou retour GitHub refusé) : `Alert` destructive au-dessus du bouton, icône `warning` + texte « La connexion avec GitHub a échoué. Réessayez. » ; le bouton reste utilisable.
- Déjà connecté : redirection immédiate vers `/projects` (aucun rendu).
- Vide, chargement de données, droits insuffisants : sans objet.

## 5. Interactions et retours
Un seul appel à l'action. Pas de confirmation. L'erreur est annoncée (`role="alert"` porté par `Alert` destructive). Thème par défaut **clair** (H-24), quel que soit `prefers-color-scheme` ; le choix est persisté et appliqué avant le premier rendu (pas de flash).

## 6. Responsive
Sous 768 px : la carte occupe la largeur moins deux marges de 16 px, bouton pleine largeur, hauteur de cible 44 px. Dès 768 px : carte centrée, largeur max 384 px (`max-w-sm`), bouton pleine largeur de la carte (36 px de haut).

## 7. Accessibilité
- Structure : `main` > `Card` ; un seul `h1` ; `data-testid="login-page"` conservé.
- Ordre de focus : bouton de thème, puis « Continuer avec GitHub ». Focus visible via l'anneau `ring` des composants.
- Bouton d'icône de thème : `aria-label` « Passer au thème sombre » / « Passer au thème clair » (selon le thème courant) ; icône `dark_mode` en clair, `light_mode` en sombre.
- L'icône du bouton GitHub est décorative ; le libellé texte porte le nom.
- L'erreur n'est pas signalée par la couleur seule (icône + texte).
- Mouvement réduit : aucune animation propre à l'écran ; les transitions de couleur sont neutralisées sous `prefers-reduced-motion: reduce`.

## 8. Alternatives écartées
1. **Carte centrée sur page unie (retenu)** contre écran scindé (visuel de marque à gauche) : la marque n'a ni logo ni illustration validés, un visuel serait inventé.
2. **Un seul bouton GitHub** contre formulaire e-mail + mot de passe en plus : hors périmètre du lot, la vision ne prévoit que GitHub pour l'instant.
3. **Erreur dans une `Alert` en ligne** contre un toast : le toast disparaît et n'existe pas dans `@koklo/ui` ; l'`Alert` reste lisible et annoncée.
4. **Thème selon `prefers-color-scheme`** contre clair par défaut : tranché par H-24 (clair).
5. **`login-05` (TK-85, retenu)** contre variantes à visuel scindé (`login-03`/`login-04`) : un visuel serait inventé ; seuls tokens, icônes et textes s'écartent du bloc.
6. **Garder les champs e-mail et boutons sociaux du bloc** contre bouton GitHub seul : hors périmètre, aucune fonction derrière.

## 9. Questions ouvertes
- Logo et marque définitifs (DESIGN.md §8.3) : « K » temporaire.
- Pas d'icône GitHub dans la bibliothèque d'icônes ; `lock` est utilisée en attendant. Ajouter une icône de marque demanderait une décision (Q3 de TK-85 : `lock` conservée, icône décorative `aria-hidden`).
- Vue client : parcours de connexion à définir (sans vocabulaire git) ; hors lot.

## 10. Historique
| Version | Date | Ticket | Changement et raison |
|---|---|---|---|
| 1 | 2026-10-27 | TK-14 | Création : connexion GitHub, carte centrée, thème clair par défaut (H-24) |
| 2 | 2026-10-27 | TK-85 | Adoption de `login-05` (CLI shadcn) : même contenu, textes et états ; éléments hors périmètre retirés ; largeur 384 px ; tokens et icônes du projet, `lock` conservée. Détail : `.workflow/TK-85/02-design.md` |
