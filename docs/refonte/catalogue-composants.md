# Catalogue cible de `packages/ui` (refonte, maquettes 01 à 25)

Date : 07/11/2026. Sources : l'inventaire brut des 25 planches, les audits de fidélité TK-87, TK-88, TK-94, TK-97 et TK-98 (`docs/refonte/audits/`), `DESIGN.md` v2.5, et une lecture du code de `packages/ui/src/` (composants, `styles/*.css`, registre d'icônes).

Conventions :
- Les mesures sont en px. Les jetons s'écrivent sous leur nom shadcn : `--secondary` = soft de la maquette, `--secondary-foreground` = softText, `--muted-foreground` = muted, `--border-strong` = borderStrong, `--diff-bg` = diffBg, `--primary-foreground` = on.
- États : **complet** (rien à faire, ou un réglage d'une ligne), **à étendre** (le composant existe, il lui manque des variantes, des tailles ou des corrections), **à créer**, **à déprécier**.
- Les sélecteurs d'état propres aux planches (contrôles segmentés à bordure pointillée, « État de la maquette ») sont de l'outillage de maquette. On ne les produit pas.

## 0. Vérifications dans le code (les points douteux de l'inventaire)

| Point | Constat dans `packages/ui/src` |
|---|---|
| `InlineAlert` n'aurait que neutral et warning (groupe 17-21) | **Faux** : `inline-alert.tsx` a `neutral`, `warning` et `error`, avec un rôle dérivé (note, status, alert). Il manque seulement `success` et `agent`. |
| Le fond d'`EntityChip` est-il `--soft` ? | **Oui** : `bg-secondary` vaut soft (`#eeeaff` / `#231d4a`). Conforme. |
| `Button` : marges et tailles | `default: h-9 px-4` (16 px au lieu de 0 14 / 0 14 0 12), `sm: h-8 px-3`, `icon: size-9`. Pas de `xs`, de `lg`, d'icône de tête, d'état « en cours » ni de suffixe de raccourci. `disabledReason` existe déjà (réponse à 01-04). |
| `Badge` | 3 variantes (`default`, `outline`, `destructive`), `text-xs py-0.5`, sans hauteur fixe ni icône. Des pastilles sont déjà faites main dans `apps/web` : `ai-providers-list.tsx` (`PILL`), `sidebar-nav.tsx` (`TicketCount`), `project-header.tsx:340`, `ai-usage-models.tsx:96`. Cela enfreint la règle 3 de DESIGN §1.1. |
| `STATUS_PILL` | `h-6 px-2.5 gap-1`. La planche donne `0 10 0 6` et un écart de 6 px quand il y a une icône. Tons présents : validated, pending, revise, unsubmitted, neutral. Absents : soft, primary, outline, dashed, success distinct. |
| `Avatar` | Une seule taille (`size-9`), toujours rond, `bg-muted`, `text-[13px]`. Cette taille arbitraire est interdite par DESIGN §3. |
| `Table` | Sans cadre. `TableHead` en `h-10 text-[13px]` (taille arbitraire, et 12 px sur les planches). En-tête sans fond `--surface`. |
| `Input` | `h-9`, `bg-transparent`, `shadow-xs`, et `disabled:opacity-50`, ce qui contredit DESIGN §5.2 (désactivé en pointillés, plus de lavande délavée). Pas d'icône de tête. |
| `Card` | `rounded-lg` (8) et `p-5` (20), quand les planches 05 à 25 utilisent 12 et 16/18. |
| `Sheet` | `sm:max-w-[440px]` seulement. Les tiroirs de formulaire font 540, celui du ticket 620. |
| `Tabs` | Style segmenté shadcn seulement (`h-9 bg-muted`). Le style souligné existe, mais il est enfermé dans `HeaderTabs` (`project-header.tsx`). |
| Dialogue et toast | Aucun dans `packages/ui`. `CommandPalette` passe par `cmdk` (`Command.Dialog`). Radix Dialog et Radix Toast sont déjà fournis par `radix-ui` : **pas de nouveau framework, donc pas d'ADR**, sauf si l'on choisit Sonner. |
| `Switch` | Absent de `packages/ui`. Deux interrupteurs locaux dans `apps/web` : `switch-row.tsx` (44 × 24) et `ai-fallback-switch.tsx` (48 × 28). |
| `Icon` | `IconSize = 16 \| 18 \| 20 \| 22 \| 28` : il manque 14 (pastille sm) et 24. La graisse est fixée à 400, conforme. Le registre compte 66 icônes. |
| Icônes absentes du registre, utilisées par les planches | `rate_review`, `progress_activity`, `check_box`, `check_box_outline_blank`, `content_copy`, `swap_horiz`, `person_add`, `schedule_send`, `widgets`, `cloud_done`, `apartment`, `groups`, `key`, `badge`, `sync_problem`, `arrow_forward`, `admin_panel_settings`, `speed`, `description`, `subdirectory_arrow_right`, `expand_less`. Toutes existent dans `@material-symbols/svg-400@0.48.2`. |
| Icônes absentes **du jeu source** | `auto_awesome`, l'icône « agent » de toutes les planches : le jeu n'a que `auto_awesome_mosaic`, `auto_awesome_motion`, `wand_stars`, `wand_shine`, `stars_2`. `expand_more` manque aussi (`keyboard_arrow_down` le remplace déjà). À trancher, voir §2. |
| Rayons | `--radius-sm` 4, `-md` 6, `-lg` 8, `-xl` 12. Aucun jeton pour 10 (aperçus, lignes, toasts) ni 14 (dialogue, grands blocs), alors que DESIGN §5 cite 10. |

## 1. Catalogue cible

Les maquettes sont citées par leur numéro de planche. Les tailles retenues tranchent les incohérences du §2.

### 1.1 Primitives d'action et de saisie

| Composant | Variantes, tons et tailles normalisés | Maquettes | État | Ce qui manque |
|---|---|---|---|---|
| **Icon** | Material Symbols Rounded 400, `fill` 0/1. Tailles 14 (pastille sm), 16, 18, 20, 22, 24 (avatar d'étape), 28. Couleur `currentColor`, ou `tone` facultatif : `muted`, `primary`, `success` (`--status-validated-fg`), `danger` (`--destructive`). | toutes | à étendre | Tailles 14 et 24. Prop `tone` (coche verte et `block` rouge de 24, coches de la matrice). Ajout au registre des 21 icônes listées au §0. Décision sur `auto_awesome`. |
| **Button** | `variant` : `default` (primaire), `secondary`, `outline`, `ghost`, `destructive`, plus **`dashed`** (ajout : « + Nouvelle page ») et **`inherit`** (contour `currentColor`, texte hérité, 600, dans un bandeau coloré), **`link`** (souligné 600, 28). `size` : `xs` 28 (12/500, 0 10), `sm` 32 (13/500, 0 12 / 0 12 0 10 avec icône), `default` 36 (14/500, 0 14 / 0 14 0 12 avec icône 20), `lg` 40 (14/500, 0 16 0 12). Props `icon` (tête, 16 en xs/sm, 20 sinon), `shortcut` (Kbd en suffixe), `loading` (`progress_activity` qui tourne sous `motion-safe`, `aria-busy`, opacité .82), `pressed` (halo `0 0 0 3px --secondary`), `fullWidth`. Désactivé en pointillés avec `disabledReason` : conservé. | 01-25 | à étendre | Marges actuelles fausses (`px-4`). Tailles `xs` et `lg`. Variantes `dashed`, `inherit` et `link`. Props `icon`, `shortcut`, `loading`, `pressed` et `fullWidth`. |
| **IconButton** | Carré, `size` `sm` 32 (icône 18, rayon 6), `default` 36 (icône 20). Ton `ghost` muted par défaut. Variante `primary` carrée 32, rayon 8 (envoi d'un message). `aria-label` imposé par le type. | 03, 05-25 | à étendre | Taille 32 avec icône 18 (fermer, replier, thème). Variante d'envoi primaire. |
| **Kbd** | Mono 11, hauteur 18, `0 5`, bordure `--border`, rayon 4, fond `--background`. | 05, 06, 08, 09-16 (« ⌘K », « R », « J/K ») | à créer | Le composant entier. Il sert au champ Rechercher de la barre, à la palette et au suffixe `shortcut` des boutons. |
| **Spinner** | `progress_activity` 16, 18 ou 20, `--primary` ou `currentColor`, rotation sous `motion-safe:animate-spin`, `aria-hidden` (l'état est annoncé ailleurs). | 08, 10, 12, 13, 14, 17, 21 | à créer | Le composant. Il sert à `Button loading`, à `ListFooter`, à `ProgressChecklist` et à la pastille « Conception… ». |
| **Input** | Hauteur `default` 40 (formulaire) et `sm` 36 (barre d'outils, filtre). Rayon 8, bordure `--border`, fond `--background`, 14, marges 0 12. `mono` (JetBrains 13). `invalid` (bordure `--destructive`). `agentFilled` (ombre interne `inset 3px 0 0 --primary` et marqueur « par l'agent »). Désactivé en pointillés, comme les boutons. | 06, 08-25 | à étendre | Hauteur 40, fond `--background`, désactivé (`opacity-50` à retirer), `mono`, `agentFilled`. |
| **SearchField** | `Input` avec icône `search` 18 muted en tête, `sm` 36 (34 dans la barre latérale), libellé `sr-only`, largeur `1 1 240` et 340 au plus. Effacement facultatif. | 05, 08, 09-15, 23 | à créer | Le composant (aujourd'hui `features-search.tsx` et `sidebar-search.tsx` le refont à la main). |
| **InputGroup (champ à action)** | Cadre au style du champ (rayon 10), `textarea` ou `input` sans bordure, bouton intégré (envoi 32, Copier 28). Focus porté par le cadre (`:focus-within`). | 06, 09, 13-16, 22, 24 | à créer | Base commune d'`AgentComposer` et de `CopyField`. |
| **Textarea** | Marges 10 12, interligne 1,5, redimensionnable verticalement, mêmes états que `Input`. | 06, 09-25 | à étendre | Fond, désactivé, `agentFilled`, alignés sur `Input`. |
| **Field** | Libellé 13/600 au-dessus (écart 6). `required` (astérisque `--primary`, `aria-label` « obligatoire »). `optional` (« (facultatif) » en 400 muted). Aide 12 muted. Erreur `role="alert"` 12/500 avec icône `error` 16. Marqueur « proposé par l'agent » 11/500 `--primary`. Orientations déjà présentes. | 06, 08, 10-25 | à étendre | `required`, `optional`, icône de l'erreur, marqueur agent. |
| **Select** | Déclencheur 40 (36 en `sm`), rayon 8, `keyboard_arrow_down` 18, texte d'attente muted. Option sur deux lignes (titre 13/600 + description 12 muted) avec point de couleur 10 facultatif. Option désactivée à .55 avec sa raison. | 08, 10, 11, 13-17, 23, 24 | à étendre | Hauteur 40. Option à deux lignes avec point. Désactivé avec raison. |
| **TagInput** | Cadre de champ, min-h 40, marges 6 8, écart 6. Puce 24, `0 4 0 8`, rayon 6, `--secondary`, mono 12, retrait `close` 16 avec nom accessible. | 13-17, 25 | à créer | Le composant. |
| **Checkbox** (+ `TaskItem`) | Radix Checkbox, case 20 (`check_box` plein en `--primary`, `check_box_outline_blank` muted), cible 28. `TaskItem` : case + texte 13/1,5, barré une fois coché. | 06, 09, 17, 18, 22, 23 ; TK-97 (cases des projets, B117) | à créer | Le composant. Aujourd'hui des cases natives sans style. |
| **RadioGroup / RadioCard** | Radio 18, bordure 2 (`--primary` si choisi, sinon `--border-strong`), point de 8. `RadioCard` : carte rayon 10, marges 10 12. Choisie : bordure 1 `--primary`, anneau interne de 1 et fond `--diff-bg`. Titre 13/600 + description 12 muted. Pastilles facultatives (« Recommandé » xs primaire, compteur). Disposition liste ou grille `minmax(220px,1fr)`. | 08, 10, 11, 15-17, 21, 22, 24, 25 | à créer | Le composant (choix du fournisseur dans TK-98, rôle, action de l'agent, décision du client). |
| **Switch** (+ `SwitchRow`) | Radix Switch `role="switch"`, 38 × 22, marge 3, rond 16 blanc. Allumé `--primary`, éteint `--border-strong`, désactivé à .6. Cible de 44 assurée par la ligne au tactile. `SwitchRow` : titre + description à gauche, interrupteur à droite. | 17, 19, 24 | à créer (remonter) | Remonter `switch-row.tsx` et `ai-fallback-switch.tsx` d'`apps/web` aux mesures de la planche. |
| **SegmentedControl** | Groupe de 2 à 4 segments. `role="group"` + `aria-pressed`, ou `radiogroup` (radios natives) quand c'est une valeur de formulaire. Conteneur `inline-flex`, écart 2, marge 3, rayon 8, bordure `--border`, fond `--surface`. Segment `default` 26 et `xs` 24, 0 10, rayon 6, 12/500, icône 16 facultative. Actif : fond `--background`, anneau 1 `--border`, texte `--foreground`. Inactif : transparent, muted. | 03, 04, 06, 09-14, 16-20, 23, 24 ; TK-87 (thème), TK-94 (lignes par page), TK-97 (thème) | à créer | Le composant. Aujourd'hui `Tabs`, `Button` ou des boutons séparés le remplacent (`dev-ui-theme-switch.tsx`, `theme-choice.tsx`). |
| **FilterChip / OptionChip** | Pilule 28, 0 12, 12/500, `aria-pressed`. Actif : bordure `--primary`, fond `--secondary`, texte `--secondary-foreground`. Inactif : bordure `--border`, fond `--background`, muted. Compteur facultatif (« Tous · 12 »). Variante `add` (bordure pointillée `--border-strong`, transparente, `add` 16, ouvre un menu). Variante `option` (`role="option"` ou radio, 32, sélection : bordure 2 `--primary` + `--secondary`, texte mono facultatif). | 05, 08, 12-15, 17, 20, 23-25 ; TK-98 (options de modèle) | à créer | Le composant. |

### 1.2 Pastilles, identifiants, avatars

| Composant | Variantes, tons et tailles normalisés | Maquettes | État | Ce qui manque |
|---|---|---|---|---|
| **Pill** (évolution de `Badge`, base de `STATUS_PILL`) | `size` : `xs` 18 (11/600, 0 6), `sm` 22 (11/600, 0 8, écart 4, icône 14), `md` 24 (12/500, 0 10, ou 0 10 0 6 avec icône 16, écart 6). `tone` : `neutral` (`--secondary` / `--foreground`), `soft` (`--secondary` / `--secondary-foreground`), `outline` (bordure `--border`, muted), `dashed` (bordure pointillée `--border-strong`, muted : « Externe »), `primary` (`--primary` / `--primary-foreground`), `success` (`--status-validated-*`), `warning` (`--status-pending-*`), `danger` (`--status-revise-*`), `muted` (`--secondary` / muted : non soumise). `icon` facultatif, plein. `interactive` (bouton, `keyboard_arrow_down` 16, marge droite 6). | 01-25 ; TK-87, TK-97, TK-98 | à étendre | Tailles, 9 tons, icône, interactivité. Ensuite, remplacer `PILL`, `TicketCount` et les compteurs de `project-header.tsx` et `ai-usage-models.tsx`. |
| **CountBadge / Dot** | Compteur : `Pill xs` à marge 1 7, 11/600, tons `soft`, `primary`, `success`, `warning`, `outline`. `Dot` : 7 × 7 rond `--primary`, avec un `aria-label` (« Proposition en attente »). | 05, 06, 09-15, 22, 24 ; TK-88, TK-97 | à créer (variante de Pill) | Compteur de navigation et d'onglet (`ShellNavItem count`, `HeaderTabs`, `SettingsNav`). Point de notification. |
| **ValidationStatus / DeliverableStatus** | Sur `Pill md`, icône pleine 16, marges 0 10 0 6, écart 6. `compact` : 11 px. Libellés figés, plus `label` (B25). | 01-05, 07, 09-15, 22 | complet | Marges et écart à recaler (une ligne, audit TK-87). |
| **LifecycleStatus** | `Pill md`, 6 crans de 5 × 5 (B27), crans éteints à 22 %, marges 0 10 0 8, écart 8. Ton `success` au stade 5. | 04, 05 | complet | `pl-2 gap-2` (audit TK-87). |
| **PriorityIndicator** | 3 barres de 3 × 4/8/12, libellé 13/500. | 04, 05, 12 | complet | Rien. |
| **RolePill** | Lien entre domaine et `Pill md`. Propriétaire et administrateur en `soft`, développeur, designer et business en `outline`, client en `warning`. Icône facultative (`badge`, `person`), `interactive` pour le propriétaire. | 24, 25 ; TK-97 | à créer | Le composant (aujourd'hui `Badge outline` pour tous les rôles). |
| **TicketStatus / état métier libre** | `Pill` avec un ton parmi ceux de `Pill` et une icône choisie dans une liste fermée (DESIGN §4, statuts de ticket). Il évite d'élargir `ValidationStatus`. | 07, 22, 23, 25 | à créer | Lien entre statut et ton/icône des tickets, des anomalies et des demandes. |
| **MethodBadge** | Mono 11/600, hauteur 20, 0 6, rayon 6. GET cyan, POST vert, PATCH ambre, DELETE rouge, PUT violet doux. | 09 | à créer | Le composant, et des jetons de méthode (§3). |
| **IdTag** | Identifiant passif, sans lien. Mono 12/500, hauteur 22, 0 6, rayon 6. `tone` : `soft` (défaut) ou `outline` (bordure `--border`, muted : tranches, paquets). `size` `sm` (20, mono 11). Variante `pill` (« Fournisseur · modèle » : rond, 30, bordure `--border`, `--surface`, préfixe muted). | 05-25 ; TK-94 (ligne de fonctionnalité), TK-98 (puce de modèle) | à créer | Le composant (aujourd'hui texte mono nu ou `rounded-md bg-secondary` fait main). |
| **EntityChip** | 26, `--secondary`, icône 16 selon le type, `HoverCard`. Types : feature, screen, ticket, role, table, rule, endpoint, commit, **component** (`widgets`), **adr** (`gavel`), **nfr** (`speed` / `shield`), **permission** (`admin_panel_settings`), **test** (`fact_check`), **scenario**, **anomaly**. `EntityChipGroup` : intertitre 12/600 capitales. | 03, 04, 09-16 | à étendre | Types d'entités des lots 7, 8, 14 et 15. En-tête de groupe. |
| **Avatar** | `size` 24, 28, 32 et 40 (36 par défaut). `tone` : `soft` (équipe), `warning` (client), `agent` (`--primary` / `--primary-foreground`, « IA »), `muted` (tiers). `shape` : `circle` ou `tile` (carré, rayon 6 à 22, 8 à 32, 10 à 36-40, 14 à 56). Initiales 12/700 jusqu'à 32, 14/700 au-delà (20/700 à 56). | 05-08, 13-15, 17, 22-25 ; TK-88 (organisation), TK-97, TK-98 | à étendre | Tailles, tons, forme `tile`, typographie des initiales. Fin de `text-[13px]`. |
| **AvatarGroup** | Pile de 24 (chevauchement -6) ou 28 (-8), bordure 2 `--background`, nom en infobulle et en `aria-label`, « +N ». | 06, 07, 08 | à créer | Le composant. |
| **IconTile** | Carré arrondi avec icône centrée. `size` 28/32/36/40/48, rayon 8/8/10/10/12, icône 18/18/20/20/28. `tone` : `soft`, `primary`, `success`, `warning`. 34 se ramène à 36. | 07, 09-25 | à créer | Le composant. `EmptyState` et `ZoneNode` en dupliquent une version interne. |

### 1.3 Surfaces, retours d'état, superpositions

| Composant | Variantes, tons et tailles normalisés | Maquettes | État | Ce qui manque |
|---|---|---|---|---|
| **Card** | `variant` : `panel` (défaut : rayon 12, bordure `--border`, `--background`, marges 16 18), `inset` (rayon 10, marges 12 14, `--surface` : sous-carte, étape, ligne), `interactive` (lien ou bouton entier, focus visible, sélection en bordure `--primary`), `proposal` (bordure pointillée `--primary`, `--diff-bg`), `dashed` (bordure `--border-strong` : invitation, ajout, sprint planifié), `warning` (bordure ambre). `CardHeader` : titre 15/600, description 13 muted, action à droite. | 01-25 ; TK-97, TK-98 | à étendre | Rayon 12 par défaut, marges 16/18, variantes, en-tête à action. Remplace `AiSectionCard` (`apps/web`). |
| **StatCard** | `Card panel` : libellé 12-13 muted avec icône 18, valeur `text-stat` (24/600, -0,02 em), jauge facultative, note 12 muted. Grille `auto-fit minmax(200px,1fr)`, écart 16. | 07, 22-25 ; TK-97 (Général) | à créer | Le composant. |
| **DefinitionList** | Clé/valeur : clé 13 muted sur 96 à 110 px, valeur 13. Variante en grille de cartes `inset` (libellé 12 + valeur). | 22-25 | à créer | Le composant. |
| **ProgressBar** | Piste `--border-strong`, `md` 6 (rayon 3) ou `lg` 8 (rayon 4), remplissage `--primary`. Segments multiples (accepté `--primary`, rejeté muted). `role="progressbar"` ou `meter`, `aria-valuenow`, valeur en texte à côté. | 01, 05-10, 13-15, 22-25 ; TK-98 (consommation) | à créer | Le composant (aujourd'hui `h-2 bg-muted` fait main dans `ai-consumption.tsx`). |
| **SegmentedGauge** | N segments `flex:1` (12 au plus), hauteur 4/5/6, rayon 2, plein `--primary` (`success` si validé), vide `--border-strong`, `role="meter"`. | 05-08 | à créer | Le composant (maturité du dossier, livrable, carte projet). |
| **InlineAlert** | Une ligne : min-h 40, marges 6 8 6 12, **rayon 10**, icône 18, 13 px, écart 10, centrée (en haut sous 768). Tons : `neutral`, `warning`, `error`, plus **`success`** (`--alert-success-*`) et **`agent`** (`--diff-bg`, bordure pointillée `--primary`). Actions : lien souligné (h28, 0 10, rayon 6), ou un ou deux `Button sm` (`inherit` dans un ton coloré). Variante **`banner`** : titre 15/600, sur-titre 12 capitales, `IconTile 40`, marges 14 16, rayon 12. | 04, 05, 07-25 ; TK-97 (lecture seule) | à étendre | Tons `success` et `agent`, actions en boutons, variante `banner`, écart 10 et action en `px-2.5 rounded-md` (audit TK-87). |
| **Alert** (shadcn) | Remplacé par `InlineAlert`. | — | à déprécier | Migrer `settings-page.tsx` (bandeau `lock`) vers `InlineAlert neutral`. |
| **EmptyState** | `framed` (défaut) : cadre pointillé `--border-strong`, `--surface`, rayon 12, marges 28 20, écart 10, `IconTile 48`, titre 14/600 (15/600 en grand), phrase 13 muted (280 au plus). `inline` : sans cadre ni tuile, dans une liste (recherche vide). `align="start"` (« Section à rédiger »). `compact` : une ligne, sans icône (« Aucun ticket »). Une action principale, plus au plus **une action secondaire** (« Écrire à la main »), et une note de confidentialité facultative (`lock`). | 04, 10-15, 18, 20, 23-25 ; TK-94 | à étendre | Écart uniforme, variantes `inline`, `start` et `compact`, action secondaire, note. |
| **Skeleton** | Bloc (`motion-safe:animate-pulse`) et `SkeletonRow` (52 : pavé d'identifiant 48 × 18 `--secondary` + barre de 14 à 60, 45, 70 ou 52 %). | 10, 12-14 ; TK-94 | à étendre | `SkeletonRow`. |
| **Toast / Toaster** | Radix Toast, `role="status"`, en bas au centre (`bottom` 24), marges 10 14, rayon 10, fond `--foreground`, texte `--background`, `--shadow-toast`, icône `check_circle` 18 (ou `error`), action « OK » ou « Annuler » soulignée 13/600. File d'attente, fermeture manuelle, mouvement réduit. | 10, 11, 15-17, 19, 22-25 ; TK-98 | à créer | Le composant. Il supprime la zone `role=status` de `min-h-5` qui crée le trou de 40 px dans TK-98. |
| **Dialog / AlertDialog** | Radix Dialog centré, 520 au plus (`calc(100% - 32px)`), rayon 14, `--raised`, bordure `--border`, `--shadow-dialog`, voile `--overlay` + flou 6 (`motion-safe`). En-tête : `IconTile 36 primary` facultative, titre 18/600, description 13 muted, fermer `IconButton sm`. Corps à marges 16 20, écart 16. Pied `--surface` à bordure haute, rayon du bas 14, mention à gauche, Annuler (`outline`) puis action principale, 36. Échap et clic sur le voile ferment, le focus est piégé puis rendu. | 08, 10, 11, 15, 17, 20-22, 25 | à créer | Le composant. |
| **Sheet** (+ `FormSheet`) | `size` : `detail` 440 (existant), `form` 540, `wide` 620. Voile `--overlay`, `--shadow-sheet`. `SheetHeader` : `IconTile 36 soft`, titre 18/600, sous-titre 12, `IdTag`, fermer 32. Corps défilant à marges 16 20. `SheetFooter` `--surface` : ligne de fichier mono 12 + note, Supprimer (`ghost`, à gauche), Annuler, Enregistrer. | 10, 11, 13-16, 23, 25 | à étendre | Tailles 540 et 620, en-tête et pied normalisés. `FormSheet` arrive avec le lot Fonctionnel. |
| **Tooltip, HoverCard, Popover, DropdownMenu** | Sur `--raised` + `--shadow-floating`. | 04, 13-15, 23 | complet | Rien. |
| **Accordion, Collapsible** | Résumé 14/600 sur `--surface`, marges 12 16, cadre rayon 12. | 10, 12, 24 | complet | Fond `--surface` et rayon 12 du résumé à poser en variante (`role-matrix.tsx`). |
| **Separator, Label, Resizable** | — | — | complet | Rien. |

### 1.4 Listes, tableaux, navigation

| Composant | Variantes, tons et tailles normalisés | Maquettes | État | Ce qui manque |
|---|---|---|---|---|
| **Table** | `framed` : cadre bordure `--border`, rayon 12, `overflow:auto`, `min-width` paramétrable. En-tête `--surface`, 12/500 muted (`text-caption`), marges 10 16, en-tête collant possible. Lignes séparées en haut, hauteur 52 (`rowHeight`) ou marges 10. `dense` (12 px). `th scope="row"`. Légende `sr-only`. `YesNoCell` : `check` en `success`, `remove` en `--border-strong`, avec `aria-label`, centrée. | 05, 10-15, 17, 20-22, 24, 25 ; TK-97 | à étendre | `framed`, fond d'en-tête, taille 12 au lieu de `text-[13px]`, `dense`, en-tête collant, `YesNoCell`. |
| **ListRow / ListPanel** | `ListPanel` : cadre rayon 12, `overflow:hidden`, en-tête facultatif (h2 16/600 + lien « Tout voir » `--primary` 13/500 avec `arrow_forward`), pied `--surface` 12 muted. `ListRow` : marges 12 16 (ou 52 fixes), séparateur haut, icône d'état 18-20 ou `IdTag` en tête, titre 14/500 + sous-titre 12 muted, à droite pastille, valeur mono ou actions `Button sm`. `selectable` : `aria-current`, fond `--secondary`. Case à cocher facultative en tête. | 07, 09-15, 17, 18, 20, 22-25 ; TK-94, TK-97, TK-98 | à créer | Le composant. Il remplace les lignes faites main de `features-list`, `pending-invitations` et `ai-providers-list`. |
| **VirtualList** | Lignes de 52 ou 44, sélection `--secondary` + bande de 3 `--primary`. `framed` (rayon 12). `loadingRows` (squelettes de ligne). | 10, 12 ; TK-94 | à étendre | `framed`, `loadingRows`. |
| **CountBar** | `role="status"` 13 px. Le total et son nom en gras, « · N chargées », tri « Tri : … » puis `swap_vert`. Libellé de recherche (« 0 résultat pour « … » »). `compact` (kanban). | 10-12 ; TK-94 | à étendre | Gras sur le nom, ordre de l'icône, prop `query`. |
| **ListFooter** | 4 états. Chargement : une ligne, `Spinner` 18 `--primary`. Erreur : fond `--alert-error-bg`, icône rouge, texte muted, sans bordure propre. Icône 18, bouton `xs`. | 12 ; TK-94 | à étendre | Les quatre corrections de l'audit TK-94. |
| **Pagination** | Dans le cadre du tableau (`--surface`, bordure haute, marges 10 14). Plage, puis « Lignes par page » en `SegmentedControl xs` (25/50/100), précédent et suivant `outline` 32, numéros mono 13 de 32 bordés, page courante `--primary`. Désactivé sans raison visible. | 11, 12 ; TK-94 | à étendre | Refonte du rendu (audit TK-94 n° 2 et 3). |
| **GroupSection** | Variante `stacked` (groupes dans un seul cadre), chevron 18, méta 12, action 28 avec `actionIcon` (`done_all`) même replié, rangée « Afficher 20 de plus » pleine largeur `--primary` 13/500. | 10, 12, 13-15 | à étendre | Les quatre corrections de l'audit TK-94. |
| **MasterDetail** | Colonne de liste (330 à 440) + fiche (380 à 440, bordure gauche). Défilement indépendant, `?sel=` dans l'URL, empilement sous 768. | 09-11, 13-15 | à créer | Le gabarit. |
| **Breadcrumb** | 13 muted, « / » écart 12, segment courant `aria-current`. | 05-25 | complet | Rien. |
| **ProjectHeader / PageHeader** | `ProjectHeader` : emplacement `status` après le h1, résumé en ligne à partir de `md`, « / » écart 12. `PageHeader` (page d'organisation : Projets, Réglages) : fil « Organisation / Section » facultatif, h1, actions, sans SHA. | 05-25 ; TK-88, TK-97 | à étendre | Emplacement `status`, résumé en ligne, écart, `PageHeader`. |
| **Tabs** | `variant="segmented"` (existant). `variant="underline"` : liens (`nav`, `aria-current="page"`) ou onglets d'état (`tablist`), hauteur 36, écart 20, 14/500, actif 600 + 2 `--primary`, icône 16 et `CountBadge` facultatifs, défilement horizontal sous 768. `size="sm"` 13 px dans un tiroir. | 05, 09-16, 19, 20, 22-25 | à étendre | Sortir `HeaderTabs` de `ProjectHeader` en variante `underline` réutilisable, avec icône, compteur à ton et mode `tablist`. |
| **AppShell / Sidebar** | Existant (256 / 64, tiroir de 288). `ShellNavGroup` (libellé 11/600 capitales, séparateur facultatif, trait de 24 dans le rail). `ShellNavItem count` (`CountBadge`). Section « Récents ». Carte projet sans cadre dans le rail. | 05-25 ; TK-88 | à étendre | `ShellNavGroup`, `count`, carte masquée quand la barre est repliée, « Récents » (lot Projets). |
| **SpecNav** | Sept entrées, cadenas, compteur. `DeliverableStatus compact` arrivera avec TK-100. | 09-15, 22 | complet | Pastilles de livrable à brancher (données). |
| **SecondaryNav / NavItem** | 240 (Réglages), groupes 11/600 capitales, entrée de 36, 14, icône 18 (pleine `--primary` quand courante), active fond `--secondary` 600 texte `--foreground`, `CountBadge outline` facultatif, liens horizontaux défilants sous 768. | 24 ; TK-97 | à créer | Le composant (aujourd'hui `settings-nav.tsx` local, sans icônes). |
| **CommandPalette** | Existant (560, `--raised`). Utilisera `Kbd`. | 05 | complet | Rien. |
| **ThemeToggle** | Bouton de pied de barre (`ghost` 32), ou `SegmentedControl` Clair / Sombre / Système. | 04, 22-25 | complet | Bascule vers `SegmentedControl` dans Réglages (TK-97). |

### 1.5 Composants métier transverses (agent, document, suivi)

| Composant | Variantes, tons et tailles normalisés | Maquettes | État | Ce qui manque |
|---|---|---|---|---|
| **PhaseRail** (+ `PhasePill`) | `default` (grand), `sm` (miniature encadrée, traits 14 × 4), **`inline`** (sans cadre, 12 muted, traits 12 × 4 : carte projet), **`PhasePill`** (`Pill md` bordée, 4 traits 12 × 4 + « Cadrage · 2 sur 4 » : carte et filtre de projet). | 01, 03-05, 07, 08, 10, 13-15, 22 ; TK-88 | à étendre | `inline` (audit TK-88) et `PhasePill`. |
| **AgentProposal** (+ `DecisionNotice`) | `Card proposal` (rayon 12) : en-tête avec l'icône agent 18 `--primary`, titre 13/600, justification 12. Corps en différence (préfixe « Ajouté : » 12/600 `--primary`). Pied : Accepter (`default sm` avec icône), Modifier (`outline sm`), Rejeter (`ghost sm` avec `shortcut`). `compact` (rayon 8, `xs` 28 : liste de pages ou nav). `DecisionNotice` : ligne `role="status"` « Section ajoutée… » + Annuler (`link`). | 06, 09-11, 13-16, 20 | à créer | Le composant. `framing-proposal-card.tsx` (`apps/web`) est à migrer. |
| **ReviewModeBar** | Bandeau pleine largeur `role="status"`, `--diff-bg`, bordure basse, marges 10 28 : icône agent ou `Spinner`, « Mode relecture », compteurs, `ProgressBar` bicolore, actions à droite. | 09, 10, 11, 13-15 | à créer | Le composant. |
| **AgentProposeButton** | `Button default` avec l'icône agent, 5 états : repos, panneau ouvert (`pressed`), en cours (`loading`, « L'agent propose… »), prêtes (`rate_review`, « Relire N propositions », `pressed`), indisponible (désactivé + raison). Ouvre un `Dialog` 520 : `RadioGroup` de cartes d'actions (« Recommandé », compteur), consigne `Textarea`, sources en `IdTag outline`, pied « Rien n'est enregistré sans votre relecture ». | 17, 20, 21, 22, 25 | à créer | Le composant. |
| **AgentComposer** | `InputGroup` : `textarea` sans bordure 14/1,45, envoi `IconButton primary sm` (`arrow_upward`). Variante en ligne 36 (« Demander une modification à l'agent »). Mention de confidentialité `InlineAlert neutral lock` (B15). | 06, 09, 13-16 | à créer | Le composant. |
| **ChatThread / ChatBubble / AgentPanel** | Panneau 360 (`--surface`, bordure gauche, en-tête `IconTile 28 soft`). Bulle agent : rayon `4 12 12 12`, `--background`, bordure. Bulle utilisateur : rayon `12 4 12 12`, `--secondary`, alignée à droite. Auteur 12 muted. Contexte en `EntityChip`. `AgentComposer` en pied. | 06, 09 | à créer | Le composant. |
| **Prose** (lecture et édition de document) | Colonne de 680, chemin mono 12, h2 `text-prose-h2` 28/600 -0,02 em, h3 18/600, paragraphe 15/1,65, listes 15, `TaskItem`, invite « taper / ». | 06, 13-15 | à créer | Le composant et ses jetons typographiques. |
| **ReorderableList** (+ `PageStatus`, `StatusLegend`) | `nav` de 264 : `ol`, ligne 32, poignée `drag_indicator` 20 × 28, numéro mono 11, icône d'état 16 (`PageStatus` : stable `check_circle` plein `success`, à relire `rate_review` `--primary`, brouillon `edit` muted, à explorer `radio_button_unchecked` `--border-strong`), libellé, `Dot`, étiquette « requise » (10/600, bordure, rayon 4). Réordonner au clavier avec Alt + flèches, annoncé. Ajout en `Button dashed`. Légende sur `--surface`. | 06, 13-15 | à créer | Le composant. |
| **ProgressChecklist** | Lignes 13 : `check_circle` 18 plein `success`, `Spinner` `--primary` (en cours) ou `radio_button_unchecked` (à venir), libellé muted. `role="status"`. | 08, 21 | à créer | Le composant. |
| **Stepper** | Étapes horizontales `flex 1 1 200`, rayon 10, disque 28 : fait (`success` + coche), courant (`--primary` + numéro, bordure `--primary`, halo 3 `--secondary`), alerte (`warning` « ! »), à faire (bordure `--border-strong`). `aria-current="step"`. | 22, 25 | à créer | Le composant. `PhaseRail` reste réservé aux 4 phases. |
| **Timeline** | Liste verticale : disque 30 (le plus récent `--primary`, les autres `--secondary`) avec icône 16, texte 14, date 12 muted. Variante compacte de 24 pour la chronologie d'un ticket. | 22, 23, 25 | à créer | Le composant. |
| **ActivityFeed / PersonRow** | Écart 14 : `Avatar` 32 à ton, texte 13, horodatage 12 muted. `PersonRow` : `Avatar` 32 + nom 13/500 + rôle 12 muted. | 07 | à créer | Les composants. |
| **CodeBlock / CopyField** | `pre` bordure `--border`, rayon 10, `--surface`, mono 12/1,6, défilement, 600 au plus en hauteur. En-tête : chemin mono 12 muted + icône `description` + `Pill`. `CopyField` : ligne mono 13 sur `--surface`, rayon 8, bouton « Copier » `outline xs` (`content_copy`), annonce par `Toast`. | 02, 04, 13-15, 23, 24 | à créer | Les composants. |
| **FlowSteps / StateChain** | Cartes d'étape de 150 (rayon 10, `--surface`, 13/600) reliées par des flèches, branche d'erreur (`subdirectory_arrow_right`). Chaîne d'états : des `Pill` séparées par des flèches. | 10 | à créer | Le composant. |

### 1.6 Composants d'écran (créés avec leur lot, dans `apps/web` sauf réemploi prouvé)

| Composant | Résumé | Maquettes | État |
|---|---|---|---|
| DeliverableCard | `Card interactive` : `IconTile 32`, titre 600, `DeliverableStatus`, `SegmentedGauge` 5, responsabilité de validation (`person` / `groups`). | 07 | à créer |
| ProjectCard (+ en création) | `Card interactive` rayon 12 : `Avatar tile 40` à teinte, `PhasePill`, `ProgressBar`, prochaine action, `AvatarGroup`. Variante `proposal` avec `ProgressChecklist`. | 08 | à créer |
| ScreenCard | Vignette filaire de 150, `IdTag`, titre, pastille ou Accepter/Rejeter `xs`, `proposal` si l'agent la propose. | 09, 17 | à créer |
| Kit de diagramme (DiagramCanvas, ComponentNode, Edge + étiquette, ZoomToolbar, DiagramLegend, fil de zone) | Canevas `role="group"`, nœuds-boutons (acteur rond 28, autres 32 rayon 8), arêtes SVG pleines ou pointillées, barre de zoom (rayon 8, marge 3 : −, %, +, ajuster). | 11-14 | à créer |
| ZoneNode / DiagramMinimap | Rayon 14, icône 18, compte 12, aperçu en rectangles ; mini-carte 168 × 108 rayon 8. | 11-14 | à étendre |
| KanbanColumn / TicketCard | Colonne `minmax(292px,1fr)`, carte rayon 12 marges 14 16, états terminé (.8), sélectionné (`--primary`) et glissé (.4, pointillé). `kanban-card.tsx` existe déjà dans `apps/web`. | 23 | à étendre (dans apps/web) |
| Gantt | Grille 280 + 10 jours `minmax(56px,1fr)`, barres à ton, légende. | 23 | à créer |
| Outils de charte (SwatchRow, RadiusSample, ContrastBadge) | `ContrastBadge` = `Pill` `success` ou `danger`. | 17, 20 | à créer |
| PreviewFrame / CommentPin | Cadre d'appareil 390/1280. Épingle en goutte de 26 (`50% 50% 50% 4px`), bordure 2 blanche, `--primary`. | 17-19 | à créer |
| ProposalDiff | Lignes ajoutées et retirées sur `--diff-bg`, construit sur `AgentProposal`. | 17, 20 | à créer |
| NumberBadge | Rond de 24 `--primary`, 12/700. | 17, 21 | à créer |
| Nuancier de la documentation | Page de documentation seulement. | 01, 04 | hors périmètre |

**Décompte** : 87 entrées. **10 complètes**, **27 à étendre**, **48 à créer**, **1 à déprécier** (`Alert`), **1 hors périmètre** (le nuancier). Pour la bibliothèque seule (§1.1 à §1.5, 75 entrées) : 10 complètes, 25 à étendre, 39 à créer, 1 à déprécier. Les composants d'écran (§1.6) : 2 à étendre, 9 à créer, 1 hors périmètre.

## 2. Incohérences entre maquettes à trancher

Règle appliquée : la planche fait foi (07/11/2026). Quand les planches se contredisent, on retient la valeur majoritaire des planches récentes (09 à 25), puis on corrige DESIGN.md.

| # | Sujet | Mesures relevées | Proposition |
|---|---|---|---|
| I1 | **Hauteur des champs** | 36 (DESIGN §5, 04), 38 (06, 08), 40 (09-25) | `Input`, `Select` et `TagInput` à **40** dans les formulaires, `sm` 36 pour les barres de filtre et la recherche (34 dans la barre latérale : garder). Corriger DESIGN §5 (« boutons 36, champs 40 »). Un bouton aligné sur une rangée de champs prend `lg` 40. |
| I2 | **Tailles de bouton** | 26, 28, 30, 32, 34, 36, 38, 40 | Quatre tailles : `xs` 28, `sm` 32, `default` 36, `lg` 40. 30 devient 32, 34 et 38 deviennent 36, 26 devient `link`. |
| I3 | **Hauteur des pastilles** | 22 (pillSm), 24, 26 (01, 04), 28 (03) | `xs` 18, `sm` 22, `md` 24. Étendre B27 (24 au lieu de 26) à `ValidationStatus` et `DeliverableStatus`, comme le demande l'audit TK-87. Pas de 28. |
| I4 | **Pastille compteur** | 11/600 à marge 1 7 (05, 09-15, 22), 12/500 à marge 0 6 (DESIGN §5.4, code, onglets de 05) | **11/600** partout (navigation et onglets). Corriger DESIGN §5.4 (« compteur 12/500 »). |
| I5 | **Actif d'un contrôle segmenté** | `--primary` plein (04, 06, 19), blanc + ombre (03), `--background` + anneau `--border` (17, 18, 20, 23, 24), `--secondary` (pagination de 12) | **`--background` + anneau 1 `--border`** sur un conteneur `--surface`. DESIGN §2.1 réserve `--primary` à l'action principale et à la sélection de navigation. Pas d'ombre. Hauteurs 26 et 24. **Confirmé par l'utilisateur le 2026-11-07.** |
| I6 | **Puces de filtre** | 26 (13-15), 28 (17, 22-25), 32 (05, 08) | **28**. |
| I7 | **Pastille d'identifiant** | Rayon 5 ou 6, marges 2 6 ou 3 6 ou 3 8, mono 11 à 13, hauteur 20 ou 22 | Hauteur 22, rayon **6** (jeton `--radius-md` ; 5 n'est pas un jeton), mono 12/500. `sm` 20 en mono 11 dans les listes denses. |
| I8 | **Rayon des cartes et panneaux** | 8 (code, DESIGN « 8–10 »), 10 (sous-cartes), 12 (05-25, majoritaire), 14 (carte projet, grands blocs, dialogue) | Carte et panneau **12**. Sous-carte et ligne **10**. Dialogue **14**. La carte projet (14 sur la 08) descend à 12. Corriger DESIGN §5 et ajouter les jetons 10 et 14 (§3). |
| I9 | **Rayon des alertes** | 8 (DESIGN, 04), 10 (09-25), 12 (bandeau de 07) | **10** pour `InlineAlert`, 12 pour `banner`. Corriger DESIGN §5.1 (« rayon 8 »). |
| I10 | **Initiales d'avatar et de tuile** | 12/600 (DESIGN), 13/500 (code), 14/700 (05), 13/700 (13-15, 22), 12/700 (24) | **12/700** jusqu'à 32, **14/700** au-delà. Corriger DESIGN §5.4 (sélecteur d'organisation). |
| I11 | **Dialogue** | Largeur 460 (21) ou 520 ; ombre 0 18 44 .20 ou 0 24 60 ; voile .34, .38 ou .45 ; flou sur 21 et 22 seulement ; titre 15 (21) ou 18 ; fond `--raised` (08) ou `--background` (17, 22) | 520, rayon 14, `--raised`, `--shadow-dialog` (0 18px 44px .20), voile `--overlay` .38 + flou 6 sous `motion-safe`, titre 18/600. |
| I12 | **Tiroir** | 380 à 440 (DESIGN, code 440), 540 (formulaires), 620 (ticket) ; ombre -12 0 32 .18 ou -16 0 40 .22 | Trois tailles (440, 540, 620). Une seule ombre `--shadow-sheet` (-16px 0 40px .2). |
| I13 | **Onglets soulignés** | 36 (DESIGN, 05), 38 (09-16), 40 (tiroir de 23) ; inactif en 400 ou 500 | **36** (déjà livré par TK-88, 2 px invisibles), 14/500. Dans un tiroir : `sm` 36 en 13 px. Documenter l'écart à 09-16. |
| I14 | **Piste de progression** | `--border` (01), `--border-strong` (05-25) ; hauteur 4, 5, 6 ou 8 | `--border-strong`. `ProgressBar` 6 (ou 8 en `lg`). `SegmentedGauge` 4 à 6. |
| I15 | **Traits de phase miniature** | 14 × 4 (04, DESIGN `sm`), 12 × 4 (barre de 05, 10, 13-15, 22), 10 × 4 (pastille de 05, 07, 08) | `sm` encadré : 14. `inline` et `PhasePill` : **12**. Pas de 10. |
| I16 | **Crans du cycle de vie** | 5 (code, B27), 6 (04) | 5 (B27). Clore le point. |
| I17 | **Lignes de navigation** | 30 (01), 38 (03), 36 et 32 (05-25) ; barre de 240, 248 ou 256 ; Réglages 240 ou 250 | DESIGN fait foi (36/32, barre de 256, Réglages 240). Écarts documentés. |
| I18 | **Actif de la navigation des Réglages** | DESIGN §5.4 : « sur `--surface` en 600 » ; planche 24 et code : `--secondary` | `--secondary` 600, texte `--foreground`. Corriger DESIGN §5.4. |
| I19 | **h2 de section** | 16 (DESIGN, 07), 15 (13), 20 (24 Réglages) | **Décidé par l'utilisateur le 2026-11-07 : 20 px dans les Réglages** (jeton `text-settings-title`, 20/600), comme la planche 24 ; 16 ailleurs. Les titres de carte passent en 15/600 (`text-card-title`, voir §3). |
| I20 | **État vide** | DESIGN : une seule action, centré, encadré ; 10-15 : deux actions + note `lock`, parfois aligné à gauche ; 12 : sans cadre ni tuile | Une action principale **plus au plus une secondaire** (le chemin manuel), une note facultative, variantes `inline`, `start` et `compact`. Corriger DESIGN §5.1. |
| I21 | **Taille de page de la pagination** | DESIGN : `Select` ; 12 : contrôle segmenté « Lignes par page » | Contrôle segmenté (la planche fait foi). Corriger DESIGN §5.3. |
| I22 | **Pied de liste en chargement** | DESIGN : sans icône, squelettes dans le pied ; 12 : `progress_activity` + squelettes de ligne dans la liste | La planche fait foi. Corriger DESIGN §5.3 (et la description encore encadrée et centrée du pied). |
| I23 | **Icône de l'agent** | `auto_awesome` sur toutes les planches, absente de `@material-symbols/svg-400@0.48.2` ; DESIGN prend `smart_toy` pour l'Assistant | **Décidé par l'utilisateur le 2026-11-07 : `wand_stars`** pour les actions de l'agent (proposer, proposition, relecture) ; `smart_toy` reste à l'Assistant de cadrage. Inscrire la correspondance dans DESIGN §4. |
| I24 | **Chevron de dépliage** | `expand_more` (planches), absent du jeu | `keyboard_arrow_down`, déjà employé. Inscrire la correspondance dans DESIGN §4. |
| I25 | **Rouge et vert en sombre** | Rouge #4c1515 (23) ou #7f1d1d (`--status-revise-bg`) ; coche verte #86efac (08) ou #bbf7d0 | Garder les jetons de statut (#7f1d1d, #bbf7d0). Les valeurs isolées ne créent pas de jeton. |
| I26 | **Carte radio choisie** | Bordure 1 (17, 22) ou 2 (24) ; fond `--diff-bg` (08, 22) ou aucun | Bordure 1 `--primary` + anneau interne de 1 (2 au total, sans décalage), fond `--diff-bg`. |
| I27 | **Bloc de code** | Fond sombre fixe #0a1411 (02), `--surface` (13-14, 23-24) ; Geist Mono (02, 03) ou JetBrains Mono | `--surface`, JetBrains Mono. |
| I28 | **Libellé du bouton de rail** | « Déplier la barre latérale » (05), « Étendre la barre » (code) | « Déplier la barre » (audit TK-88 n° 10). |
| I29 | **Fil d'Ariane des pages d'organisation** | DESIGN : « h1 simple » ; 24 : « Atelier Lumière / Réglages / section » | Retenir le fil de la 24 dans `PageHeader` (facultatif), et corriger DESIGN §5.4. |

## 3. Jetons manquants

À ajouter dans `packages/ui/src/styles/*.css`, puis dans DESIGN §2 et §3. Les contrastes passent par `contrast.test.ts`.

**Couleurs**
- `--alert-success-bg / -border / -fg` : clair #f0fdf4 / #bbf7d0 / #14532d, sombre #0f2a1a / #14532d / #bbf7d0 (22, baseline posée). Utilitaires `bg-alert-success`, etc.
- `--method-get|post|patch|delete|put-bg / -fg` (09). Ces paires ne sont pas encore définies sur la planche pour le clair et le sombre. Proposition : GET cyan #cffafe / #155e75 (sombre #164e63 / #a5f3fc), POST = `--status-validated-*`, PATCH = `--status-pending-*`, DELETE = `--status-revise-*`, PUT = `--secondary`.
- `--hue-1..5-bg / -fg` : 5 teintes douces des tuiles de projet et d'organisation (violet, cyan, vert, ambre, rose ; 05, 07, 08), en clair et en sombre. La teinte se calcule à partir de l'identifiant.
- `--overlay` : rgb(13 11 28 / .38) (voile des dialogues et des tiroirs). En sombre : rgb(0 0 0 / .55).
- `--avatar-agent` : alias de `--primary` / `--primary-foreground`, pour ne pas confondre agent et marque dans le code.
- Kanban et Gantt (23) : « aujourd'hui » = `--secondary`, « en retard » = `--destructive`. Pas de nouveau jeton.

**Ombres**
- `--shadow-dialog` : 0 18px 44px rgb(20 16 43 / .20). En sombre : none (la bordure suffit, comme `--shadow-floating`).
- `--shadow-sheet` : -16px 0 40px rgb(20 16 43 / .20). En sombre : none.
- `--shadow-toast` : 0 8px 24px rgb(20 16 43 / .25). En sombre, garder une ombre légère (le toast est inversé).

**Rayons**
- `--radius-card` (ou `rounded-[--radius-10]`) : **10** (aperçus, lignes, sous-cartes, toast, carte radio). Aujourd'hui absent, bien que cité par DESIGN §5.
- `--radius-dialog` : **14** (dialogue).

**Typographie** (dans `typography.css`, exposée par `@theme`)
- `text-card-title` : 15/600 (titres de carte, d'état vide en grand, de bandeau ; 10-15, 22).
- `text-dialog-title` : 18/600 (dialogue, tiroir).
- `text-stat` : 24/600, -0,02 em (valeur de `StatCard` : 22 à 26 sur les planches, ramené à 24).
- `text-count` : 11/600 (compteurs, `Pill sm`). À distinguer de `text-group-label`, qui porte les capitales et +0,06 em.
- `text-code-sm` : JetBrains Mono 11/500 (numéros de la barre, `Kbd`, `IdTag sm`, méthode HTTP).
- `text-prose-h2` 28/600 -0,02 em, `text-prose-h3` 18/600, `text-prose` 15 / interligne 1,65 (06, 13-15).
- Supprimer les tailles arbitraires restantes : `text-[13px]` dans `table.tsx` et `avatar.tsx`, `text-xs` dans `badge.tsx`, `text-sm` et `text-base` dans `alert.tsx`, `input.tsx` et `tabs.tsx`.

## 4. Découpage en lots ordonnés

Principe : un composant est livré avec le premier lot qui en a besoin. Le lot **Bases** regroupe ce dont les écrans déjà livrés (TK-87, 88, 94, 97, 98) ont besoin pour être conformes, plus les primitives présentes sur de nombreuses planches. Chaque lot met aussi à jour `/dev/ui`, DESIGN.md (incohérences tranchées) et les tests de contraste.

### Lot 0 · Bases (L). À découper en trois tickets

**B1 · Jetons et primitives (L)**
- Jetons du §3 : couleurs `alert-success`, `overlay`, ombres, rayons 10 et 14, typographie.
- `Icon` : tailles 14 et 24, `tone`, 21 icônes au registre, décision I23.
- `Button` : marges, `xs` et `lg`, `dashed`, `inherit`, `link`, `icon`, `shortcut`, `loading`, `pressed`, `fullWidth`.
- `IconButton` en 32 et variante d'envoi. `Kbd`. `Spinner`.
- `Pill` (évolution de `Badge`) avec `CountBadge` et `Dot`. Recalage de `STATUS_PILL`, `ValidationStatus`, `DeliverableStatus` et `LifecycleStatus`. `RolePill`.
- `IdTag` (avec la variante `pill` de modèle).
- `FilterChip` et `OptionChip`. `SegmentedControl`. `Switch` et `SwitchRow`. `Checkbox`. `RadioGroup` et `RadioCard`.
- `Input` (40 et 36, désactivé), `SearchField`, `Textarea`, `Field` (obligatoire, facultatif, erreur), `Select` (40).
- `Avatar` (tailles, tons, `tile`). `IconTile`.

**B2 · Surfaces et retours (M)**
- `Card` (variantes `panel`, `inset`, `interactive`, `proposal`, `dashed`, `warning`) et `StatCard`.
- `ProgressBar`.
- `InlineAlert` : écart, rayon 10, `success`, actions en boutons. Dépréciation d'`Alert`.
- `EmptyState` : écart et `inline`.
- `Skeleton` et `SkeletonRow`.
- `Toast`, `Dialog` et `AlertDialog`.
- `Sheet` : tailles 540 et 620, en-tête et pied.
- `Tabs underline` (extraction de `HeaderTabs`).
- `Table framed` (avec `YesNoCell`, `dense` et en-tête collant).

**B3 · Listes et navigation (M)**
- `Pagination`, `VirtualList` (`framed`, `loadingRows`), `CountBar`, `ListFooter`, `GroupSection` (`stacked`).
- `ListRow` et `ListPanel`.
- `ProjectHeader` (emplacement `status`, résumé en ligne, écart des « / ») et `PageHeader`.
- `PhaseRail inline`.
- `ShellNavGroup` et `ShellNavItem count`, libellé « Déplier la barre ».
- `SecondaryNav` et `NavItem`.

Migration `apps/web` dans la foulée :
- Remplacer `PILL` (`ai-providers-list`), `TicketCount` (`sidebar-nav`), le compteur de `project-header` et celui d'`ai-usage-models`.
- Remplacer `switch-row`, `ai-fallback-switch`, `theme-choice`, `dev-ui-theme-switch`, `AiSectionCard`, `settings-nav`, les lignes de `features-list`, `pending-invitations` et `ai-providers-list`, le cadre de `members-table` et de `role-matrix`, et le `role=status` de `ai-settings-page` (remplacé par `Toast`).
- Corriger les écarts des cinq audits.

### Lots suivants (dans l'ordre des sprints)

| Lot (planches, sprint) | Composants livrés avec le lot | Taille |
|---|---|---|
| 1 · Idée (06, sprint 020) | `AgentProposal` + `DecisionNotice` (migration de `framing-proposal-card`), `AgentComposer` (+ `InputGroup`), `ChatThread` / `ChatBubble` / `AgentPanel`, `Prose`, `ReorderableList` + `PageStatus` + `StatusLegend`, `TaskItem`, `AvatarGroup`, `SegmentedGauge` (maturité du dossier), `Button dashed` mis en usage | L |
| 2 · Vue d'ensemble et Projets (07, 08, sprint 021) | `InlineAlert banner` (« Prochaine étape »), `DeliverableCard`, `ActivityFeed` / `PersonRow`, `PhasePill`, `ProjectCard` + `ProgressChecklist`, teintes `--hue-*` des tuiles, section « Récents » de la barre | M |
| 3 · Fonctionnel et Assistant (09, 10, 16, 21, sprints 022-023) | `AgentProposeButton` (5 états + dialogue d'options), `ReviewModeBar`, `FormSheet`, `TagInput`, `Field agentFilled` + marqueur agent, `MasterDetail`, `MethodBadge` + jetons `--method-*`, `ScreenCard`, `FlowSteps` / `StateChain`, `EmptyState` avec action secondaire, note et `start`, `TicketStatus` (état métier libre) | L |
| 4 · Données (11, sprint 024) | Kit de diagramme : `DiagramCanvas`, `Edge`, `ZoomToolbar`, `DiagramLegend`, fil de zone ; mise aux mesures de `ZoneNode` et `DiagramMinimap` | M |
| 5 · Architecture (13, sprint 025) | `ComponentNode` (acteur, application, service, stockage, file, externe), diagramme de séquence, `CodeBlock`, types d'`EntityChip` component, adr et nfr, `EntityChipGroup` | M |
| 6 · Technique et Sécurité (14, 15, sprint 026) | Types d'`EntityChip` permission et test, `Table dense` de comparaison, `Pill dashed` (« Externe ») mis en usage. Le reste est du réemploi. | S |
| 7 · Design (17, 18, 19, sprints 027-029) | `ProposalDiff`, `PreviewFrame`, `CommentPin`, outils de charte (`SwatchRow`, `RadiusSample`, `ContrastBadge`), `NumberBadge` | L |
| 8 · Qualité (20, sprint 030) | Réemploi (`Table framed`, `Pill`, `AgentProposeButton`) | S |
| 9 · Baseline 0 (22, sprint 031) | `Stepper`, `Timeline`, `DefinitionList`, `InlineAlert success` avec tuile | M |
| 10 · Tickets (23, sprint 032) | `KanbanColumn` / `TicketCard` (reprise de `kanban-card`), `Gantt`, `Select` à option sur deux lignes avec point, `CopyField`, `Timeline` compacte, `Tabs underline sm` dans le tiroir de 620 | L |
| 11 · Agents et Réglages, suite (24, sprints 033-034) | Réemploi (`CopyField`, `CodeBlock`, `Tabs` en `tablist`, `RadioCard`, `Switch`) | S |
| 12 · Recette (25, sprint 035) | Réemploi (`Stepper`, `StatCard`, `DefinitionList`, `FormSheet`) | S |
