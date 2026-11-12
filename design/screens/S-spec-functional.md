---
id: S-spec-functional
titre: Spec · Fonctionnel (cahier fonctionnel : Prêt, Génération, Relecture, Liste · équipe)
version: 3
---
> Remplace [S-framing](S-framing.md). L'onglet Fonctionnalités reprend le contenu détaillé de [S-features](S-features.md) (états de lecture, index, dépôt) ; cette fiche porte la page, ses états et la collection. Maquette qui fait foi : `docs/refonte/maquettes/10-Lot5Fonctionnel.html` (`pnpm maquette 10`). Passations 06 §1-4.4 et 05 §1.

## 1. Utilisateurs et objectif
Équipe qui écrit la spec (owner, admin, développeur, designer) : proposer le cahier fonctionnel avec l'agent, le relire, l'enregistrer, puis le tenir à jour. Client : valide le cahier (vue client, TK-104). Business : lit la vue client sans valider. Owner et admin d'un projet sans client invité : valident à sa place (D1, `?vue=client`). `spec.*` reste fermé au client et au business (B294) : la vue client lit `clientSpace.*`.

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
| 3 | 2026-11-12 | TK-104 | Vue client et validation du cahier (section 11), « Relancer » ; accès client et business redéfinis (B347 à B353, DESIGN.md §5.17). |
| 4 | 2026-11-13 | TK-105 | Volume réel (248 / 86 / 47 / 18) : recherche serveur dans la vue client (règles, parcours, fonctionnalités), zone d'une fonctionnalité proposée par l'agent et modifiable (champ « Zone » du formulaire), relecture groupée vérifiée sur `seed:planche` ; états clés et critères dans `.workflow/TK-105/00-fiche.md` §6 (B363 à B368). |

## 11. Vue client et validation (TK-104, maquette 10 l.171-224, 296-330, DESIGN.md §5.17)
- **Contenu** : bandeau ambre `ValidationBanner` (progression « Fonctionnalités 12/248 · parcours 3/18 · règles et rôles 1/2 ») ; en-tête « Validation attendue de votre part » avec « Valider le cahier » (inactif, pointillé, tant que tout n'est pas traité ; raison « Traitez chaque onglet pour finir ») ou « Envoyer mes demandes » (s'il existe une demande) ; fonctionnalités une par une (liste + fiche client à droite), parcours un par un (`FlowCard` + `ValidationPrompt` inline), règles et rôles en bloc (`ValidationPrompt` barre en pied). Équipe (owner, admin) : « Relancer <prénom> » dans l'en-tête de la liste équipe.
- **États** : chargement (squelettes), vide (« Rien à valider pour l'instant »), erreur (`ErrorNotice` + « Réessayer »), droits (business : aucune action, bandeau neutre « Vous consultez le cahier, la validation revient au client » ; développeur et designer : vue équipe), décidé (confirmation `role=status` + « Annuler » pour parcours et blocs), bandeau « N éléments ont changé depuis votre validation » (`InlineAlert` `warning`, N > 0), « Valider le cahier » refusé (`ErrorNotice` : « Il reste des éléments à traiter »).
- **Clavier et annonces** : onglets en `nav`, `aria-current` ; ligne de liste = une entrée de tabulation, flèches ; Valider/Demander gardent le focus logique : après décision le focus passe au titre de la fiche suivante non traitée ; une seule région `role=status` annonce « Validée. Suivante : F-004 » ; formulaire « Que faut-il changer ? » : Échap annule et rend le focus au bouton ; raccourcis J/K seulement hors champ de saisie.
- **375 px** : fiche plein écran (« Fermer la fiche »), boutons 44 px, barre de bloc empilée, bandeau sur deux lignes, onglets défilants.
- **États clés à comparer** : (1) fonctionnalités, fiche ouverte, avant décision, clair ; (2) idem sombre ; (3) idem 375 px ; (4) parcours après décision (confirmation verte puis rouge) ; (5) règles en bloc avec barre de validation ; (6) état vide ou erreur « Valider le cahier » refusé.
- **Réalisé (lot B, 2026-11-12)** : `ClientValidationPage` (`features-page` aiguille : client et business, ou `?vue=client` pour owner et admin ; dev et designer gardent la vue équipe), onglets `client-features-tab` (+ fiche `client-feature-sheet`), `client-flows-tab`, `client-block-tab` (règles, rôles), `client-validation-header` (« Valider le cahier » / « Envoyer mes demandes »), « Relancer <prénom> » ou « Valider à la place du client » dans l'en-tête équipe (B358). Composants ajoutés à `packages/ui` : `ValidationBanner`, `ValidationPrompt`, `ReviewComment`, `InlineAlert` variante `revise` ; galerie `/dev/ui` section 20. Captures : `captures/S-spec-functional/client-<état>-<thème>[-mobile].png` (features, flows, rules, roles, empty, business). Écarts : recherche sur les lignes chargées (B359) ; pas d'indicateur de validation par onglet (maquette 10 l.677, non repris : le compteur seul).
