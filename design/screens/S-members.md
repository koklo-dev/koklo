---
id: S-members
titre: Membres et invitation
version: 1
---
## 1. Utilisateurs et objectif
Membres de l'organisation active (vue équipe). Les propriétaires et administrateurs invitent ; les autres rôles (développeur, designer, client, business) consultent la liste. Arrivée depuis l'entrée « Membres » de la barre latérale. Objectif : inviter quelqu'un avec le bon rôle et voir qui fait partie de l'organisation.

## 2. Tâches et parcours
- Principale : saisir un e-mail, choisir un rôle, « Inviter ».
- Secondaire : consulter la liste des membres ; relancer le chargement.
- Entrées : `/members` (navigation). Sans session : `/login` ; session sans organisation active : `/organizations`.
- Sorties : aucune. La page d'acceptation de l'invitation, la liste des invitations en attente, le renvoi et le changement de rôle sont hors lot.
- Gabarit : celui de S-projects (sidebar-07), entrée « Membres » (icône `person`, `aria-current="page"`), fil d'Ariane « Koklo > Membres ».

## 3. Contenu
Sources : `member.list` (`{ id, userId, name, email, role }[]`), `member.invite` (`{ email, role }` -> `{ id, email, role, status: "pending", expiresAt }`), `organization.list` (rôle courant, H5).
- h1 « Membres » ; compteur « N membre(s) ».
- Carte « Inviter un membre » (managers seulement) : champ « Adresse e-mail », sélecteur « Rôle », bouton « Inviter ». Rôles proposés et libellés : Administrateur (`admin`, seulement pour un propriétaire), Développeur, Designer, Client, Business. `owner` jamais proposé. Rôle par défaut : aucun (placeholder « Choisir un rôle »), pour ne pas inviter par erreur avec des droits.
- Tableau : colonne « Membre » (nom ; e-mail en texte secondaire dessous) et colonne « Rôle » (`Badge` outline : Propriétaire, Administrateur, Développeur, Designer, Client, Business). Ordre de l'API.

## 4. États
- **Chargement** (`member.list`) : `role="status"` `aria-busy`, « Chargement des membres… » et 3 lignes squelette. Le formulaire reste disponible pendant ce temps.
- **Données** : `Table` avec `TableCaption` masquée « Liste des membres ». Le vide n'existe pas (l'utilisateur est membre).
- **Erreur de liste** : `Alert` destructive, `warning`, « Impossible de charger les membres », « Une erreur est survenue. Vérifiez votre connexion puis réessayez. », bouton « Réessayer ».
- **Droits insuffisants** (rôle non gestionnaire) : à la place du formulaire, `Alert` neutre, icône `lock`, « Seuls les propriétaires et les administrateurs peuvent inviter des membres. » La liste reste visible. L'API reste l'autorité (`FORBIDDEN`).
- **Invitation en cours** : champs en lecture seule, bouton `disabled` + `aria-busy`, « Invitation… ».
- **Succès** : `Alert` neutre `role="status"`, icône `check_circle`, titre « Invitation créée », texte « <e-mail> est invité comme <rôle> jusqu'au <date longue>. L'e-mail part en arrière-plan. » Le formulaire est vidé, le focus revient sur « Adresse e-mail ». Le message disparaît à la prochaine saisie ou au prochain envoi, pas au bout d'un délai. Le texte ne dit jamais « e-mail envoyé » (G3).
- **Erreur de saisie** (schéma du contrat) : e-mail « Saisissez une adresse e-mail valide, par exemple nom@exemple.fr. » ; rôle « Choisissez un rôle. »
- **`CONFLICT already_member`** : erreur sous le champ e-mail « Cette personne fait déjà partie de l'organisation. »
- **`CONFLICT already_invited`** : « Cette personne a déjà une invitation en attente. » (message distinct de l'autre).
- **`FORBIDDEN`** (ex. un administrateur invitant un administrateur) : `Alert` destructive, `lock`, « Vous n'avez pas le droit d'inviter ce rôle. Seul un propriétaire peut inviter un administrateur. »
- **`INTERNAL`** : `Alert` destructive, « L'invitation n'a pas pu être créée », « Une erreur est survenue. Réessayez dans un instant. » La saisie est conservée.

## 5. Interactions et retours
Validation au submit ; focus sur le premier champ en erreur. Entrée dans le champ e-mail valide. Après succès, la liste n'est pas modifiée (la personne n'est pas membre avant d'accepter) : c'est pourquoi la confirmation est explicite. Aucune boîte de dialogue de confirmation (action réversible côté API par annulation future).

## 6. Responsive
Sous 768 px : carte pleine largeur, bouton « Inviter » pleine largeur, cibles 44 px, le sélecteur de rôle ouvre sa liste en pleine largeur ; tableau à deux colonnes sans défilement horizontal à 375 px (e-mail sous le nom, jamais une colonne propre). Dès 768 px : carte à largeur max 576 px alignée à gauche, tableau pleine largeur de contenu.

## 7. Accessibilité
- Repères : `nav`, `main`, h1 unique, `data-testid="members-page"`.
- Ordre de focus : trigger, navigation, champ e-mail, rôle, « Inviter », « Réessayer » ou tableau.
- Chaque champ a un `Label` visible ; erreurs liées (`aria-invalid`, `aria-describedby`) ; `Select` du kit (Radix) navigable au clavier, flèches et saisie de début de mot.
- Succès annoncé par `role="status"`, erreurs par `role="alert"`; icône + texte dans tous les cas.
- Les rôles sont du texte dans un `Badge` outline : pas de couleur porteuse de sens.
- Mouvement réduit : aucune animation propre ; squelette immobile.

## 8. Alternatives écartées
1. **Formulaire et liste sur la même page (retenu, H3)** contre page d'invitation seule : sans liste, la personne ne voit pas qui est déjà dedans et ne peut pas éviter `already_member` ; `member.list` est déjà au contrat.
2. **Formulaire en carte au-dessus de la liste (retenu)** contre bouton « Inviter » ouvrant un panneau : l'invitation est la tâche principale de la page et le formulaire tient en trois éléments ; un panneau cache la confirmation.
3. **Formulaire absent pour les rôles non gestionnaires** contre formulaire désactivé : un formulaire désactivé n'explique pas pourquoi ; l'`Alert` dit qui peut inviter.
4. **Aucun rôle présélectionné (retenu)** contre « Développeur » par défaut : un rôle par défaut fait inviter avec des droits que la personne n'a pas choisis.
5. **Confirmation « Invitation créée » persistante** contre toast : pas de toast dans `@koklo/ui`, et un toast qui disparaît est inaccessible à beaucoup d'utilisateurs ; l'`Alert` reste jusqu'à l'action suivante.
6. **Dire « E-mail envoyé »** écarté : l'envoi est asynchrone et peut échouer silencieusement (G3).

## 9. Questions ouvertes
- G3 : le lien de l'e-mail mène à une 404 tant que la page d'acceptation n'existe pas ; ticket suivant à planifier. Le texte du succès sera à ajuster à ce moment.
- Icône `group` absente de la bibliothèque (DESIGN §4) : l'entrée de navigation utilise `person` ; à ajouter si un `group` est souhaité.
- Pas de liste des invitations en attente, donc pas de moyen de voir `already_invited` avant l'erreur.
- Rôle non-gestionnaire (client, business) : la vue client pourrait ne pas voir « Membres » du tout ; non tranché par le CDC, la page est visible pour tous les rôles.

## 10. Historique
| Version | Date | Ticket | Changement et raison |
|---|---|---|---|
| 1 | 2026-10-29 | TK-24 | Création : invitation (e-mail + rôle) et liste des membres, droits par rôle. Détail : `.workflow/TK-24/02-design.md` |
