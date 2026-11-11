---
id: S-dev-ui
titre: Galerie des composants (/dev/ui, équipe, hors production)
version: 1.5
---
## 1. Utilisateurs et objectif
L'équipe Koklo (développeurs, designer, agents de développement et de revue) et les tests de captures. Ce n'est pas un écran du produit : aucun client ni rôle d'organisation n'y a affaire. Arrivée : adresse saisie `/dev/ui`, ou les tests `apps/web/e2e/dev-ui.spec.ts`.

Objectif : voir chaque jeton et chaque composant du lot 0 (DESIGN.md v2 §2, §3, §5) dans **tous** ses états, en clair et en sombre, au même endroit, et le comparer à la planche « Lot 0 · Fondations v2 » (`docs/refonte/maquettes/04-Lot0Fondations.html`). Source : passation 01 §0.4.

## 2. Tâches et parcours
- Principale : parcourir les sections de haut en bas ; basculer clair / sombre.
- Secondaires : survoler ou atteindre au clavier une `EntityChip` pour voir son aperçu ; déplier « Détails » d'une `InlineAlert`.
- Entrées : `/dev/ui` seulement. Aucun lien vers la galerie depuis l'application.
- Sorties : aucune. Les liens des `EntityChip` pointent vers `#` suivi de l'identifiant (ancre sans effet), jamais vers une vraie page.
- Gabarit : page autonome, **hors `AppShell`** (pas de session, pas d'organisation), avec son propre en-tête et sa bascule de thème.
- Disponibilité : ouverte seulement si `APP_ENV` vaut `development`, `test` ou `staging` (liste blanche) ; 404 (`notFound()`) pour toute autre valeur, dont `production`. Valeur lue à l'exécution (`readRuntimeConfig`), aucune variable `NEXT_PUBLIC_*`. Sans session (données fictives statiques, aucune donnée personnelle). Non ajoutée au `matcher` de `proxy.ts`.

## 3. Contenu
Toutes les données sont fictives, statiques, écrites dans le code de la galerie. Aucun appel d'API. Aucune couleur en dur : les nuanciers montrent la couleur par la classe du jeton et affichent le **nom** du jeton, jamais une valeur hexadécimale (garde de couleurs).

En-tête (fond `--background`, bordure basse `--border`, marges 20 / 32 px) :
- Sur-titre `text-group-label` `--muted-foreground` : « Lot 0 · DESIGN.md v2 ».
- h1 `text-page-title` : « Galerie des composants ».
- Une phrase `text-meta` : « Chaque jeton et chaque composant de `@koklo/ui`, dans tous ses états. »
- À droite : bascule de thème « Clair » / « Sombre » (groupe de deux boutons, voir §5).

Corps (fond `--surface`, colonne de 1120 px au plus, marges 32 px, sections espacées de 40 px). Chaque section : h2 `text-section-title`, puis des cadres (`--background`, bordure `--border`, rayon 12, marges 20 px) titrés en h3 `text-subsection-title`. Les numéros de section reprennent ceux de la planche, pour la comparaison.

1. **Surfaces et élévation** : 5 nuanciers (Fond `--background`, Surface `--surface`, Élevé `--raised`, Bordure `--border`, Bordure forte `--border-strong`), plus `--diff-bg` et un exemple d'ombre `--shadow-floating` sur `--raised`. Libellé du rôle + nom du jeton en `text-code`.
2. **Échelle typographique** : une ligne par niveau de DESIGN.md §3 (titre de page, section, sous-section, corps, secondaire, libellé de groupe, pastilles, code), avec la spécification à gauche (`text-meta`) et un exemple à droite : « Fonctionnalités », « Critères d'acceptation », « Éléments liés », « La personne se connecte avec son adresse e-mail. », « Mis à jour il y a 12 min par Awa », « SPEC », « À valider », « F-001 · S-login · a1b2c3d ». Les exemples de titres ne sont **pas** des balises h1 à h3 (des `p` avec l'utilitaire), pour garder un plan de titres correct.
3. **Langage des statuts** :
   - « Cycle de vie d'une fonctionnalité » : `LifecycleStatus` de 0 à 5, chacun suivi de sa règle en `text-meta` (« Décrite dans le dossier, pas encore dans la spec », « Au moins un critère d'acceptation », « Liée à un écran », « Une PR fusionnée la référence », « Chaque critère a un test vert », « Présente dans une baseline »).
   - « Validation client » : `ValidationStatus` Validée, À valider, À revoir, Non soumise ; puis une ligne « Libellés d'écran » : Acceptée, À relire, Rejetée (`cancel`), Active, Suspendue (`block`), Désinstallée (`cancel`), Autorisée, À autoriser.
   - « Statut d'un livrable » : `DeliverableStatus` À faire, En cours, À valider, Validé ; puis la variante compacte des quatre, et la compacte au libellé masqué.
   - « Priorité » : `PriorityIndicator` Indispensable, Importante, Souhaitable, Reportée ; puis les tickets : Priorité critique, haute, moyenne, basse.
4. **Composants signature** :
   - « EntityChip » : les 8 types (F-001 « Connexion », S-login, TK-104, RL-owner, T-users, R-001, E-auth-login, a1b2c3d), une avec titre, les autres sans ; puis un aperçu `HoverCard` rendu ouvert de façon statique (même habillage, « F-001 · Connexion par e-mail », « 3 critères · liée à S-login ») pour la capture.
   - « Boutons » : principal avec icône `add` « Action principale », secondaire « Secondaire », discret « Discret » ; désactivé avec raison « Désactivé » + « Toujours avec sa raison à côté » ; désactivé transitoire sans raison, `aria-busy`, « Enregistrement… ».
   - « InlineAlert » : neutre `lock` « Votre texte est envoyé à l'agent IA avec la clé de l'organisation. » + « Détails » (replié) ; la même dépliée ; attention `schedule` « Trop de demandes. Nouvel essai possible dans 28 s. » + « Annuler » ; erreur `error` « Le fournisseur n'a pas répondu à temps. » (texte de la planche, qui ne nomme aucun fournisseur) + « Réessayer » ; neutre sans action.
   - « Bloc d'envoi » : le vrai `AiSendPolicy` de `apps/web` (variante complète, repliée) et sa variante `reminder`.
   - « EmptyState » : `lightbulb`, « Aucune idée encore », « Racontez le projet en quelques phrases, l'agent vous aide à le structurer. », action principale `edit` « Commencer le dossier ».
   - « PhaseRail » (pleine largeur) : grand en phase Cadrage (Idée terminée « Dossier stable, 8 pages sur 10 », Cadrage en cours « 4 fonctionnalités sur 7 validées », Baseline 0 à venir « Posée à la validation du client », Itérations à venir « Sprints et demandes de changement ») ; grand en phase Idée ; grand en phase Itérations ; miniatures des 4 phases (« Idée · 1 sur 4 » … « Itérations · 4 sur 4 »).

Section « Listes longues » (TK-94, DESIGN.md §5.3), après « EmptyState » et « PhaseRail » :
- « VirtualList » : 1 000 lignes fictives (identifiant `F-nnn` en mono, titre, `LifecycleStatus`), cadre de 420 px de haut défilant, hauteur de ligne 52 px, `aria-setsize` 1 000 ; une page de 50 se « charge » à 80 % (délai simulé de 400 ms, jamais d'appel réseau) ; une ligne sélectionnée.
- « CountBar » : « 1 000 fonctionnalités · 50 chargées · 31 à valider » avec tri ; variante filtrée.
- « ListFooter » : les 4 états côte à côte (suite, chargement, erreur, fin) ; « Charger la suite », « Réessayer » font avancer la démonstration ; « Revenir en haut » dans l'état fin.
- « Recherche vide » : `EmptyState` `search_off` « Aucune fonctionnalité ne correspond à « annulation groupée » ».
- « Pagination » : « 1–25 sur 1 240 », pages 1, 20, 50 (ellipses), tailles 25 / 50 / 100, première et dernière page (précédent / suivant désactivés avec raison).
- « GroupSection » : un groupe ouvert (« Fonctionnalités · Réservation · 42 · 18 acceptées · 22 à relire », 8 lignes, « Afficher 20 de plus ») et un groupe replié.
- « DiagramMinimap » et « ZoneNode » : trois zones fictives (« Réservation · 14 tables », « Clients · 9 tables », « Paiement · 7 tables ») et leur mini-carte avec cadre de vue.

Section « Primitives de base » (TK-138, DESIGN.md §5.5, catalogue `docs/refonte/catalogue-composants.md`), en trois groupes livrés par lot, chaque composant dans tous ses tons, tailles et états, clair et sombre (données fictives, aucun nom de fournisseur d'IA) :
- **A · Jetons, icônes, actions** : jetons ajoutés (`--alert-success-*`, `--overlay`, ombres `dialog` / `sheet` / `toast`, rayons 10 et 14, textes `card-title`, `dialog-title`, `stat`, `count`, `code-sm`, `settings-title`) ; `Icon` aux tailles 14, 16, 18, 20, 22, 24, 28 et aux 4 tons ; `Button` (6 variantes + `dashed`, `inherit`, `link`) aux 4 tailles, avec icône, raccourci, `loading`, `pressed`, `fullWidth`, désactivé avec raison ; `IconButton` 32 et 36, envoi primaire ; `Kbd` ; `Spinner` 16 / 18 / 20.
- **B · Pastilles, identifiants, avatars** : `Pill` 3 tailles x 9 tons, avec icône, interactive ; `CountBadge` 5 tons ; `Dot` ; `RolePill` des 6 rôles ; `IdTag` (soft, outline, `sm`, `pill` « Fournisseur · modèle ») ; `ValidationStatus`, `DeliverableStatus`, `LifecycleStatus` recalés ; `Avatar` 5 tailles x 4 tons x rond / tuile ; `IconTile` 5 tailles x 4 tons.
- **C · Choix et saisie** : `FilterChip` (actif, inactif, compteur, `add`), `OptionChip` ; `SegmentedControl` (2 à 4 segments, `xs`, actif sans violet, mode `radiogroup`) ; `Switch` et `SwitchRow` (éteint, allumé, désactivé) ; `Checkbox` (3 états) ; `RadioGroup` et `RadioCard` (liste et grille, « Recommandé ») ; `Input` 40 et 36 (normal, `mono`, invalide, désactivé), `SearchField`, `Textarea`, `Field` (obligatoire, facultatif, aide, erreur), `Select` 40 et 36.

Sections « Surfaces et retours » (TK-139, DESIGN.md §5.6, catalogue §1.3 et §1.4), en trois groupes livrés par lot, clair et sombre, données fictives, aucun nom de fournisseur d'IA :
- **A · Surfaces** (région « Surfaces · A », id `dev-ui-surf-a`) : `Card` des 6 variantes avec en-tête et action ; `StatCard` (4 cartes, dont une avec jauge) ; `ProgressBar` 6 et 8 (0, 40, 100 %) ; `InlineAlert` des 5 tons, avec action en lien et en boutons ; `EmptyState` `framed` avec action secondaire, puis `inline` ; `Skeleton` et 4 `SkeletonRow` ; `Alert` déprécié montré une fois, étiqueté « déprécié ».
- **B · Superpositions** (région « Superpositions · B », id `dev-ui-surf-b`) : trois boutons ouvrent « Nouveau projet » (`Dialog` 520), « Supprimer le projet » (`AlertDialog`) et un tiroir 440 / 540 / 620 (un bouton par taille, `SheetHeader` et `SheetFooter`) ; trois boutons lancent un toast de succès, d'erreur (avec « Annuler ») et d'information. Pour la capture, chaque superposition s'ouvre aussi par un bouton dédié.
- **C · Onglets et tableaux** (région « Onglets et tableaux · C », id `dev-ui-surf-c`) : `Tabs` `segmented`, `underline` en `tablist` (avec compteur), `underline` en lien (ex-`HeaderTabs`), `underline` `sm` ; `Table` non encadrée (existante), `framed`, `dense`, `stickyHeader` dans un cadre de 240 px de haut, avec `YesNoCell` (matrice de rôles fictive).

Sections « Listes et navigation » (TK-140, DESIGN.md §5.3 et §5.7, catalogue §1.4, planches 12, 05, 10 et 24), clair et sombre, données fictives, aucun nom de fournisseur d'IA :
- **A · Listes longues** (section « Listes longues » existante, id `dev-ui-lists`, mise à jour) : `VirtualList framed` avec `loadingRows` (4 lignes fantômes) ; `CountBar` y compris « 0 résultat pour « annulation groupée » » ; `ListFooter` aux 4 états (une ligne, `Spinner` en chargement) ; `Pagination` (boutons 32 bordés en mono, « Lignes par page » segmenté, précédent et suivant désactivés sans texte) ; `GroupSection stacked` dans un `ListPanel` (action `done_all`, groupe replié avec son action, rangée « Afficher 20 de plus »).
- **B · Lignes et en-têtes** (région « Listes · B », id `dev-ui-lists-b`) : `ListPanel` avec titre, « Tout voir » et pied ; `ListRow` (icône d'état, `IdTag`, sous-titre, pastille à droite, valeur mono, actions, sélectionnée, case à cocher, lien) ; `ProjectHeader` avec `status` (résumé en ligne dès `md`) ; `PageHeader` avec et sans fil d'Ariane ; `PhaseRail` `inline` à côté de `sm`.
- **C · Navigation** (région « Navigation · C », id `dev-ui-nav`) : barre étendue et rail avec `ShellNavGroup` (avec et sans séparateur), `ShellNavItem` avec `count`, bouton « Déplier la barre » ; `SecondaryNav` (groupes Organisation et Vous, entrée active, `CountBadge`), puis sa version horizontale à 375 px.

Les boutons d'action des exemples (« Annuler », « Réessayer », « Commencer le dossier ») ne font rien ; « Détails » déplie réellement.

## 4. États
- **Nominal** : seul état de la page ; tout est statique.
- **Vide, chargement, erreur** : sans objet (aucune donnée chargée). Les composants qui ont un état vide ou d'erreur le montrent eux-mêmes dans leur section.
- **Droits** : aucune session demandée. En production, 404 standard de l'application, sans rendu d'aucun composant ni indice d'existence de la galerie.
- **Thème** : clair (défaut, celui de l'application, décision H-24) ou sombre.
- **Aperçu ouvert** : `HoverCard` d'une `EntityChip` ouverte au survol ou au focus.
- **Détails déplié** : `InlineAlert` neutre avec sa zone de détail visible.
- **Listes** (TK-140) : chargement (lignes fantômes + pied), erreur (pied), fin, recherche sans résultat, première et dernière page.
- **Superpositions ouvertes** (TK-139) : dialogue, dialogue d'alerte, tiroir (440, 540, 620) et toast, ouverts par leur bouton ; focus piégé dans le dialogue et le tiroir, Échap ferme et rend le focus au bouton.

## 5. Interactions et retours
- Bascule de thème : deux `button` « Clair » (`light_mode`) et « Sombre » (`dark_mode`) dans un groupe nommé « Thème » ; le bouton actif a `aria-pressed="true"`, fond `--primary`, texte `--primary-foreground` ; l'autre transparent, `--muted-foreground`. Elle réutilise `applyTheme` (`apps/web/src/lib/theme.ts`) : même classe `.dark`, même préférence mémorisée que l'application, aucune autre clé de stockage.
- `EntityChip` : survol ou focus → aperçu ; Échap ou sortie → fermeture. Clic → ancre sans navigation.
- « Détails » : bascule `aria-expanded`, la zone apparaît sous la ligne, le focus reste sur le bouton.
- Aucune autre interaction. Aucune confirmation, aucun message de retour.

## 6. Responsive
- **≥ 768 px** : cadres en grille `repeat(auto-fit, minmax(340px, 1fr))`, écart 24 px, comme la planche. PhaseRail sur une ligne.
- **< 768 px** (référence 375 px) : marges 16 px ; une colonne ; l'en-tête passe sur deux lignes (titre puis bascule de thème) ; les lignes de l'échelle typographique empilent la spécification au-dessus de l'exemple ; les pastilles et puces passent à la ligne (`flex-wrap`) ; la raison du bouton désactivé passe sous le bouton ; `InlineAlert` laisse le texte passer sur plusieurs lignes, l'action reste à droite et alignée en haut ; `PhaseRail` grand empile les étapes (chaque étape pleine largeur, le trait reste horizontal après la pastille). **Aucun défilement horizontal de la page.**

## 7. Accessibilité
- Repères : `main` unique, h1 unique, h2 par section (`aria-labelledby`), h3 par cadre. Les exemples typographiques ne sont pas des titres.
- Ordre de focus : bascule de thème, puis dans l'ordre du document les puces d'entité, les boutons actifs (le désactivé est sauté), les actions des alertes, « Détails », « Commencer le dossier ». Focus visible `--ring` partout.
- Bouton désactivé : `disabled` natif, raison visible reliée par `aria-describedby` ; le transitoire a `aria-busy="true"` et aucune raison.
- `LifecycleStatus` : `aria-label` « Avancement : <libellé>, étape <n> sur 6 » ; `PriorityIndicator` et jauges : formes `aria-hidden`, libellé lu ; `DeliverableStatus` compact sans libellé visible : libellé en texte réservé aux lecteurs d'écran ; `PhaseRail` : `ol` nommée « Phase du projet », `aria-current="step"` sur l'étape en cours, états lus en texte.
- `InlineAlert` : `role` `note` / `status` / `alert` selon la variante. Dans la galerie, l'alerte d'erreur est statique : elle est rendue avec `role="alert"` dès le chargement (pas d'insertion dynamique), ce qui ne provoque pas d'annonce répétée.
- `EntityChip` : nom accessible = type (texte réservé aux lecteurs d'écran) + identifiant + titre, par exemple « Fonctionnalité F-001 Connexion » ; le libellé visible est contenu dans le nom (2.5.3).
- Contrastes : tous les textes ≥ 4,5:1 en clair et en sombre (DESIGN.md §2.1, §2.2). `--border-strong` et les crans à 22 % sont décoratifs.
- Mouvement réduit : seules les animations existantes (`content-in` de l'aperçu) sous `motion-safe:`.
- axe sans violation (WCAG 2.2 AA) en clair et en sombre, à 1280 px et à 375 px, aperçu ouvert et « Détails » déplié compris.

## 8. Alternatives écartées
1. **Storybook** (ou Ladle) : un outil de plus à installer et à maintenir (ADR obligatoire), et une page hors de l'application ne vérifie ni les styles réels de `apps/web` ni `AiSendPolicy`. La passation demande une route `/dev/ui` photographiée par les tests existants.
2. **Galerie dans `AppShell`** : demande une session et une organisation, et mélange la barre latérale (refondue au lot 1) aux captures du lot 0. Page autonome retenue.
3. **Réutiliser la fixture de `packages/ui/e2e`** : elle ne vit que dans les tests du paquet, n'est pas servie par l'application et ne voit pas les composants de `apps/web`.
4. **Fermer la galerie hors développement** (dev seulement) : les captures tournent en `APP_ENV=test` et l'équipe veut la voir en staging ; la passation dit « hors production ». Fermée seulement en production.

## 9. Questions ouvertes
- Q1 Faut-il un drapeau pour l'ouvrir aussi en production (équipe seulement) ? Lecture prudente : non, 404 en production (passation : « hors production ou derrière un drapeau »).
- Q2 Noms de types lus par les lecteurs d'écran dans `EntityChip` (questions.md B32).
- Q3 Écarts de mesures entre la planche et la passation (`LifecycleStatus`, questions.md B27) : la passation fait foi.

## 10. Historique
| Version | Date | Ticket | Changement et raison |
|---|---|---|---|
| 1 | 2026-11-06 | TK-87 | Création : galerie autonome des jetons et des 8 composants du lot 0 (DESIGN.md v2), tous états, bascule de thème, 404 en production, captures clair / sombre / 375 px. Détail : `.workflow/TK-87/02-design.md` |
| 2 | 2026-11-06 | TK-94 | Section « Listes longues » : `VirtualList` (1 000 lignes simulées), `CountBar`, `ListFooter` (4 états), `EmptyState` de recherche vide, `Pagination`, `GroupSection`, `DiagramMinimap`, `ZoneNode`, tous états, clair et sombre. Détail : `.workflow/TK-94/02-design.md` |
| 1.1 | 2026-11-07 | TK-88 | Section « Coquille » (lot B) : barre étendue et repliée, entrée verrouillée avec infobulle, `ProjectHeader` avec onglets, palette ⌘K (résultats, vide, erreur), page « Bientôt », en clair et en sombre. Détail : `.workflow/TK-88/02-design.md` |
| 1.2 | 2026-11-07 | TK-138 | Section « Primitives de base » en trois groupes A, B, C (jetons, `Icon`, `Button` et famille, `Pill` et famille, `Avatar`, `IconTile`, chips, `SegmentedControl`, `Switch`, `Checkbox`, `RadioGroup`, champs). Actif segmenté neutre sans violet (I5). Détail : `.workflow/TK-138/00-fiche.md` |
| 1.3 | 2026-11-07 | TK-139 | Sections « Surfaces et retours » A, B, C : `Card`, `StatCard`, `ProgressBar`, `InlineAlert`, `EmptyState`, `Skeleton`, `Toast`, `Dialog`, `AlertDialog`, `Sheet`, `Tabs`, `Table`. Superpositions ouvertes par bouton. Détail : `.workflow/TK-139/00-fiche.md` |
| 1.4 | 2026-11-07 | TK-140 | Sections « Listes · A » (mise à jour), « Listes · B » et « Navigation · C » : `Pagination`, `VirtualList`, `CountBar`, `ListFooter`, `GroupSection`, `ListPanel`, `ListRow`, `ProjectHeader`, `PageHeader`, `PhaseRail inline`, `ShellNavGroup`, `ShellNavItem count`, `SecondaryNav`. Détail : `.workflow/TK-140/00-fiche.md` |
| 1.5 | 2026-11-11 | TK-99b | Section « 14. Propositions de l'agent » (id `dev-ui-proposals`) : `AgentProposeButton` (5 états), `AgentProposePopover`, `ProposalReview` (plate et en volume), en clair, en sombre et à 375 px. Détail : `.workflow/TK-99b/00-fiche.md` |

## 11. Captures (générées par `apps/web/e2e/dev-ui.spec.ts`)
Dossier `design/screens/captures/S-dev-ui/` : `full-light.png`, `full-dark.png` (pleine page, 1280 px), `full-light-mobile.png`, `full-dark-mobile.png` (375 px), `hovercard-light.png`, `hovercard-dark.png`, `details-open-light.png`, `details-open-dark.png`. TK-94 : `lists-light.png`, `lists-dark.png`, `lists-light-mobile.png`, `lists-dark-mobile.png` (section « Listes longues »).
TK-138 : `primitives-light.png`, `primitives-dark.png` (pleine section, 1280 px), `primitives-light-mobile.png`, `primitives-dark-mobile.png` (375 px), plus `primitives-a|b|c-<light|dark>.png` par groupe.
TK-139 : `surfaces-light.png`, `surfaces-dark.png` (sections A, B, C, 1280 px), `surfaces-light-mobile.png`, `surfaces-dark-mobile.png` (375 px), plus `surfaces-a|b|c-<light|dark>.png` par groupe ; `overlays-dialog-<light|dark>.png`, `overlays-sheet-<light|dark>.png`, `overlays-toast-<light|dark>.png` (superposition ouverte, 1280 px) et `overlays-dialog-<light|dark>-mobile.png`, `overlays-sheet-…-mobile.png`, `overlays-toast-…-mobile.png` (375 px).
TK-140 : `lists-<light|dark>.png` (mise à jour), `lists-<light|dark>-mobile.png`, `lists-b-<light|dark>.png`, `lists-b-<light|dark>-mobile.png`, `nav-<light|dark>.png`, `nav-<light|dark>-mobile.png` (régions A, B et C, 1280 px puis 375 px).
