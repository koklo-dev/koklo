---
id: S-spec-architecture
titre: Spec · Architecture (Prêt, Génération, Relecture, Liste · équipe ; onglets Document et Composants)
version: 12
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
| 7 | 2026-11-22 | TK-114c | Vue des zones dès 3 zones et plus de 12 composants (ou plus de 25 en 2 zones), écart assumé avec la règle « au-delà de 25 » (B632) ; liens inter-zones tracés vers la carte estompée et dans la vue à plat (B641) ; « composants reliés » dans le bilan (B642) ; aucun composant ajouté à `packages/ui` (§14). |
| 8 | 2026-11-22 | TK-114d | Application d'entrée de chaque rôle : trait acteur → application sans étiquette (B662, écart « navigateur » de la maquette 13 l.566-568), acteurs placés par leur application (B654) ; propositions « Flux repris » (B655, B659) ; bilan « rôles avec application · flux repris » (§15, B661) ; aucun composant ajouté à `packages/ui`. |
| 9 | 2026-11-24 | TK-114e | Relecture : alerte « Enregistrement échoué » avec motif en mots simples et « Réessayer l'enregistrement » (§16, B672 à B674), bouton du bandeau retiré tant qu'elle est affichée ; bilan « sections déjà présentes écartées » (B670) ; sans maquette, aucun composant ajouté à `packages/ui`. |
| 10 | 2026-11-24 | TK-114f | Lectures limitées par GitHub : « GitHub limite les lectures, réessayez dans N min. » + « Réessayer » sur les vues YAML/Mermaid et le document (§17, B694) ; sans maquette, aucun composant ajouté. |
| 11 | 2026-11-24 | TK-114g | Relecture : une création déjà présente sur la tête passe à l'état terminal « Déjà présente dans la spec » (§18, B697 à B704) au lieu de revenir « À relire » ; comptée à part dans le bandeau, le badge du menu et le récapitulatif ; variante `present` de `ProposalStatus` dans `packages/ui` (DESIGN.md §5.25 v2.35). |
| 12 | 2026-11-27 | TK-114i | Correctif d'affichage (§19) : identifiants longs dans les listes de flux et la fiche du composant, compteur « Composants » en relecture limité aux composants pas encore dans la spec, fiche du schéma sans défilement horizontal (B708 à B714). |

## 11. Schéma et Flux (TK-112, maquette 13 l.175-239, 405-441, 576-752, 814-852)
- **Schéma** : lecteur du lot 6 ; vue des zones dès 3 zones et plus de 12 composants, ou plus de 25 composants en 2 zones (TK-114c, B632 ; avant : au-delà de 25) (carte : nom, « N composants · N acteurs · cliquez pour ouvrir », 5 noms + « +N », liens « N liens ») ; zone ouverte en 4 couches (Utilisateurs, Applications, Services, Données et services externes), formes par type, type toujours écrit, liens étiquetés, asynchrone en pointillés, composant d'une autre zone estompé qui ouvre sa zone, relié par un trait à chaque composant de la zone qui l'appelle ou qu'il appelle (TK-114c, B641). Fiche : Fiche · YAML · Mermaid (équipe seulement). Glisser (owner, admin, développeur) : `spec.architecture.layout.save`, sans relecture, désactivé sous 768 px. « Aller à un composant… » (`/`) cherche sur toute la spec.
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

## 14. Vue par zones dès 3 zones et liens complétés (TK-114c, maquette 13 l.175-239, 676-720, B631 à B643)
- **Seuil** : zones si au moins 3 zones et plus de 12 composants, ou plus de 25 composants en au moins 2 zones ; sinon à plat en 4 couches. Le projet « Toto » (23 composants, 8 zones) s'ouvre sur la vue des zones. Données inchangées (25 tables, 2 zones).
- **Liens** : zone ouverte = liens internes (maquette l.693) + un trait par paire composant / zone voisine vers la carte estompée (l.717-718), les cartes estompées sur leur propre rangée sous les couches (l.716-717, B648), étiquette du moyen, pointillé si asynchrone ; vue des zones = traits « N liens » entre cartes (l.702), comptés par le serveur ; vue à plat = tous les liens, inter-zones compris. Le sens reste lu dans la fiche (« Dépend de », B559).
- **Bilan** : ligne 2 « … · tables rattachées a/b · composants reliés c/d · avant : … » (§13, DESIGN §5.25).
- **États** : chargement, vide, erreur, droits : inchangés (§11) ; zone sans lien : aucun trait, cartes voisines absentes.
- **Clavier et annonces** : inchangés (§11) ; les traits sont décoratifs (SVG `aria-hidden`), les liens se lisent dans la fiche.
- **375 px** : la vue des zones est la liste de cartes (`md:hidden`), le lecteur est masqué sous 768 px ; aucun défilement horizontal de page.
- **États comparés à la maquette** (clair, sombre, 375 px) : vue des zones « Toto » (23 composants, 8 zones) ; zone ouverte avec traits vers une carte estompée ; vue à plat d'un petit projet (8 composants) ; erreur du schéma.

## 15. Application d'entrée et flux repris (TK-114d, maquette 13 l.564-570, 581, 684-697, B649 à B663)
- **Schéma** : zone ouverte et vue à plat : chaque acteur (couche Utilisateurs) relié par un trait plein sans étiquette à son application d'entrée (couche Applications), à partir de `actorRelations` ; un acteur qui a une application n'apparaît plus dans une zone de services seulement parce qu'un flux y passe. Vue des zones : compte d'acteurs selon la même règle. Vue par zones et zone ouverte inchangées par ailleurs (§14).
- **Relecture** : propositions de composant `app` (sous-titre « Application · zone … ») ; mise à jour d'un composant indexé qui ajoute des rôles (« Mise à jour · zone … ») ; flux repris (« Flux repris · N messages », identifiant = `P-` du flux) ; acceptée, une reprise enregistre `archflow.update`.
- **Bilan** : Génération « … · rôles avec application X/Y · flux repris A/B » ; Relecture, ligne « Rôles avec application X/Y · flux repris A/B · avant : x/Y » et motifs « non repris » (DESIGN §5.25).
- **États** : chargement, vide, erreur, droits inchangés (§11, §13) ; projet sans rôle : pas de ligne des rôles ; acteur sans application : aucun trait.
- **Clavier et annonces** : inchangés ; traits décoratifs (`aria-hidden`), la ligne `detail` reste annoncée par la région `role="status"` du bandeau.
- **375 px** : lignes du bilan à la ligne, aucune troncature ; lecteur masqué sous 768 px (liste de cartes) ; aucun défilement horizontal.
- **États comparés à la maquette** (clair, sombre, 375 px) : zone ouverte « Toto » avec acteurs reliés à l'application ; relecture avec le bilan des rôles et une proposition « Flux repris » ; bilan avec motifs « non repris » ; vue des zones « Toto ».

## 16. Enregistrement échoué et réessai (TK-114e, sans maquette, B668 à B676)
- **Relecture** : un lot d'enregistrement `conflict` ou `failed` qui tient encore des propositions acceptées affiche, au-dessus des groupes, `InlineAlert` `error` `sync_problem` : « L'enregistrement de N propositions acceptées n'a pas abouti : <motif>. Rien n'a été écrit dans la spec. » + `Button sm` primaire « Réessayer l'enregistrement ». Motifs : conflit (« un élément proposé existait déjà dans la spec ou avait changé entre-temps »), spec invalide (« la spec obtenue aurait contenu des erreurs »), dépôt (« le dépôt de la spec n'a pas répondu »), autre (« l'enregistrement n'a pas pu se terminer »).
- **Réessai** : rejoue les acceptées non écrites ; le serveur écarte celles qui entrent en conflit avec la tête et les remet « À relire ». Récapitulatif : « N enregistrées dans la spec · M remises à relire : <motif court> ».
- **Bandeau** : « Enregistrer N dans la spec » retiré tant que l'alerte est affichée ; sur Document et Composants, le résumé du bandeau gagne « · enregistrement à reprendre dans la Relecture ».
- **Bilan** : « · sections déjà présentes écartées : n » (n ≥ 1).
- **États** : alerte absente sans lot échoué ; réessai en cours (bouton « Enregistrement… » désactivé, barre verte) ; réessai réussi (alerte retirée, récapitulatif) ; réessai encore en échec (alerte reste, motif à jour) ; tout écarté (aucun lot, M remises à relire) ; droits : designer, client, business ne voient ni l'alerte ni le bouton (pas d'écriture).
- **Clavier et annonces** : le bouton est atteignable au clavier dans l'ordre de lecture (après le bandeau, avant les groupes) ; `role="alert"` annonce l'échec une fois ; le récapitulatif passe par la région `role="status"` existante ; focus conservé sur le bouton (désactivé puis retiré) puis rendu au titre de la relecture.
- **375 px** : texte à la ligne, bouton sous le texte, aucune troncature ni défilement horizontal.
- **États comparés** (clair, sombre, 375 px) : relecture avec l'alerte d'un lot `conflict` de 122 propositions ; récapitulatif après réessai avec 1 remise à relire.


## 17. Lectures limitées par GitHub (TK-114f, sans maquette, B687 à B695)
- **Quand** : une vue qui lit un fichier du dépôt reçoit `PROVIDER_RATE_LIMITED` (quota de l'installation épuisé) : YAML et Mermaid d'un flux (onglet Flux), YAML d'un composant et Mermaid du schéma (fiche du Schéma), document (onglet Document).
- **Rendu** : à la place de « … n'a pas pu être lu », `InlineAlert` `error` icône `schedule` : « GitHub limite les lectures, réessayez dans N min. » (N = `retryAfterMs` arrondi à la minute supérieure, 1 au moins ; sans délai : « réessayez dans un instant. ») + action « Réessayer » (relance la seule requête, désactivée pendant la relance). Onglet Document : même phrase dans l'`ErrorNotice` existant (son « Réessayer » reste).
- **Autres erreurs** : textes actuels inchangés.
- **Clavier et annonces** : `role="alert"` (dérivé de la variante) annonce une fois ; « Réessayer » atteignable au clavier, cible 44 px sous 768 px (InlineAlert `sm`).
- **375 px** : texte à la ligne, bouton sous le texte, sans défilement horizontal.
- **États comparés** (clair, sombre, 375 px) : YAML d'un flux limité (N = 30) ; Mermaid du schéma limité sans délai.

## 18. Proposition déjà présente dans la spec (TK-114g, maquette 13 l.639-668, maquette 09 l.271 et 281, B697 à B704)
- **Quand** : une proposition de création (section, composant, flux technique, parcours) dont l'identifiant est déjà sur la tête. Réglée par le serveur à l'ouverture de la Relecture (commit indexé) ou à l'enregistrement (pré-vérification `exists`) ; jamais remise « À relire ».
- **Ligne** : icône `task_alt` pleine ton `success`, `aria-label` « Déjà présente dans la spec », ligne estompée comme une rejetée ; absente du filtre « À relire », visible dans « Toutes ».
- **Détail** : `Pill` `success` « Déjà présente dans la spec » à droite du titre ; aucun bouton (ni Accepter, ni Rejeter, ni « Remettre à relire »), A et R sans effet ; note « Déjà présente dans la spec · rien à enregistrer ».
- **Bandeau et menu** : « … · K déjà présente(s) dans la spec » (K ≥ 1) ; ni « à relire », ni dans « Enregistrer N dans la spec » ; badge du livrable sans elles.
- **Récapitulatif** : « N enregistrée(s) dans la spec · K proposition(s) écartée(s) : déjà présente(s) dans la spec » (+ « · M remise(s) à relire : motif » pour les autres conflits, inchangés).
- **États** : aucune déjà présente (écran inchangé) ; liste avec 1 déjà présente parmi des à relire ; tout déjà présent (0 à relire, pas de bouton d'enregistrement, « Tout est relu. ») ; lecture de la tête indisponible (rien réglé, écran comme avant) ; droits : designer, client, business voient l'état sans action.
- **Clavier et annonces** : J/K passent sur la ligne ; le récapitulatif passe par la région `role="status"` existante ; aucune annonce à l'ouverture (état, pas événement).
- **375 px** : pastille à la ligne sous le titre, sans troncature ni défilement horizontal.
- **États comparés** (captures `review-already-present-*` : clair, sombre, 375 px clair et sombre) : relecture de l'architecture avec la section déjà présente sélectionnée ; récapitulatif après enregistrement « 1 proposition écartée : déjà présente dans la spec » (clair).

## 19. Identifiants longs, compteur « Composants » et largeur de la fiche (TK-114i, maquette 13 l.175-239, 363-374, 405-441, B708 à B714)
- **Liste des flux** (équipe et client) : identifiant court, disposition de la maquette (identifiant, titre coupé, ligne de 52) ; identifiant qui laisse moins de 112 px : titre dessous sur toute la largeur, ligne plus haute ; identifiant plus large que la ligne : coupé ; les deux complets au survol, titre entier dans le `h2` du détail.
- **En-têtes** (détail d'un flux, fiche du composant) : identifiant coupé s'il le faut ; pastille, « Modifier » / « Commenter » et sélecteur toujours entiers ; nom et pastilles de liens passent à la ligne.
- **Fiche ouverte** : de 1280 à 1440 px (fiche ancrée) et sous 1280 (panneau), aucun défilement horizontal ; seules les sources YAML et Mermaid défilent dans leur cadre.
- **Compteur de l'onglet Composants et barre de compte, en relecture** : composants de la spec + créations proposées à relire ou acceptées pas encore enregistrées (y compris tenues par un enregistrement échoué) ; ni les enregistrées, ni les rejetées, ni les déjà présentes, ni les modifications. Tableau : une ligne proposée seulement pour une création absente de la spec (une rejetée garde sa ligne « Rejetée », non comptée).
- **États** : vide, chargement, erreur, droits inchangés ; lecture du compte en cours ou échouée : le compte de la spec seul. Designer : sans « Modifier » ; client : mêmes corrections, sans relecture.
- **Clavier et annonces** : inchangés (un bouton par ligne, nom accessible complet ; `title` n'est qu'un confort).
- **375 px** : liste puis détail ; titre sous l'identifiant long ; aucun défilement horizontal.
- **Alternatives écartées** : titre au-dessus de l'identifiant (écart à la maquette) ; `overflow-hidden` sur la page (masque le défaut) ; panneau superposé jusqu'à 1440 px (change la planche et les Données) ; nouveau compte `applied` au contrat (le web a déjà ce qu'il faut).
- **États comparés** (captures `long-id-*`) : zone longue avec fiche à 1366, clair puis sombre ; flux à 1366 (un long, un court) ; flux à 375 px ; fiche en panneau à 375 px ; vue Mermaid de la fiche à 1280.
