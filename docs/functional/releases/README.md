---
title: What's new
audience: functional
doc_version: 0.2.0
status: draft
last_reviewed: 2026-11-27
covers_release: unreleased
sources: []
covers_commit: 9f186946
---
# What's new

One entry per release, written for the user: the value delivered, not the
commits. Link to the guide that explains each new capability.

## Unreleased
- Cahier technique : sous **Spec**, la page **Technique** rassemble les choix d'outils comparés (à trancher d'un clic
  avec **Choisir**), les environnements et le document technique. L'agent propose le contenu, vous relisez avant que
  rien n'entre dans la spec. La spec ne garde que le nom des variables, et une valeur de secret reconnue est refusée.
  Le client lit le cahier validé et le commente. Limite : les opérations de l'API et les exigences s'enregistrent mais
  n'ont pas encore d'onglet, et l'écran n'a pas encore de bouton de validation.
  Guide : [Relire et compléter le cahier technique](../guides/review-and-complete-the-technical-specification.md).
- Organisations, membres et projets : vous pouvez maintenant créer votre organisation, choisir ou changer d'organisation
  depuis le menu latéral, inviter des membres avec un rôle (Administrateur, Développeur, Designer, Client, Business) et créer
  des projets depuis la page "Projets". Créer un projet et inviter sont réservés aux Propriétaires et aux Administrateurs.
  Une personne connectée sans organisation est désormais accueillie sur "Créer votre organisation" au lieu de revenir
  sans cesse à la page de connexion. Limites : le lien reçu dans l'e-mail d'invitation mène pour l'instant à une page
  introuvable (la page d'acceptation arrive dans un ticket suivant) et il n'y a pas encore de liste des invitations en attente.
  Guides : [Créer une organisation](../guides/create-an-organization.md), [Inviter un membre](../guides/invite-a-member.md),
  [Créer un projet](../guides/create-a-project.md).
- The login page and the application menu have a new look: the side menu can be folded to icons
  (button or Ctrl/Cmd+B) and opens as a drawer on a phone. Sign-in remains GitHub only.
  See [Sign in and move around](../guides/navigate-the-app.md).
- Visual foundations (colours in light and dark, status colours Validée / À valider / À revoir,
  Instrument Sans and JetBrains Mono fonts served by the product itself) are in place. No screen
  uses them yet, so there is nothing to do on your side.
- The interface building blocks are ready: buttons, tables, tabs, cards, side panels, menus,
  alerts, avatars and the Validée / À valider / À revoir status badge (always shown with an icon
  and a label, never by colour alone), with Material Symbols Rounded icons. They appear on screens
  as those are delivered; nothing to do on your side yet.
