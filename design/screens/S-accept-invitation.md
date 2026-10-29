---
id: S-accept-invitation
titre: Accepter une invitation
version: 1
---
## 1. Utilisateurs et objectif
Une personne invitée dans une organisation (lien reçu par e-mail, `/accept-invitation/<id>`, envoyé par TK-23). Elle arrive de sa messagerie, souvent sans organisation active, parfois sans session. Objectif : rejoindre l'organisation avec le rôle prévu, en un clic, ou comprendre pourquoi ce n'est pas possible et que faire. Vue équipe d'abord (le rôle `client` peut aussi être invité : le texte reste sans vocabulaire git).

## 2. Tâches et parcours
- Principale : cliquer « Accepter l'invitation » (`authClient.organization.acceptInvitation({ invitationId })`), puis arriver sur `/projects` avec l'organisation active.
- Secondaires : se déconnecter pour changer de compte (adresse différente), aller aux projets (déjà membre), basculer clair/sombre.
- Sans session : `/accept-invitation/<id>` redirige vers `/login?next=/accept-invitation/<id>` (rien de l'invitation n'est révélé). Après connexion GitHub, retour sur l'invitation.
- Connecté sans organisation active : l'écran reste affiché (pas de renvoi vers `/organizations`, c'est le cas nominal d'un nouvel invité).
- Acceptation explicite par clic, jamais automatique au chargement (un robot de messagerie ne doit pas consommer l'invitation ; la personne confirme l'organisation).
- Pas de barre latérale : écran plein page centré, même famille que S-login et S-organizations.

## 3. Contenu
Sources : `organization.getInvitation({ id })` (organisation, rôle, inviteur ; visible du seul destinataire connecté), `organization.acceptInvitation`, `getSession` (adresse de session).
- h1 selon l'état (voir 4). Un seul `h1`.
- Prêt à accepter : « Rejoindre <nom de l'organisation> » ; phrase « <inviteur> vous invite à rejoindre cette organisation avec le rôle <rôle>. » (rôle en `Badge` outline, mêmes libellés français que S-organizations : Propriétaire, Administrateur, Développeur, Designer, Client, Business) ; bouton principal « Accepter l'invitation ». Pas de bouton de refus (hors périmètre, aucune fonction derrière). Si l'inviteur est inconnu, la phrase devient « Vous êtes invité(e) à rejoindre cette organisation avec le rôle <rôle>. »
- Pied (états avec session) : « Connecté en tant que <adresse de session> » + bouton texte « Se déconnecter » (`signOut`), pour changer de compte. Bascule de thème en haut à droite.
- Logo « K » temporaire au-dessus de la `Card`, comme S-login.

## 4. États
Tout état remplace le contenu de la même `Card`. Le focus est déplacé sur le `h1` (tabindex -1) à chaque changement d'état.
- **Chargement** (session puis `getInvitation`) : `role="status"` `aria-busy`, texte « Chargement de l'invitation… » et squelette de carte (`Skeleton`). Aucun nom d'organisation avant la réponse.
- **Invitation acceptable** : voir 3.
- **Acceptation en cours** : bouton `disabled` + `aria-busy="true"`, libellé « Acceptation… ».
- **Succès** : `role="status"`, icône `check_circle`, h1 « Bienvenue dans <organisation> », texte « Ouverture de vos projets… », puis navigation immédiate vers `/projects` (requêtes invalidées). Visible un instant seulement, la destination fait foi ; sans animation.
- **Adresse différente** (403 `YOU_ARE_NOT_THE_RECIPIENT…`) : `Alert` destructive, icône `warning`, h1 « Cette invitation est destinée à une autre adresse », texte « Vous êtes connecté(e) avec <adresse de session>. Déconnectez-vous puis reconnectez-vous avec le compte GitHub dont l'adresse a reçu l'invitation. » Ni l'adresse invitée ni l'organisation ne sont affichées. Action principale « Se déconnecter » (retour sur l'invitation après nouvelle connexion) ; secondaire « Aller à mes projets ».
- **Déjà membre** : icône `check_circle` (information, pas une erreur), h1 « Vous faites déjà partie de cette organisation », texte « Il n'y a rien à accepter. » Action principale « Ouvrir mes projets » (active l'organisation si besoin, puis `/projects`).
- **Invitation introuvable, expirée, annulée ou déjà acceptée** (400 `INVITATION_NOT_FOUND`, et id non-UUID sans appel réseau) : `Alert` destructive, icône `warning`, h1 « Cette invitation n'est plus valide », texte « Elle a peut-être expiré (elles durent 7 jours), été annulée ou déjà été acceptée. Demandez un nouveau lien à la personne qui vous a invité(e). » Action : « Aller à mes projets » (`/projects`), ou « Retour à la connexion » si la session est absente. Message unique : Better Auth ne distingue pas ces causes (limite connue, voir 9).
- **Erreur technique** (5xx, réseau, hors-ligne, au chargement ou à l'acceptation) : `Alert` destructive, icône `warning`, titre « Impossible de continuer », texte « Une erreur est survenue. Vérifiez votre connexion puis réessayez. », bouton « Réessayer » (relance l'appel concerné ; sans effet de bord sur l'invitation). Si l'erreur survient à l'acceptation, l'écran « prêt à accepter » reste affiché sous l'alerte.
- **Sans session** : aucun rendu, redirection `/login` (l'écran de connexion est inchangé, voir S-login).
- Droits insuffisants, vide : sans objet.

## 5. Interactions et retours
Un seul bouton principal par état. Pas de confirmation supplémentaire : le clic explicite est la confirmation. Les erreurs sont annoncées (`role="alert"` de l'`Alert` destructive) et reçoivent le focus sur le titre. Le texte de l'adresse de session est la seule donnée personnelle affichée hors destinataire. Aucune URL ni id d'invitation dans le texte, le titre de page ou les journaux ; `document.title` fixe « Invitation – Koklo » ; page `noindex`, `Cache-Control: no-store`, aucun lien sortant.

## 6. Responsive
Sous 768 px : carte pleine largeur moins deux marges de 16 px, boutons pleine largeur, cibles 44 px, le bloc « Connecté en tant que » s'empile (adresse puis « Se déconnecter », adresse tronquée par retour à la ligne, pas de défilement horizontal). Dès 768 px : carte centrée, largeur max 448 px, bouton principal pleine largeur de la carte.

## 7. Accessibilité
- Structure : `main` > `Card` ; un seul `h1` ; `data-testid="accept-invitation-page"`.
- Ordre de focus : bascule de thème, bouton principal de l'état, action secondaire, « Se déconnecter ». À chaque changement d'état le focus va sur le `h1` ; focus visible via l'anneau `ring`.
- Chargement et succès : `role="status"` + `aria-busy` ; erreurs : `role="alert"`.
- Aucun statut par la couleur seule : icône (`warning`, `check_circle`) + texte ; le violet de marque n'est pas utilisé pour une erreur (`Alert` destructive).
- Icônes décoratives `aria-hidden` ; le rôle est un `Badge` avec son texte.
- Contraste AA en clair et sombre (tokens `@koklo/ui`). Mouvement réduit : aucune animation propre ; squelette immobile sous `prefers-reduced-motion`.
- Composants et tokens `@koklo/ui` uniquement : `Card`, `Button`, `Alert`, `Badge`, `Skeleton`, `Icon` (`warning`, `check_circle`, `logout`, `dark_mode`, `light_mode`) ; aucune couleur ni SVG en dur.

## 8. Alternatives écartées
1. **Clic explicite « Accepter l'invitation » (retenu)** contre acceptation automatique à l'ouverture : un aperçu de lien par une messagerie consommerait l'invitation, et la personne ne confirmerait pas la bonne organisation.
2. **Aperçu organisation et rôle avant acceptation (retenu, H2)** contre écran minimal « Rejoindre l'organisation » : savoir où l'on entre et avec quel rôle rassure, et ces détails ne sont montrés qu'au destinataire connecté (aucune fuite). L'écran minimal reste le repli si `getInvitation` n'est pas utilisable.
3. **Un message unique pour inconnue / expirée / annulée / acceptée (retenu)** contre quatre messages : Better Auth renvoie le même état ; deviner la cause serait inventer, et un message distinct créerait un oracle d'existence. Le texte nomme les causes possibles.
4. **Écran plein page centré (retenu)** contre rendu dans le gabarit sidebar : un nouvel invité n'a pas d'organisation active, la navigation n'aurait rien à montrer.
5. **Retour par `/login?next=` en liste blanche (retenu)** contre cookie ou stockage local : paramètre visible, testable, sans état caché ; seuls les chemins `/accept-invitation/<uuid>` sont acceptés.
6. **Bouton « Refuser » à côté d'« Accepter »** écarté : `rejectInvitation` est hors périmètre, un bouton sans fonction serait un faux contrôle.
7. **Toast de succès puis redirection** écarté : pas de toast dans `@koklo/ui` ; l'état « Bienvenue » en `role="status"` suffit, `/projects` fait foi.

## 9. Questions ouvertes
- Q1 (analyse) : distinguer expirée / annulée / acceptée exigerait un ajout API (ticket de suite) ; message unique en attendant.
- Q2 (analyse) : aperçu organisation/rôle retenu ; l'écran minimal reste possible.
- Q3 (analyse) : refus d'invitation à planifier ou non.
- « Déjà membre » : comportement réel de Better Auth à confirmer au test rouge ; sinon le front consulte `organization.list`.
- Pas d'icône `group`/`domain` ni d'icône GitHub : aucune icône d'organisation, texte seul.
- Libellés de rôle : réutilisés de S-organizations, à factoriser côté code.

## 10. Historique
| Version | Date | Ticket | Changement et raison |
|---|---|---|---|
| 1 | 2026-10-29 | TK-86 | Création : acceptation d'une invitation (clic explicite, aperçu pour le destinataire, retour après connexion, états d'erreur sans fuite). Détail : `.workflow/TK-86/02-design.md` |
