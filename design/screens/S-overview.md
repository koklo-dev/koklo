---
id: S-overview
titre: Vue d'ensemble du projet
version: 2
---
## 1. Utilisateurs et objectif
Page d'accueil d'un projet, route `/projects/[projectId]` (remplace la redirection provisoire du lot 1). Équipe (propriétaire, administrateur, développeur, designer) : tout. Client et business : même page, libellés tournés vers eux, sans « Inviter », sans SHA ni vocabulaire git (`audience` `client`). Elle répond à trois questions : où en est-on (fil de phase), que faire maintenant (prochaine étape), qu'est-ce qui a bougé (indicateurs, bloc principal, activité). Arrivée depuis la barre (« Vue d'ensemble », active) ou la liste des projets.
## 2. Tâches et parcours
Principale : lire la prochaine étape et l'ouvrir. Secondaires : ouvrir l'action principale de la phase (en-tête), ouvrir un livrable ou une page, inviter (équipe), relancer le client (lien copié), parcourir toute l'activité. Sorties : espace Idée, Spec · Fonctionnel, tickets, Réglages (IA, membres), `/projects/[id]/activity`.
## 3. Contenu
Un seul appel `project.overview` : projet (nom, début, contact client), phase et `phaseSteps` (sous-titres serveur), `nextAction`, `stats` (déjà filtrées par rôle et disponibilité), `main` (`idea` 5 pages, `deliverables` 7 cartes, `sprint` 5 tickets), `activity` (5), `people` (5), `primaryAction`, `canInvite`. Aucune phrase assemblée par l'écran ; seules les dates relatives sont mises en forme à l'écran. Activité complète : `project.activity` (pages de 50).
## 4. États
Chargement : squelettes (fil, prochaine étape, indicateurs, listes), `aria-busy`. Projet neuf : phase Idée, « Commencez le dossier d'idée », indicateurs masqués, `EmptyState` du bloc principal, activité « Le projet vient d'être créé. ». Idée, Cadrage (grille des 7 livrables, cartes « Bientôt disponible » non cliquables), Itérations (carte Sprint seule ; sans sprint `EmptyState` « Aucun sprint en cours »). « Rien n'attend d'action. » : carte neutre. Erreur : `InlineAlert` erreur « Impossible de charger la vue d'ensemble. » + « Réessayer », en-tête et barre utilisables. Projet introuvable, 401, droits : comme S-features (404 uniforme). Vue client : prochaine étape et indicateurs reformulés.
## 5. Interactions et retours
Toute la carte d'un livrable livré est un lien ; une carte non livrée n'est pas interactive. « Relancer <prénom> » copie un lien absolu et annonce « Lien copié » (`role=status`). Rafraîchissement à l'ouverture et au retour sur l'onglet (`visibilitychange`), jamais de sondage ; l'ancienne vue reste affichée pendant le rechargement. Chaque étape terminée ou en cours du fil de phase est un lien vers son espace (Idée → dossier d'idée, Cadrage → cadrage, Itérations → tickets), équipe seulement ; les étapes à venir, Baseline 0 (sans page avant TK-100) et toute la vue client restent du texte. Aucune confirmation ni saisie.
## 6. Responsive
1024 à 1279 px : colonne de droite sous le bloc principal, Activité et Personnes côte à côte. Sous 1024 px : fil en 2 × 2 sans traits de liaison, indicateurs en 2 colonnes. Sous 768 px : fil vertical, bouton de la prochaine étape pleine largeur sous le texte, indicateurs et livrables en 1 colonne, boutons de 44 px. 375 px sans défilement horizontal.
## 7. Accessibilité
h1 « Vue d'ensemble » unique, h2 par section ; fil = `ol` dans une `section` « Phases du projet », étape en cours `aria-current="step"`, étape navigable = lien nommé par « Libellé état » (« Cadrage en cours ») ; prochaine étape `section` nommée, `role="note"` ; jauges `aria-hidden` avec la valeur écrite à côté ; carte de livrable = un seul lien, nom accessible = le texte visible de la carte, sans `aria-label` (WCAG 2.5.3, axe `label-content-name-mismatch` : un `aria-label` différent du texte est refusé) : « Cahier fonctionnel À valider 7 fonctionnalités 4 fonctionnalités validées sur 7 Validation client · obligatoire » ; avatars décoratifs, nom dans le texte ; statuts icône + libellé ; `motion-safe:` sur les squelettes ; focus visible partout ; ordre de tabulation = ordre visuel (en-tête, prochaine étape, indicateurs sans arrêt, bloc principal, activité, personnes).
## 8. Alternatives écartées
(1) Plusieurs actions dans la prochaine étape : une seule (03 §15). (2) Lien sur les cartes « Bientôt » vers la page « Bientôt » : lien mort, refusé (B273). (3) Sélecteur de phase de la planche : outil de maquette, pas dans le produit ; le clic sur une étape ouvre donc son espace au lieu de changer le contenu de la page.
## 9. Questions ouvertes
B272 à B283 dans `docs/refonte/questions.md` (décidées en autonomie).
## 10. Historique
| Version | Date | Ticket | Changement et raison |
|---|---|---|---|
| 1 | 2026-11-09 | TK-92 | Création d'après la passation 03, la décision 05 §2 « Lot 3 », 07 §2, 21 §0 et la planche 07 (`07-Lot3Overview.html`) : remplace la redirection provisoire du lot 1. |
| 2 | 2026-11-09 | navigation du fil de phase | Les étapes terminées ou en cours deviennent des liens vers leur espace (équipe), sans changement de contrat ; demandé par l'utilisateur après TK-92. |
