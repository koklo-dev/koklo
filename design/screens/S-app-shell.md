---
id: S-app-shell
titre: Coquille de l'application (barre latérale, en-tête de projet, recherche ⌘K, pages « Bientôt »)
version: 2.1
---
> Sources : `docs/refonte/passations/01-lots-0-1-passation.md` §1.1 à §1.7, `05-decisions-2026-11-05-spec-sans-brief.md` §1.7 et §2 « Lot 1 », `21-lot-14-securite-passation.md` §0, `12-lot-8-technique-passation.md` §8.4. Planches : `docs/refonte/maquettes/05-Lot1Shell.html` (mise en page), `10-Lot5Fonctionnel.html` (barre : « SPEC N/7 », entrées numérotées, cadenas ; questions.md B2). Règles visuelles : `DESIGN.md` §5.4. Détail du ticket : `.workflow/TK-88/02-design.md`.

## 1. Utilisateurs et objectif
- **Équipe** (propriétaire, administrateur, développeur, designer) et **business** : se repèrent dans l'organisation et dans un projet, passent d'un livrable de la spec au kanban, retrouvent n'importe quel élément par ⌘K.
- **Client** (lié à un ou plusieurs projets) : même coquille, réduite à ce que ses droits ouvrent (projets liés, Tickets en lecture seule) ; aucun vocabulaire git, aucun contenu de spec lu hors de son espace.
- Entrées : toute page connectée de l'organisation active. Hors coquille : `/login`, `/accept-invitation/<id>`, `/organizations` (aucune organisation active), `/dev/ui`.

## 2. Tâches et parcours
- Principale : aller à la bonne page en une action (barre, carte projet, ⌘K).
- Secondaires : replier la barre ; changer d'organisation ; changer de projet (8 récents) ; lire l'avancement (phase, N/7, compteur de tickets) ; basculer le thème ; se déconnecter.
- Sorties : `/` ouvre le dernier projet ouvert (sinon `/projects`) ; `/projects/<id>` redirige vers Spec · Fonctionnel ; anciens chemins redirigés (`/kanban`, `/projects/<id>/features`, `/members`, `/github`).
- Hors lot : vue d'ensemble (lot 3), espace Idée (lot 2), statuts de livrable (TK-100), bandeau « Prochaine étape » (aucune donnée : non affiché), réglages par rôle (TK-97).

## 3. Contenu
| Zone | Donnée | Source |
|---|---|---|
| Sélecteur d'organisation | nom, rôle, initiales | `organization.list` + session |
| Carte projet | nom, phase (`PhaseRail sm`) | `project.shell` |
| Entrées SPEC | disponibilité, condition, compteur « N/7 » | `project.shell` (`deliverables`, `validatedCount`) |
| Tickets | compteur du sprint actif (absent sans sprint actif) | `project.shell` (`ticketCount`) |
| Menu de la carte | 8 projets récents | `project.recent` |
| En-tête | nom du projet, section, page ; SHA et âge de la spec (équipe) ; résumé (« N fonctionnalités ») ; onglets | `project.shell`, `spec.head` |
| Palette | pages (locales), projets, fonctionnalités, tickets (serveur, 20 au plus) | `search.query` |
| Ouverture d'un projet | enregistrée une fois | `project.visit` |

Entrées de la barre : Vue d'ensemble `/projects/<id>` ; Idée `/projects/<id>/idea` (« Bientôt ») ; Assistant de cadrage `/projects/<id>/framing` ; SPEC 1 Fonctionnel `/spec/functional`, 2 Données `/spec/data`, 3 Architecture `/spec/architecture`, 4 Technique `/spec/technical`, 5 Sécurité `/spec/security`, 6 Design `/spec/design`, 7 Qualité `/spec/quality` ; Tickets `/projects/<id>/tickets` ; Organisation : Tous les projets `/projects`, Réglages `/settings/members`.

## 4. États
| Élément | Vide | Chargement | Erreur | Droits |
|---|---|---|---|---|
| Barre | sans projet actif : groupe Projet absent | squelettes de la carte projet et des entrées SPEC (le reste s'affiche) | `project.shell` en échec : la navigation reste, sans phase, sans compteurs, entrées SPEC verrouillées par prudence | client : sans Réglages ni Assistant de cadrage ; rôle inconnu : sans Réglages |
| Entrée SPEC | — | squelette | — | verrouillée : `button` `aria-disabled`, condition en infobulle et dans le nom |
| `ProjectHeader` | ligne sans donnée = absente | titre seul, onglets déjà rendus | spec illisible : pas de SHA, pas de résumé | client : pas de SHA |
| Palette | invite « Tapez pour rechercher » | squelettes, `aria-busy` | « La recherche a échoué. Réessayez. » + « Réessayer » | client : ni fonctionnalités ni contenu de spec |
| Pages « Bientôt » | c'est l'état | — | — | mêmes droits que la coquille |

## 5. Interactions et retours
- `⌘K` (Mac) / `Ctrl K` : ouvre la palette depuis toute page, même dans un champ (la saisie du champ reste intacte) ; Échap ferme et **rend le focus à l'élément d'origine** ; flèches haut et bas, Entrée sur l'option active, **toujours la première quand les résultats changent** ; pages filtrées à la frappe, serveur interrogé 200 ms après la dernière frappe (requête précédente annulée) ; « Tapez pour rechercher. » seulement champ vide ; sans option, la liste est masquée (pas de `listbox` vide).
- Barre : le **pied reste épinglé en bas**, seule la navigation défile au-dessus (B90).
- `Ctrl B` / `⌘ B` et « Replier la barre » : bascule 256 ↔ 64 px, état mémorisé.
- Onglets de section : liens (`?tab=`), le focus reste sur l'onglet activé, le h1 ne bouge pas.
- Une entrée verrouillée n'agit pas ; son infobulle donne la condition. Aucun message d'erreur.
- Annonces (`role="status"` unique par écran, celui de la page) : « N résultats » dans la palette ; changement d'état de la barre (« Barre repliée » / « Barre étendue ») dans une région `aria-live="polite"` sans rôle `status`, pour ne pas en ajouter un second (règle 5).

## 6. Responsive
- Sous 768 px : en-tête de 56 px avec bouton menu (44 px) ; la barre devient un tiroir de 288 px ; palette presque pleine largeur ; `ProjectHeader` : résumé sous le titre, actions en pleine largeur sous le titre, onglets défilables horizontalement dans leur ligne ; aucune barre de défilement horizontale de la page à 375 px.
- Entre 768 et 1024 px : barre étendue par défaut, repliable.

## 7. Accessibilité
- Ordre de focus : bouton menu (mobile) → sélecteur d'organisation → Rechercher → carte projet → Vue d'ensemble → Idée → Assistant de cadrage → SPEC 1 à 7 → Tickets → Tous les projets → Réglages → Replier la barre → compte → thème → contenu.
- `nav` nommée « Navigation principale » (la barre) ; `nav` « Emplacement » (ligne 1) ; `nav` nommée (onglets) ; `aria-current="page"` sur l'entrée, la page de l'emplacement et l'onglet actifs. Le groupe SPEC est un groupe nommé « Spec » sans `aria-expanded` (il ne se replie pas).
- Rail replié : toute icône seule porte un `aria-label` (« Spec · Fonctionnel », « Rechercher », « Tickets »…) et une infobulle.
- Cibles de 24 px au moins (2.5.8), 44 px sur mobile ; focus visible `--ring` ; l'infobulle d'une entrée verrouillée s'ouvre au focus ; aucune information portée par la couleur seule (le cadenas double le libellé « disponible après… »).
- Mouvement réduit : repli de la barre et tiroir sous `motion-safe:`.
- Palette : dialogue modal nommé « Recherche », `combobox` + `listbox` (cmdk), résultats en `option`, nombre de résultats annoncé.
- Axe sans violation en clair et en sombre : barre étendue, repliée, tiroir, palette ouverte, 1280 px et 375 px.

## 8. Alternatives écartées
1. **Conserver la barre shadcn `sidebar-07` et n'y ajouter que le groupe SPEC** : c'est ce qui avait donné « l'app shell n'a pas bougé » ; la barre `fixed`, en cookie, sur `--card`, avec le fil d'Ariane v1 dans chaque page, ne peut pas reproduire la planche (sticky, 256 / 64, `--surface`, `ProjectHeader`). Réécrite à partir des mesures de la planche.
2. **Groupe SPEC repliable avec chevron et « N/6 validés »** (planche 05) : périmé par la décision du 05/11 (7 livrables, sans repli) et par la planche 10 ; un groupe qui se replie cache des cadenas qui informent.
3. **Entrées verrouillées en liens vers un `EmptyState`** : un lien qui mène à « Bientôt » est un lien mort déguisé ; un `button` `aria-disabled` focalisable porte la condition sans fausse promesse. Les entrées disponibles mais non livrées (Données, Design) mènent bien à « Bientôt » : la page existe.
4. **Recherche ⌘K locale** (01 §1.1) : écartée par B3 ; 1 000 tickets et 300 fonctionnalités ne sont jamais chargés.
5. **Tous les projets dans la carte projet** : liste longue ; 8 récents + « Tous les projets » + ⌘K.

## 9. Questions ouvertes
- Disponibilité de Données et Design dès qu'une fonctionnalité est indexée (B77) : à confirmer avec TK-100.
- « 0/7 » tant qu'aucun livrable n'est validable : accepté (exact, ne promet rien).
- Clavier : `⌘K` ouvre aussi la palette dans un champ de saisie (pas de conflit connu avec le navigateur) ; à revoir à la recette.
- Résolu (B94) : sous 900 px de haut, la barre se resserre (entrées 32 px, sous-entrées SPEC 28 px, carte projet 56 px) ; Organisation reste visible à 1280 x 800 et dans le tiroir à 375 x 812.

## 10. Historique
| Version | Date | Ticket | Changement et raison |
|---|---|---|---|
| 1 | 2026-11-07 | TK-88 | Création : `AppShell` collant 256 / 64 px à `localStorage`, tiroir sous 768 px ; groupe SPEC à sept entrées numérotées avec cadenas et compteur N/7 (planche 10 contre planche 05, B2) ; `ProjectHeader` à trois lignes avec onglets en liens ; palette ⌘K à recherche serveur ; pages « Bientôt » ; retrait de Kanban, Membres, GitHub, IA et de la liste de projets de la barre ; `--sidebar` sur `--surface`. Détail : `.workflow/TK-88/02-design.md` |
| 2 | 2026-11-07 | TK-88 (finition) | Palette branchée et testée au clavier (focus rendu, première option active, filtrage des pages à la frappe, liste masquée sans option : axe) ; pied de barre épinglé (B90) ; captures de la coquille et de chaque écran existant ; comparaison aux planches 05 et 10 (§12). B91 |
| 2.1 | 2026-11-07 | TK-140 | Bibliothèque : `ShellNavGroup`, `ShellNavItem count`, libellé « Déplier la barre » (I28), `PhaseRail inline`, `ProjectHeader` à emplacement `status`, résumé en ligne dès `md` et « / » à 12. L'écran n'est pas migré (TK-141) : seuls le libellé du rail et l'en-tête changent. |

## 11. Captures (générées par `apps/web/e2e/app-shell.spec.ts`, clair, sombre et 375 px)
Dossier `design/screens/captures/S-app-shell/`, chacune en `-light` / `-dark` (375 px : suffixe `-mobile`) : `expanded`, `spec-group` (barre seule), `collapsed`, `locked-tooltip`, `header-features`, `header-tickets`, `header-framing`, `soon-idea`, `soon-data`, `palette-idle`, `palette-results`, `palette-empty`, `palette-error`, `palette-loading`, et à 375 px `drawer`. Chaque écran existant dans la coquille : `design/screens/captures/<S-id>/shell-light.png`, `shell-dark.png`, `shell-light-mobile.png`, `shell-dark-mobile.png` (S-projects, S-features, S-framing, S-kanban, S-members, S-github, S-ai-settings ; S-organizations, S-login, S-accept-invitation et S-dev-ui sont hors coquille). Aucune capture n'est prise pendant un chargement (le test attend l'absence de squelette).

## 12. Revue contre les planches (élément par élément)
Planche 10 (barre) et 05 (mise en page, 1600 × 960 ; captures à 1280 × 800).
| Élément | Planche | Rendu | Verdict |
|---|---|---|---|
| Tuile d'organisation, nom, rôle, `unfold_more` | 05, 10 | idem, 256 px, fond `--surface` | conforme |
| Champ Rechercher et raccourci | 05 | idem (`Ctrl K` sous Linux, `⌘K` sous Mac) | conforme (absent de la 10, B2 retient la 05) |
| Libellé PROJET, carte projet, fil de phase | 05, 10 | idem | conforme |
| Vue d'ensemble, Idée | 05, 10 | idem ; pastille « idea-v1 » absente | écart documenté (lot 2) |
| Assistant de cadrage | — | entrée ajoutée (B79) | écart documenté |
| Groupe SPEC, compteur mono, numéros, ordre, cadenas, sans chevron | 10 | idem, « 0/7 » ; pas de pastille « N à relire » | conforme ; écart documenté (TK-100, B77) |
| Entrée active (fond, contour, icône pleine) | 05, 10 | idem | conforme |
| Tickets et compteur | 05, 10 | idem | conforme |
| Organisation : Tous les projets, Réglages | 05 | idem ; visible sans défilement dès 800 px de haut | conforme à 800, 900 et 960 px de haut (barre resserrée sous 900 px, B94) |
| Pied : Replier, identité, thème | 05 | épinglé en bas | conforme (corrigé : il glissait sous le pli avant B90) |
| En-tête : emplacement, SHA et âge, h1, résumé, actions, onglets et compteur | 05 | idem ; pas de pastille de validation, de « Prochaine étape » ni de compteurs d'onglets inconnus | conforme ; écarts documentés (données absentes) |
| Pages « Bientôt » | 05 (EmptyState) | cadre pointillé, tuile, « Bientôt », sans action | conforme |
| Tiroir 375 px | — (05 à largeur de bureau) | 288 px, mêmes entrées, pied épinglé ; proportions seules comparables | conforme |
| Palette | — (DESIGN.md §5.4) | groupes, option active, total, états | conforme à §5.4 |
| 3 | 2026-11-07 | TK-88 (correction 1) | Barre resserrée sous 900 px de haut (`@media (max-height: 900px)`) : entrées 32 px (36 px dans le tiroir), sous-entrées SPEC 28 px, carte projet 56 px, tuile d'organisation 40 px, écart de groupe 12 px ; Organisation visible à 800 px et à 812 px. B94 |
| 2.2 | 2026-11-08 | TK-141 | Reprise sur les bases (planches 05, 10, 12) : `ShellNavGroup` avec trait avant Organisation, `ShellNavItem count` à la place de `TicketCount`, carte projet absente du rail replié, `PhaseRail inline`, `Kbd` du champ Rechercher, trait du pied sous « Replier la barre ». Détail : `.workflow/TK-141/00-fiche.md` |
