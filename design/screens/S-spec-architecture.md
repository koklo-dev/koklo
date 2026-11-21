---
id: S-spec-architecture
titre: Spec · Architecture (Prêt, Génération, Relecture, Liste · équipe ; onglets Document et Composants)
version: 3
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

## 11. Schéma et Flux (TK-112, maquette 13 l.175-239, 405-441, 576-752, 814-852)
- **Schéma** : lecteur du lot 6 ; au-delà de 25 composants, vue des zones (carte : nom, « N composants · N acteurs · cliquez pour ouvrir », 5 noms + « +N », liens « N liens ») ; zone ouverte en 4 couches (Utilisateurs, Applications, Services, Données et services externes), formes par type, type toujours écrit, liens étiquetés, asynchrone en pointillés, composant d'une autre zone estompé qui ouvre sa zone. Fiche : Fiche · YAML · Mermaid (équipe seulement). Glisser (owner, admin, développeur) : `spec.architecture.layout.save`, sans relecture, désactivé sous 768 px. « Aller à un composant… » (`/`) cherche sur toute la spec.
- **Flux** : liste (pages de 50, « N flux · un par parcours »), diagramme de séquence (appels pleins, retours pointillés, bloc `alt`, séparateur), sélecteur Diagramme · YAML · Mermaid (équipe), puces de liens ; « Nouveau flux » et « Modifier » ouvrent `SpecItemSheet`.
- **États** : chargement (squelette de la hauteur du cadre), vide (« Aucun composant à afficher », « Aucun flux »), erreur (`InlineAlert` + Réessayer), droits (designer sans glisser ni Modifier ; client et business renvoyés à la vue d'ensemble).
- **Accessibilité** : nœud = `button` `aria-pressed` (« Service API »), Alt + flèches déplace avec annonce, `/` focalise la recherche, SVG `aria-hidden` ; séquence `role="img"` « Diagramme de séquence X, N messages » + `details` « Lire les messages » (liste numérotée) ; défilement horizontal focusable.
- **375 px** : Composants remplace le Schéma (< 1024 px), Flux liste puis détail « ← Liste », séquence défilante, commandes 44 px.
- **États comparés à la maquette** (clair, sombre, 375 px) : vue des zones ; zone ouverte avec fiche ; zoom 50 % ; Flux diagramme ; Flux YAML ou Mermaid ; Schéma vide ou en erreur.
