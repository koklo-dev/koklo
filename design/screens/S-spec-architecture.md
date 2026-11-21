---
id: S-spec-architecture
titre: Spec · Architecture (Prêt, Génération, Relecture, Liste · équipe ; onglets Document et Composants)
version: 6
---
> Maquette qui fait foi : `docs/refonte/maquettes/13-Lot7Architecture.html` (`pnpm maquette 13`), passations 10 §1 à §4.3 et §6 à §8, 12 §8.1, 11 §3, 14 §3. Même socle que [S-spec-data](S-spec-data.md) et [S-spec-functional](S-spec-functional.md). Schéma et Flux : TK-112 (§11). Décisions : TK-113.

## 1. Utilisateurs et objectif
Équipe : owner, admin, développeur écrivent ; designer lit. Client et business n'ont pas d'accès à ce ticket (403 ; la vue client vient avec la validation). Objectif : faire proposer par l'agent les composants, flux, décisions et sections du document depuis le fonctionnel et les données validés, relire, enregistrer en un lot (un commit, `schema.mmd` et `flows/*.mmd` régénérés).

## 2. Tâches et parcours
Prêt → « Proposer l'architecture » (ou « Écrire à la main ») → Génération → Relecture (onglet Relecture devant, groupée par type dès 30) → « Enregistrer N dans la spec » → Liste · équipe. Onglets visibles : Relecture (en relecture), Document, Composants. Composants : « Nouveau composant » et « Modifier » ouvrent `SpecItemSheet`. Un onglet absent n'est pas un bouton mort : Schéma, Décisions et Flux arrivent avec TK-112 et TK-113.

## 3. Contenu
En-tête : fil « Projet / Spec / Architecture », h1, statut (`DeliverableStatus`), résumé en ligne entière, actions. Document : `spec.architecture.document` (sections lues en Git). Composants : `spec.architecture.components.list` (pages de 50, recherche serveur). Avertissements d'architecture : `spec.architecture.checks`, affichés en relecture, jamais bloquants.

## 4. États
Prêt (`EmptyState` `account_tree`), Génération (bandeau `role="status"`, squelette), Relecture (bandeau + barre, groupes par type), Liste · équipe, chargement (squelettes), erreur (`InlineAlert` + Réessayer), droits (designer sans écriture), Document : section À rédiger, proposée, Validée, Brouillon, À relire ; Composants : vide, recherche sans résultat, fin de liste.

## 5. Interactions et retours
Composants : ligne = bouton qui ouvre la fiche en `SpecItemSheet` (en attendant le Schéma) ; recherche anti-rebond 200 ms ; lien direct `?c=C-…`. Document : « Ajouter la section » / « Ignorer » (section proposée), « Marquer comme validée » ; pas de glisser ni d'éditeur en place pour l'instant (B533), l'ordre est celui du numéro du fichier. Enregistrement : toast « Composant enregistré ».

## 6. Responsive
Sous 1024 px la colonne Sections passe au-dessus du texte ; la colonne Agent (340 px) ne s'affiche qu'à partir de 1280 px de fenêtre, la barre latérale prenant déjà 256 px ; sous 768 px commandes 44 px, tableau en défilement interne.

## 7. Accessibilité
Onglets en `nav` avec `aria-current` ; tableau `th scope` ; statuts toujours écrits en plus de l'icône (Validée, À relire, Brouillon, À rédiger ; Externe en pointillé et écrit) ; annonces `aria-live` (propositions, enregistrement) ; Échap et retour du focus sur la feuille ; texte brut pour toute sortie du modèle ; axe sans violation en clair et en sombre.

## 8. Alternatives écartées
- Montrer tous les onglets dès TK-111 avec « Bientôt » : écarté, boutons morts (règle TK-89). Retenu : seuls les onglets livrés.
- Ligne de composant qui ouvre le Schéma (maquette) : impossible sans Schéma. Retenu : fiche en feuille jusqu'à TK-112, puis le clic ouvrira le Schéma (B509).

## 9. Questions ouvertes
Aucune bloquante (B506 à B515 décidées en autonomie).

## 10. Historique
| Version | Date | Ticket | Changement et raison |
|---|---|---|---|
| 1 | 2026-11-21 | TK-111 | Création : page Spec · Architecture, états Prêt, Génération, Relecture, onglets Document et Composants ; `DocSectionStatus` ajouté à `packages/ui` (DESIGN.md §5.22). |
| 2 | 2026-11-21 | TK-111 | Lot C : colonne Agent sans conversation, pas de glisser ni d'éditeur de section, client et business renvoyés à la vue d'ensemble (B532 à B539). |
| 3 | 2026-11-21 | TK-112 | Schéma en couches et Flux en séquence (§11) ; `SequenceDiagram`, `ArchNodeCard`, props `bands` et `ghostIds` du `DiagramViewer` ajoutés à `packages/ui` (DESIGN.md §5.23) ; onglet par défaut Schéma ≥ 1024 px (B541 à B550). |
| 4 | 2026-11-21 | TK-113 | Décisions, « Valider l'architecture », « À revoir » (impact amont des lots 5 et 6), vue client en lecture seule avec commentaires (§12) ; `DecisionStatus` et prop `stale` de `ArchNodeCard` ajoutés à `packages/ui` (DESIGN.md §5.24) ; ligne Composants vers Schéma (B585) (B575 à B592). |
| 5 | 2026-11-21 | TK-114 | En-tête vérifié contre la maquette 13 l.58-88 : résumé en ligne entière, actions à droite, libellés courts ; aucun changement de code (passation 12 §8.4). |
| 6 | 2026-11-21 | TK-114b | Bilan du lancement (§13), sans maquette : ligne de détail de la Génération (prop `detail` de `ProposalGenerationBanner` ajoutée à `packages/ui`, DESIGN.md §5.25) et `InlineAlert` « Bilan du lancement » en Relecture ; propositions de mise à jour d'un composant indexé (B613 à B622). |

## 11. Schéma et Flux (TK-112, maquette 13 l.175-239, 405-441, 576-752, 814-852)
- **Schéma** : lecteur du lot 6 ; au-delà de 25 composants, vue des zones (carte : nom, « N composants · N acteurs · cliquez pour ouvrir », 5 noms + « +N », liens « N liens ») ; zone ouverte en 4 couches (Utilisateurs, Applications, Services, Données et services externes), formes par type, type toujours écrit, liens étiquetés, asynchrone en pointillés, composant d'une autre zone estompé qui ouvre sa zone. Fiche : Fiche · YAML · Mermaid (équipe seulement). Glisser (owner, admin, développeur) : `spec.architecture.layout.save`, sans relecture, désactivé sous 768 px. « Aller à un composant… » (`/`) cherche sur toute la spec.
- **Flux** : liste (pages de 50, « N flux · un par parcours »), diagramme de séquence (appels pleins, retours pointillés, bloc `alt`, séparateur), sélecteur Diagramme · YAML · Mermaid (équipe), puces de liens ; « Nouveau flux » et « Modifier » ouvrent `SpecItemSheet`.
- **États** : chargement (squelette de la hauteur du cadre), vide (« Aucun composant à afficher », « Aucun flux »), erreur (`InlineAlert` + Réessayer), droits (designer sans glisser ni Modifier ; client et business renvoyés à la vue d'ensemble).
- **Accessibilité** : nœud = `button` `aria-pressed` (« Service API »), Alt + flèches déplace avec annonce, `/` focalise la recherche, SVG `aria-hidden` ; séquence `role="img"` « Diagramme de séquence X, N messages » + `details` « Lire les messages » (liste numérotée) ; défilement horizontal focusable.
- **375 px** : Composants remplace le Schéma (< 1024 px), Flux liste puis détail « ← Liste », séquence défilante, commandes 44 px.
- **États comparés à la maquette** (clair, sombre, 375 px) : vue des zones ; zone ouverte avec fiche ; zoom 50 % ; Flux diagramme ; Flux YAML ou Mermaid ; Schéma vide ou en erreur.

## 12. Décisions, validation, À revoir et vue client (TK-113, maquette 13 l.120-137, 225-229, 375-401, 589-601, 802-810, 860-866)
- **Utilisateurs** : équipe (owner, admin, développeur écrivent ; designer lit) ; client (lit et commente) ; business (lit). Le client et le business ne lisent que le modèle validé, par `clientSpace.*`.
- **Décisions** : liste (recherche anti-rebond 200 ms, filtres Statut / Composant / Date côté serveur, barre de compte `role="status"`, pages de 50 « Afficher 50 de plus ») et fiche ; lien direct `?tab=decisions&d=ADR-nnn` ; « Nouvelle décision » et « Modifier » ouvrent `SpecItemSheet` (formulaire Décision) ; « Remplacée par ADR-… le … » en encadré.
- **Valider l'architecture** : `review.submit` sur le livrable ; échec lisible sous l'en-tête ; annonce « Architecture validée » dans la région d'état ; Technique passe « Prêt ». Toute modification invalide la validation (le serveur recalcule).
- **À revoir** : bandeau `role="alert"` avec les éléments amont modifiés (« T-avis ajoutée, T-rappel modifiée »), composants et flux concernés ; « Voir les changements » ouvre l'écran amont ; « Proposer les mises à jour » ouvre la modale de l'agent (équipe qui écrit seulement). Comme pour les Données (TK-109), « Valider l'architecture » reste proposé en « À revoir » : une nouvelle validation repose la référence de l'impact amont (écart avec la maquette l.864, qui ne l'affiche pas ; sans lui l'équipe ne pourrait pas lever l'alerte).
- **Vue client** : bandeau « Lecture seule » ; fiche de composant « En clair » + « Sert » ; décision : encadré « En clair » puis le reste en lecture ; flux : diagramme de séquence et liste des messages ; « Commenter » (fenêtre `DataCommentDialog` généralisée, un champ, « Envoyer », annonce « Commentaire envoyé ») ; non validé : `EmptyState` `schedule` « en cours de validation par l'équipe ».
- **États** : chargement (squelettes), vide (« Aucune décision » / « Aucune décision ne correspond », avec « Effacer les filtres »), erreur (`ErrorNotice` + Réessayer), droits (designer sans écriture ; business sans « Commenter »), indisponible (modèle non validé).
- **Clavier et annonces** : lignes de liste = boutons `aria-current` ; flèches haut/bas entre lignes ; Échap ferme la fenêtre de commentaire et rend le focus au bouton d'origine ; fiche de décision en `article` `aria-label="Décision"` ; annonces dans l'unique région `role="status"` de la page (compte après filtre, « Architecture validée », « Commentaire envoyé »).
- **375 px** : liste puis fiche « ← Liste », commandes 44 px, filtres sur plusieurs lignes, « Valider l'architecture » et « Commenter » pleine largeur, aucun défilement horizontal de page.
- **États comparés à la maquette** (clair, sombre, 375 px) : Décisions (liste + fiche) ; À revoir (bandeau, schéma avec contours ambre) ; Vue client Décision « En clair » ; Vue client Schéma ; Décisions vide ou erreur ; liste validée « Validé par l'équipe ».

## 13. Bilan du lancement (TK-114b, sans maquette, B613 à B622)
- **Génération** : sous le texte du bandeau, ligne `detail` « Zones traitées 4/9 · écartées 2 · couverture 38/174 » (couverture = fonctionnalités servies), mise à jour à chaque sondage (3 s) ; avant la liste des zones : « Préparation des zones ». Annoncée par la région `role="status"` du bandeau quand elle change.
- **Relecture** : `InlineAlert` `role="note"` au-dessus des avertissements, neutre `info` si terminé, `warning` sinon ; trois lignes (DESIGN §5.25) : bilan court avec le motif, couverture détaillée avant/après, zones écartées par motif. Absente si le lancement n'a pas de bilan (lancement d'avant TK-114b).
- **Mise à jour d'un composant indexé** (proposition avec `specId`, B615) : sous-titre « Mise à jour · zone Données », identifiant = `specId`, contenu « Possède » et « Sert » complets ; acceptée, elle enregistre `component.update` (liens seuls).
- **États** : chargement et erreur de la liste inchangés (le bilan vient de `proposal.list`) ; droits : mêmes rôles que la relecture ; vide : pas de bilan.
- **375 px** : les lignes du bilan passent à la ligne, aucune troncature ; aucune action dans le bilan.
