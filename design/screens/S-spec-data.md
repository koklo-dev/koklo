---
id: S-spec-data
titre: Spec · Données (modèle de données : Prêt, Génération, Relecture, Liste · équipe)
version: 4
---
> Maquette qui fait foi : `docs/refonte/maquettes/11-Lot6Donnees.html` (`pnpm maquette 11`), passations 09 §1 à §3.4 et §5, 08 §2.2, 11 §3. Même socle que [S-spec-functional](S-spec-functional.md) (`ProposalReview`, `SpecCollection`, `SpecItemSheet`, listes longues). TK-107 livre le format, les états et les onglets Tables et Jeux d'exemple ; le diagramme interactif et la fiche (TK-108), la validation et la vue client (TK-109) viennent après.

## 1. Utilisateurs et objectif
Équipe (owner, admin, développeur : écrit ; designer : lit). Objectif : faire proposer le modèle par l'agent depuis le cahier fonctionnel, le relire, l'enregistrer (un fichier YAML par table dans le dépôt de spec), puis le tenir à jour. Client et business : vue client en lecture seule (TK-109, B455), les lectures `spec.data.*` leur restent refusées (B389).

## 2. Tâches et parcours
Prêt → « Proposer le modèle de données » → Génération → Relecture (onglet Relecture d'abord) → « Enregistrer N dans la spec » (un lot, `model.mmd` régénéré dans le même commit) → Liste · équipe. À la main : « Ajouter une table » ouvre `SpecItemSheet` (formulaire Table, passation 11 §3). Entrée : route `/projects/[id]/spec/data?tab=diagram|tables|fixtures` (+ `view=review`, `?sel=T-slug`, `?q=`, `?zone=`).

## 3. Contenu
En-tête « Modèle de données » (statut, résumé « 6 tables · 6 relations · 2 jeux d'exemple » depuis `spec.head.counts`) ; onglets Diagramme, Tables, Jeux d'exemple (compteurs, « N à relire » devant en relecture) ; Tables : `spec.data.tables.list` (Table, Zone, Champs, Relations, Utilisée par, Données personnelles) ; Jeux : `spec.data.fixtures.list` + `rows` (25 lignes par page, pagination numérotée) ; Mermaid : `spec.data.mermaid` (disponible au contrat, affiché par TK-108).

## 4. États
- **Prêt** : `EmptyState` `database` (texte exact M:94-96, compteurs réels du Fonctionnel : N fonctionnalités, N règles, N rôles, N parcours), « Proposer le modèle de données » + « Ajouter une table ».
- **Génération** : bandeau `role=status` (M:106) « Annuler l'attente » ; six cadres squelette `motion-safe:` ; en-tête « Ajouter une table » + « Proposer avec l'agent » désactivé.
- **Relecture** : bandeau (M:113-122), onglet Relecture ouvert, liste 320 px, détail à tableau ; Diagramme, Tables, Jeux montrent le modèle proposé (enregistré + propositions) : table à relire en pointillés, rejetée à 40 %, légende de M:753.
- **Liste · équipe** : deux onglets de données, recherche et filtre de zone sur toute la base, lien direct `?sel=` hors première page, pied de liste (suite, chargement, erreur, fin), recherche vide « Aucune table ne correspond à « x » ».
- **Chargement / erreur** : squelettes ; `ErrorNotice` + « Réessayer », les lignes chargées restent. **Droits** : designer sans boutons d'écriture ; client et business : `EmptyState` `lock` « Cette page est réservée à l'équipe ».
- Hors périmètre, sans bouton mort : zoom, fiche Fiche / YAML / Mermaid, glisser, « Valider le modèle », « Commenter », vue des zones (TK-108, TK-109).

## 5. Interactions et retours
« Enregistrer » (formulaire) = `specBatch.submit` d'une opération, toast « T-reservation enregistrée dans la spec · commit e4c90a1 », ligne sélectionnée. Rejeter une table : le récapitulatif liste les relations et champs `ref` retirés avec elle. Erreurs serveur (`SPEC_INVALID`, référence inconnue) en `InlineAlert` en tête du formulaire, focus sur le premier champ.

## 6. Responsive
375 px : onglets défilants, tableau des tables en défilement horizontal (région focusable nommée), cartes de table en une colonne, jeux : tableau défilant + pagination 44 px, feuille plein écran, relecture empilée.

## 7. Accessibilité
Onglets en `nav` (`aria-current`) ; une seule région `role=status` par page (compte « 50 tables chargées sur 80 », filtres, enregistrement) ; tableaux avec `caption` ou `aria-label`, `th scope` ; carte de table = `li` nommé « Table Réservation, 6 champs », icônes décoratives `aria-hidden`, statut doublé d'une pastille texte (« À relire », « Rejetée ») ; pastille « Oui · NFR-001 » texte + teinte ; `/` met le focus sur la recherche ; Échap ferme la feuille et rend le focus.

## 8. Alternatives écartées
1) Lecteur SVG complet dès TK-107 : écarté, c'est TK-108 (décision du 13/11/2026). 2) Relations déclarées des deux côtés dans les YAML (maquette M:515-519) : écarté, incohérences possibles ; déclarée une fois, comptée des deux côtés (B384).

## 9. Questions ouvertes
Aucune bloquante (B383 à B392, B444 à B455).

## 10. Diagramme (TK-108)
Pleine hauteur sous les onglets (marge 24), aide « Cliquez une table pour voir sa fiche. » + légende ; lecteur à trame de points, cartes 230 px, relations avec cardinalité, sélection en `--primary`, barre `role="toolbar"` de zoom (paliers 50 à 200, `Ctrl/⌘ + − 0`, molette, « Ajuster », mémorisé en stockage local). Fiche à droite : Fiche (description, champs, relations, « Utilisée par »), YAML (`data/tables/<slug>.yaml`, « Source de vérité »), Mermaid (`data/model.mmd`, « Généré », « Copier »), `pre` en texte brut ; YAML et Mermaid pour l'équipe seulement. Relecture : pointillés « À relire », rejetée estompée par jetons. Sous 1024 px onglet Tables par défaut, sous 768 px commandes 44 px et pas de glisser. Alternative textuelle : onglet Tables et fiche ; chaque carte est un `button` `aria-pressed`. Hors périmètre : zones et mini-carte (TK-110).

Réalisation (lot C) : aucune table choisie à l'ouverture ; au premier clic la fiche s'ancre (`aside` 340 à 400 px dès 1280 px, feuille à droite en dessous, focus rendu à la carte par Échap). Glisser réservé à qui écrit les Données (owner, admin, dev), dépôt de toute la mise en page 600 ms après le dernier geste, toast d'erreur « Mise en page non enregistrée » en cas d'échec (la carte garde sa place). Aide sous le lecteur : « Cliquez une table… », celle de la relecture, ou « Zoom sous 60 % : seuls les noms des tables s'affichent. Zoomez pour voir les champs. ». Chargement : cadre squelette `role=status` ; erreur : `ErrorNotice` « Réessayer » ; vide : `EmptyState` `schema`. Captures : `design/screens/captures/S-spec-data/list-diagram{,-fiche,-yaml,-mermaid,-zoom-50,-zoom-200}-{light,dark}[-mobile].png` (yaml, mermaid et zooms au bureau seulement), `review-diagram-*` pour la relecture (pointillés, rejetée).

## 11. Validation, vue client, impact amont (TK-109)
**Équipe.** « Valider le modèle » (owner, admin, développeur ; absent pour le designer) : `Button` primaire `verified`, première action de l'en-tête quand le livrable est « À valider » ; l'agent redevient outline. Validé : `DeliverableStatus` vert « Validé par <prénom> le 5 nov. · version 3c7e1a9 » (maquette 11 l.595), plus de bouton de validation. « À revoir » : statut « À revoir » et `InlineAlert warning` sous l'en-tête « Le cahier fonctionnel a changé : F-002, R-004 modifiées » + « Proposer les mises à jour » (modale de l'agent préremplie). Enregistrer une table d'un modèle validé affiche l'avertissement existant « Ce livrable est validé… ». La fiche liste les « Commentaires du client » (auteur, date, texte, 20 par page).
**Client et business** (`clientSpace.data*`) : bandeau `InlineAlert` neutre `role="note"` « Lecture seule. » (l.160-167), en-tête « Validé par l'équipe · N tables · lecture seule » + « Commenter » (client seulement), onglets Diagramme, Tables, Jeux d'exemple sans glisser, sans « Modifier », sans YAML ni Mermaid ; fiche : description, « Ce qu'on enregistre » (`clientSummary`), Relations, « Utilisée par », « Commenter » (dialogue : `textarea` 2000 caractères, « Envoyer », focus rendu au bouton, annonce « Commentaire envoyé » dans la région `status`). Modèle non validé : `EmptyState` `schedule` « Le modèle de données est en cours de validation par l'équipe » ; aucune table n'est chargée. Erreur : `ErrorNotice` + « Réessayer ».
**Annonces et clavier.** Statut de validation et envoi de commentaire dans l'unique `role="status"` de la page ; Échap ferme le dialogue ; 375 px : actions de l'en-tête pleine largeur 44 px, onglet Tables par défaut sous 1024 px, fiche en feuille.

## 12. Historique
| Version | Date | Ticket | Changement et raison |
|---|---|---|---|
| 4 | 2026-11-13 | TK-109 | « Valider le modèle », statut « Validé par l'équipe », état « À revoir » (impact amont), vue client (Lecture seule, « Ce qu'on enregistre », « Commenter »), commentaires visibles de l'équipe dans la fiche (B444 à B455). |
| 3 | 2026-11-13 | TK-108 | Diagramme interactif `DiagramViewer` (dagre, relations, sélection, zoom 50 à 200 %, glisser et Alt + flèches vers `_layout.yaml`, noms seuls sous 60 %), fiche ancrée Fiche / YAML / Mermaid (équipe), onglet Tables par défaut sous 1024 px, fiche en panneau sous 1280 px (B417 à B428). |
| 2 | 2026-11-13 | TK-107 (lot C) | Réalisation : onglet Relecture caché pendant la génération et bandeau sur les trois autres onglets (B404) ; diagramme lu de `data/model.mmd` (B403) ; carte rejetée estompée par les jetons, pas par l'opacité (B405) ; formulaire Table à lignes de champs `nom · type · contrainte` et zone en saisie libre avec suggestions (B402) ; enregistrement des relations et cascade du rejet (B406). |
| 1 | 2026-11-13 | TK-107 | Création : page Spec · Données (Prêt, Génération, Relecture, Liste · équipe), onglets Tables et Jeux d'exemple, Diagramme minimal, formulaire Table ; `ErTableCard` ajouté à `packages/ui` (DESIGN.md §5.18). |
