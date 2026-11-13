---
id: S-spec-data
titre: Spec · Données (modèle de données : Prêt, Génération, Relecture, Liste · équipe)
version: 2
---
> Maquette qui fait foi : `docs/refonte/maquettes/11-Lot6Donnees.html` (`pnpm maquette 11`), passations 09 §1 à §3.4 et §5, 08 §2.2, 11 §3. Même socle que [S-spec-functional](S-spec-functional.md) (`ProposalReview`, `SpecCollection`, `SpecItemSheet`, listes longues). TK-107 livre le format, les états et les onglets Tables et Jeux d'exemple ; le diagramme interactif et la fiche (TK-108), la validation et la vue client (TK-109) viennent après.

## 1. Utilisateurs et objectif
Équipe (owner, admin, développeur : écrit ; designer : lit). Objectif : faire proposer le modèle par l'agent depuis le cahier fonctionnel, le relire, l'enregistrer (un fichier YAML par table dans le dépôt de spec), puis le tenir à jour. Client et business : 403 aux lectures, la page leur dit qu'elle est réservée à l'équipe (B389).

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
Aucune bloquante (B383 à B392).

## 10. Historique
| Version | Date | Ticket | Changement et raison |
|---|---|---|---|
| 2 | 2026-11-13 | TK-107 (lot C) | Réalisation : onglet Relecture caché pendant la génération et bandeau sur les trois autres onglets (B404) ; diagramme lu de `data/model.mmd` (B403) ; carte rejetée estompée par les jetons, pas par l'opacité (B405) ; formulaire Table à lignes de champs `nom · type · contrainte` et zone en saisie libre avec suggestions (B402) ; enregistrement des relations et cascade du rejet (B406). |
| 1 | 2026-11-13 | TK-107 | Création : page Spec · Données (Prêt, Génération, Relecture, Liste · équipe), onglets Tables et Jeux d'exemple, Diagramme minimal, formulaire Table ; `ErTableCard` ajouté à `packages/ui` (DESIGN.md §5.18). |
