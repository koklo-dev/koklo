---
id: S-settings
titre: Réglages (Général, Membres, Mon compte)
version: 1
---
## 1. Utilisateurs et objectif
Propriétaire et administrateur (gèrent), développeur, designer et business (Membres en lecture seule, Mon compte), client (Mon compte seul). Arrivée par « Réglages » de la barre. Objectif : gérer l'organisation, ses membres et leurs accès, et ses préférences personnelles. Remplace S-organizations (partie réglages) et S-members ; reprend S-ai-settings et S-github tels quels dans le même cadre (TK-98 et 13c les refondent).

## 2. Tâches et parcours
- Principale : inviter une personne avec un rôle (et des projets pour client / business). Secondaires : changer un rôle, retirer un membre, renvoyer ou annuler une invitation, renommer l'organisation, régler thème et e-mails.
- Route `/settings/[section]` : `general`, `members`, `ai`, `github`, `account`. Section interdite -> redirection vers Membres (Mon compte pour client ou rôle inconnu). `/settings` suit la même règle.
- Cadre : h1 « Réglages », pastille du rôle, résumé (« <organisation> · N projets · N membres » ; client : « Vous voyez seulement les réglages de votre compte. »), navigation de 240 px à gauche (groupes Organisation : Général, Membres avec badge du nombre, Fournisseurs d'IA, GitHub ; Vous : Mon compte), contenu à droite : h2 de section + une phrase.

## 3. Contenu
- Général (`org.get`, `org.update`) : avatar (initiales), nom, adresse (slug), « Enregistrer » ; quatre chiffres : Projets, Membres, Fournisseurs d'IA (nombre de clés, sans coût ni nom), pas de « postes d'agent ».
- Membres : « Inviter » (e-mail, rôle, projets obligatoires pour client / business, phrase : « Un client ne voit que les projets choisis ici. L'invitation expire après 7 jours ; la personne se connecte avec GitHub ou par lien magique. ») ; tableau `member.page` (membre avec avatar, rôle en pastille, projets, dernière activité, menu) ; `Pagination` numérotée sous le tableau, compteur « N membres » ; « Invitations en attente · N » (bordure pointillée : e-mail, qui / quand / expiration, rôle, Renvoyer, Annuler) ; `<details>` « Ce que chaque rôle peut faire » (9 actions x 6 rôles, coche ou tiret, `aria-label` « Client : oui »). Les agents ne sont jamais des membres.
- Mon compte (`me.get`) : nom (modifiable), e-mail (lecture seule, aide : « Cette adresse sert à vous connecter »), thème Clair / Sombre / Système, « Me prévenir par e-mail » (interrupteurs ; équipe : validation ou changement client, PR à relire, agent sans nouvelles depuis 20 min, consommation d'IA à 80 % pour le propriétaire, résumé de la semaine ; client : livrable ou écran à valider, fonctionnalité prête à essayer, réponse à un commentaire).

## 4. États
Chargement : `role="status"` et squelettes. Vide : invitations en attente « Aucune invitation en attente. » ; recherche sans résultat dans le tableau. Erreur : `Alert` destructive, titre, « Réessayer ». Droits : bandeau `lock` « Lecture seule : seuls les propriétaires et les administrateurs modifient cette section. », aucun bouton d'action ; 403 serveur affiché comme refus clair. Propres à l'écran : slug pris (« Cette adresse est déjà utilisée. »), `already_member`, `already_invited`, retrait de soi impossible (pas de menu sur sa ligne), dernier propriétaire protégé (« Une organisation garde au moins un propriétaire. »), enregistrement en cours (`aria-busy`).

## 5. Interactions et retours
Succès annoncés dans une région `role="status"` (« Invitation créée », « Rôle de <nom> : Développeur », « <nom> a été retiré »). Le retrait demande une confirmation (dialogue, bouton destructeur « Retirer »). Interrupteurs et thème s'enregistrent à l'action, avec retour immédiat et retour arrière en cas d'échec. Pas de toast.

## 6. Responsive
Sous 768 px : navigation en liens horizontaux défilants au-dessus du contenu ; tableau sans défilement horizontal (e-mail sous le nom, rôle, projets et activité empilés) ; formulaire d'invitation en colonne, boutons pleine largeur, cibles 44 px ; matrice dans un conteneur défilant au clavier (`tabindex="0"`, nom accessible).

## 7. Accessibilité
Un seul h1. Navigation `nav` « Sections des réglages », `aria-current="page"`. Focus sur le h2 au changement de section. Menu d'actions `aria-label="Actions pour <nom>"`, Échap, focus rendu. Interrupteurs `role="switch"` avec libellé visible. Pastille de rôle et statuts doublés d'un texte. Contraste AA clair et sombre, jetons seuls, mouvement réduit respecté. Axe sans violation sur chaque section x rôle.

## 8. Alternatives écartées
Onglets en liens de TK-88 (ne portent pas les groupes ni le badge, étroits à 375 px) ; défilement infini des membres (un tableau se compare : schéma 1.2, passation 07) ; liste de sélection de projets en cases à cocher pour toute organisation (la liste de projets peut être longue : `Select` multiple avec recherche).

## 9. Questions ouvertes
Visibilité d'un business limitée aux projets choisis (B98). Journal d'audit, Accès et règles, Agents locaux : lot 13c.

## 10. Historique
| Version | Date | Ticket | Changement et raison |
|---|---|---|---|
| 1 | 2026-11-07 | TK-97 | Création : cadre à navigation par rôle, Général, Membres, Mon compte. Décisions B95 à B103. Détail : `.workflow/TK-97/00-fiche.md` |
| 1.1 | 2026-11-07 | TK-98 | La section Fournisseurs d'IA est refondue dans `S-ai-settings.md` v2 (h2 « Fournisseurs d'IA », B115 levé). Captures de rattrapage de TK-97 : `captures/S-settings/<section>-<rôle>-<thème>.png` (B130) |
