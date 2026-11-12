---
id: S-spec-functional
titre: Spec · Fonctionnel (cahier fonctionnel : Prêt, Génération, Relecture, Liste · équipe)
version: 2
---
> Remplace [S-framing](S-framing.md). L'onglet Fonctionnalités reprend le contenu détaillé de [S-features](S-features.md) (états de lecture, index, dépôt) ; cette fiche porte la page, ses états et la collection. Maquette qui fait foi : `docs/refonte/maquettes/10-Lot5Fonctionnel.html` (`pnpm maquette 10`). Passations 06 §1-4.4 et 05 §1.

## 1. Utilisateurs et objectif
Équipe qui écrit la spec (owner, admin, développeur, designer) : proposer le cahier fonctionnel avec l'agent, le relire, l'enregistrer, puis le tenir à jour. Client et business : aucun accès (`spec.*` fermé, B294) ; leur vue de validation est un ticket ultérieur.

## 2. Tâches et parcours
Prêt → « Proposer le fonctionnel » → Génération → Relecture (accepter, rejeter, modifier, demander à l'agent) → « Enregistrer N dans la spec » (un seul lot) → Liste · équipe. À la main : « Ajouter à la main » / « Nouvelle fonctionnalité » ouvre `SpecItemSheet` (S-spec-item-sheet).

## 3. Contenu
- En-tête (`ProjectHeader`) : « <projet> / Spec / Fonctionnel », h1 « Cahier fonctionnel », pastille de statut, résumé 13 px, actions selon l'état : Prêt aucune ; Génération « Ajouter » + « Proposer avec l'agent » désactivé ; Relecture « Ajouter » + « Reproposer » ; Liste « Relancer <prénom> » (owner, admin) + « Proposer avec l'agent » + action principale « Nouvelle fonctionnalité ». Quatre onglets `?tab=` (compteur en pastille ; « N à relire » sur `--primary` en relecture ; « … » en génération).
- Liste (onglet Fonctionnalités) : `SpecCollection`, recherche (titre ou `F-nnn`), puces Validation, Priorité, Avancement, `CountBar`, lignes de 52 px (`IdTag`, titre + « N critères », `PriorityIndicator` avec libellé, `ValidationStatus`), pied `ListFooter` (suite, chargement, erreur, fin).
- Fiche ancrée à droite (380 à 440 px) : identifiant, validation, « Modifier », titre, avancement, description, critères, liens, pied « Enregistrée dans la spec · <chemin> » (la provenance « acceptée par … » n'est pas stockée : rien d'inventé).
- Statut de la barre : Fonctionnel porte « N à relire » (`--primary`) pendant une relecture, sinon son statut (Prêt, En cours, À valider, Validé).

- Onglets Règles métier, Rôles et permissions, Parcours (TK-103, DESIGN.md §5.16, maquette 10 l.225-318) : même en-tête (résumé « N fonctionnalités · N règles · N rôles · N parcours », compteurs d'onglet, bouton principal « Nouvelle règle » / « Nouveau rôle » / « Nouveau parcours », « Proposer avec l'agent »). Règles : phrase d'aide, légende des types en filtre `?type=`, `CountBar` + recherche, grille de `RuleCard` (pages de 24, « Charger la suite »). Rôles : `RoleCard` puis `PermissionMatrix` (groupée au-delà de 20 actions, filtre d'actions). Parcours : `FlowCard` (pages de 6) avec `FlowSteps` en `ol` et `FlowError`. Icône `edit` sur chaque carte (équipe qui écrit) ; `?sel=R-nnn` met la carte en évidence. Relecture : liste filtrée par onglet, détail par type (règle : type, énoncé, exemple ; rôle : permissions ; parcours : acteur, étapes).

## 4. États
Prêt (`EmptyState`), Génération (bandeau `role=status` + squelettes), Relecture (`ProposalReview`), Liste, vide filtré, chargement, erreur de liste, index en échec, sans dépôt, droits (pas de bouton ; 403 serveur). États clés à comparer : Liste Démo, Liste Volume réel, Relecture, Génération, Prêt, recherche vide ; chacun en clair, sombre et 375 px.
Onglets Règles, Rôles, Parcours : chargement (4 squelettes de cartes, `aria-busy`), vide d'onglet (`EmptyState` « Aucune règle métier pour l'instant » avec « Nouvelle règle » ou « Proposer avec l'agent » selon les droits), recherche vide (« Aucune règle ne correspond à « … » », « Effacer la recherche »), erreur de liste (`ErrorNotice` + « Réessayer », cartes chargées conservées), fin de liste, droits (client et business : aucun bouton ni accès ; designer : « Nouveau parcours » seulement, ni règle ni rôle).

## 5. Interactions et retours
Quitter la page pendant la génération ne l'arrête pas ; au retour la page s'ouvre en relecture (`?view=review`). `/` focalise la recherche. J / K / A / R uniquement en relecture et hors champ de saisie. « Annuler l'attente » quitte la vue sans toucher au lancement. Aucune validation humaine ne bloque ; rien n'entre dans la spec sans clic.

## 6. Responsive
< 1280 px : fiche en panneau superposé à droite. < 1024 px : liste puis fiche plein écran (« ← Liste »), bandeaux collants. < 768 px : boutons 44 px, onglets défilants, priorité et validation sous le titre.

## 7. Accessibilité
Onglets : `nav` nommée, `aria-current`. Liste : `aria-setsize` / `aria-posinset` du serveur, une entrée de tabulation, flèches entre lignes. Une seule région `role=status` (la barre de compte ; sous un formulaire modal, celle du panneau). Focus rendu à la ligne à la fermeture de la fiche. Texte brut absolu pour toute valeur issue du modèle. Contrastes AA clair et sombre ; axe sans violation sur chaque état.

## 8. Alternatives écartées
Garder l'Assistant de cadrage (décision 05 §1.1). Fiche modale `Sheet` à toutes les largeurs (la maquette ancre la fiche). Nommer le fournisseur d'IA dans la note de confidentialité (B319 b).

## 9. Questions ouvertes
Aucune bloquante. Vue client et validation (passation 06 §4.5) : ticket suivant. Vue client des trois onglets (validation en bloc, un par un) : TK-104.

## 10. Historique
| Version | Date | Ticket | Changement et raison |
|---|---|---|---|
| 1 | 2026-11-12 | TK-102 | Création : page Spec · Fonctionnel (états Prêt, Génération, Relecture, Liste · équipe), `SpecCollection` à fiche ancrée, validation par ligne, retrait de l'Assistant de cadrage et du brief (B333, B334). |
| 1.1 | 2026-11-12 | TK-102 lot B | Réalisé : en-tête par état (`headerStateOf`), `SpecCollection`, filtres en pastilles, pastilles de la barre, galerie section 18 ; écarts consignés en B336 (pas de « Relancer », « Fermer la fiche » visible sous 1024 px, priorité hors fiche). |
| 2 | 2026-11-12 | TK-103 | Onglets Règles métier, Rôles et permissions, Parcours livrés (B338 à B344) : cartes, matrice, étapes, relecture des 4 types, formulaires `SpecItemSheet` ; remplace les onglets « Bientôt ». |
