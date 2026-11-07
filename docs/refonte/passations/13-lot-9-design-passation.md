# Refonte UI · Lot 9 · Spec · Design : passation à l'agent dev

> Validé par Brice le 05/11/2026 après recette visuelle (« le lot capital, celui qui a conduit à tout le projet »).
> Maquettes de référence : canevas « Koklo — maquettes » (copie locale qui fait foi : `docs/refonte/maquettes/17-Lot9Design.html` ; `docs/refonte/maquettes/18-Lot9aStudio.html` ; `docs/refonte/maquettes/19-Lot9bParcours.html` ; lire le code avec `pnpm maquette <numéro>`), trois planches lues dans cet ordre :
> 1. **Lot 9 · Design · page du livrable** : stepper Design system → Règles UI/UX → Écrans (inventaire puis conception) → Parcours. Sélecteurs de maquette : Inventaire proposé, Conception, Design system, Règles ; Démo / **Volume réel** (référence).
> 2. **Lot 9a · Studio d'écran** : un écran (S-creneaux) en conception.
> 3. **Lot 9b · Parcours jouable** : le parcours P-01 joué écran par écran, équipe et vue client.
> À lire avant : `koklo-conception-v0.6.md` (§ design : tokens DTCG, composants neutres, arbre de nœuds, opérations typées, moteur de règles), `lot-8-technique-passation.md` (§8 corrections), `principe-listes-longues.md`, `principe-creer-modifier.md`.
> Prérequis : lots 5 à 8 (le design consomme fonctionnalités, critères, parcours, données, opérations d'API, exigences).

Ce lot livre **Spec · Design** (route `/projects/[id]/spec/design`). Le design d'un produit client se construit **dans l'ordre** : la charte (design system), les règles UI/UX qui s'appliquent, l'**inventaire des écrans** proposé par l'agent et trié par l'équipe, puis la **conception écran par écran** (jamais tout d'un coup), enfin les **parcours jouables** que le client valide écran par écran. Pas de canevas libre : tout se modifie par panneau de propriétés et par opérations typées.

## 1. Format dans le dépôt de spec

| Fichier | Contenu | Rôle |
|---|---|---|
| `design/tokens/core.json` | rampes de couleurs, tailles brutes (DTCG) | source, jamais référencé par un composant |
| `design/tokens/semantic.json` | tokens d'usage (`color.text.muted`, `space.4`, `radius.lg`, `font.title`, `duration.base`…) avec valeur claire et sombre (alias vers core) | source |
| `design/components/C-*.json` | composant neutre : niveau (primitive / composite), props, variants, états, slots, tokens utilisés | source |
| `design/rules.yaml` | paquets actifs, référentiel (WCAG 2.2 AA), sévérités surchargées, règles projet | source |
| `.koklo/waivers.yaml` | dérogations : règle, cible (`écran › nœud`), justification, auteur, date, échéance | source |
| `design/screens/inventory.yaml` | inventaire : écran, parcours, étape, fonctionnalités, rôle, viewport principal, états attendus, statut (`propose`, `accepte`, `rejete`) | source |
| `design/screens/S-*.json` | arbre de nœuds annotés, états, viewports, interactions | source (écrit par opérations) |
| `design/flows/P-*.yaml` | parcours jouable : étapes, scénarios (lien au critère d'acceptation), état et fixture par étape, branches de retour | source |
| `design/fixtures/*.yaml` | jeux de données des écrans | source |
| `design/assets/` | logos, illustrations, images (fournies ou générées puis validées) | source |

Toute écriture passe par un lot d'opérations `OPB-nnn` = un commit (trailer `Koklo-Ops`).

## 2. Page du livrable (planche 1)

### 2.1 En-tête et stepper
- Fil « Portail / Spec / Design », h1 « Design », statut + résumé (ligne du titre, actions à droite, §8.4 du lot 8).
- **Stepper 4 étapes** (cartes de 52 px min., grille `flex:1 1 200px`) : numéro dans une pastille 26 px, libellé 13/600, sous-titre 12 px tronqué, icône d'état à droite (`check_circle` plein vert = fait, `pending` primaire = en cours, `radio_button_unchecked` = à venir). Étape courante : contour `--primary` + halo 3 px `--soft`. Le stepper **remplace les onglets** sur cette page.
- Sous-titres : « Charte validée · 82 tokens · 18 composants » ; « 5 paquets · 26 règles · WCAG 2.2 AA » ; « 19 propositions à trier » / « 3 conçus sur 23 · un à la fois » ; « Jouables quand leurs écrans sont conçus ».
- La navigation latérale garde Design « En cours » ; Qualité verrouillé « Disponible après le design ».

### 2.2 Étape 1 · Design system
- Colonne gauche 220 px : Couleurs, Typographie, Espaces · rayons · mouvement, Composants, Assets (compteurs) ; en pied, rappel « Les composants n'utilisent que les tokens d'usage ; les écrans n'utilisent que des composants » + chemins.
- Bandeau charte : logo client, « Charte <client> · v1 », origine (« Proposée par l'agent depuis le logo et la page Identité du dossier d'idée, validée par … »), héritage de la bibliothèque de l'organisation, **bascule Clair / Sombre de l'aperçu** (thème du produit client, indépendant du thème Koklo).
- **Proposition de l'agent** (encadré pointillé `--primary`, marges du §8.3 lot 8) : corriger un token en échec de contraste, avec les ratios avant → après calculés et la portée (« touche 31 nœuds sur 4 écrans »). Accepter = lot d'opérations `token.set`, toast avec n° d'OPB et règle résolue.
- **Couleurs** : rampes core en bandes (survol = nom + hex) ; tableau des tokens d'usage : nom mono, usage, valeur clair (pastille + alias), sombre, **contraste calculé réellement** (WCAG, « 14,8 · 16,6 (min 4,5) ») contre le token de fond déclaré ; pastille verte / rouge ; tokens décoratifs « Non vérifié · décoratif ». Ligne visée par la proposition : fond `--diff-bg` + filet gauche 3 px.
- **Typographie** : token, spécification (famille · taille/interligne · graisse), échantillon réel dans la police du client.
- **Espaces, rayons, mouvement** : barres proportionnelles, carrés arrondis, durées / courbes ; `motion.reduced` obligatoire.
- **Composants** : grille de cartes, aperçu **rendu aux couleurs du client** (thème de l'aperçu), id mono, niveau (Primitive contour / Composite `--soft`), méta « variants · états · nb d'écrans ».
- **Assets** : vignette, id de fichier, origine (fourni par le client, proposé par l'agent et validé, hérité de l'organisation).

### 2.3 Étape 2 · Règles UI/UX
- Colonne gauche 280 px : **paquets** Socle Koklo (toujours actif, interrupteur grisé), Accessibilité, Cohérence, Marque, Projet ; chaque ligne : icône, nom, « n règles · sous-titre · k en défaut », interrupteur. Encadré **Référentiel d'accessibilité** : sélecteur « WCAG 2.2 niveau AA », note RGAA à confirmer, « les contrôles automatiques ne remplacent pas un audit humain ».
- Centre : titre du paquet + description ; tableau Règle (id mono + cadenas si non dérogeable) · Ce qu'elle vérifie · **Sévérité** (pastille-menu Erreur rouge / Avertissement ambre / Info `--soft`) · En défaut (« 1 écran » coloré ou « Aucun »).
- Paquet **Projet** : « Nouvelle règle » + encadré « L'agent propose 2 règles tirées du dossier d'idée » (citation de la source), Ajouter / Ignorer par règle ; ajoutée → apparaît dans le tableau.
- **Dérogations** : règle, cible `écran › nœud`, justification, auteur · date · échéance (« jusqu'à la Baseline 0 »). Une règle cadenassée ne se déroge pas.
- Règles de référence de la maquette (à reprendre) : `core.etats-obligatoires`, `core.tokens-uniquement`, `core.composants-declares`, `core.lien-fonctionnalite`, `core.donnee-liee`, `core.action-liee`, `core.viewports` ; `a11y.contraste-texte`, `a11y.contraste-ui`, `a11y.cible-tactile`, `a11y.nom-accessible`, `a11y.focus-visible`, `a11y.couleur-seule`, `a11y.ordre-titres`, `a11y.mouvement-reduit` ; `coh.libelle-action`, `coh.action-principale`, `coh.position-cta`, `coh.formats-fr` ; `mq.*` ; `pr.*`.

### 2.4 Étape 3 · Écrans
**a) Inventaire proposé** (avant toute conception)
- Bandeau `--diff-bg` : « Inventaire proposé par l'agent · 24 écrans tirés des parcours, des fonctionnalités et des rôles. Rien n'est conçu à cette étape… » + bouton principal « Enregistrer N écrans et passer à la conception » (désactivé tant que 0 accepté).
- Groupes **par parcours** (P-01…, puis « Hors parcours ») : en-tête (icône `route`, titre, id, rôle · plateforme · nb d'écrans, « Accepter les n » si plusieurs en attente). Ligne : n° d'étape (1.3), id mono `--soft`, titre 600, « F-003 · portail · 390 px d'abord », **états prévus** en petites étiquettes, Accepter / Rejeter ou pastille Accepté / Rejeté (ligne estompée).
- Proposition douteuse mise en évidence (fond `--diff-bg`) avec la raison (« Proposé par prudence : le parcours actuel ne demande pas de compte ») ; exclue du « Accepter les n ».
- Colonne droite « Couverture » : fonctionnalités, parcours, rôles (barres vert / ambre), nombre d'états déclarés ; encadré ambre pour une fonctionnalité sans écran (« F-005 reportée »).

**b) Conception, un écran à la fois**
- Bandeau « File de conception · un écran à la fois » : texte (« 3 écrans conçus sur 23. Prochain dans l'ordre des parcours : S-coordonnees… vous relisez avant de lancer le suivant »), barre de progression, **« Concevoir l'écran suivant »**. Pendant la conception : bouton désactivé « Conception en cours… », carte de l'écran en cours avec contour `--primary`, halo, `progress_activity` « L'agent conçoit… ». À la fin : toast « S-xxx est conçu · 0 erreur, 1 avertissement · ouvrez-le pour le relire », statut « À relire ».
- **Une seule conception d'agent à la fois par projet** (verrou serveur). L'ordre suit l'inventaire et peut être modifié.
- Filtres en pastilles : Tous, À relire ou corriger, Chez le client ou validés, À concevoir.
- **Cartes** des écrans conçus (grille `minmax(220px,1fr)`) : miniature rendue (cadre téléphone 92×164 ou ordinateur 210×124 sur fond pointillé), pastille rouge du nombre d'erreurs, id + titre, statut (**Validé client** vert, **Chez le client** `--soft`, **À corriger** rouge, **À relire** ambre, **Conception…**), « P-01 · 390 ». Clic → studio (planche 2).
- **À concevoir** : liste compacte numérotée (grille 2–3 colonnes) id, titre, parcours · viewport ; le prochain porte « Suivant » et un fond `--diff-bg`.

### 2.5 Étape 4 · Parcours
Liste des parcours : id, titre, « 3 écrans conçus sur 5 · 3 scénarios », points par écran (plein = conçu), **« Jouer le parcours »** actif seulement quand tous ses écrans sont conçus, sinon « Jouable une fois conçu » (pointillé).

## 3. Studio d'écran (planche 2, lot 9a)

- Barre : retour « Écrans », id + titre, statut, **État** (Données, Chargement, Vide, Créneau pris…), **Viewport** (390 / 744 / 1280, cadre mis à l'échelle sans rétrécir, `flex:0 0 auto`, `transform-origin: top left`), **Thème** du produit, « Envoyer au client » **actif seulement à 0 erreur** de règle.
- Gauche : **calques** (arbre de nœuds `n-*` avec composant, pastille d'annotation, icône de diagnostic).
- Centre : rendu réel depuis la spec (« Rendu depuis la spec · version … »), état manquant affiché comme « État exigé par les règles, pas encore conçu ».
- Droite, 4 onglets : **Propriétés** (props du composant, « Style (tokens) » liés par `node.bindToken`, interactions du vocabulaire fermé, journal des opérations), **Annotations** (pastilles : fonctionnalité + critère, donnée `T-…`, opération, règle métier `R-…` — « le délai vient de R-002, jamais écrit en dur »), **Règles** (diagnostics ; correctifs **classés par portée** : ce nœud seulement / le composant / le token global), **Agent** (lot proposé `OPB-nnn` de n opérations décochables, comparaison Avant / Après, Appliquer / Rejeter).
- Commentaire client sur un nœud visible dans le studio (fil, réponse de l'équipe).

## 4. Parcours jouable (planche 3, lot 9b)

Route `/projects/[id]/spec/design/flows/[P-id]` (mode plein écran, sans barre latérale du projet).
- **Barre haute** : ← Design, id + titre du parcours, méta (« 5 écrans · 3 scénarios · version a41c9e2 » ; client : « Vue client · <nom> · version »), bascule maquette Équipe / Vue client, **viewport** (mobile, tablette, ordinateur en icônes), **thème du produit** Clair / Sombre, thème Koklo, action principale (**Partager avec le client** ; client : **Envoyer mes retours**).
- **Gauche 268 px** : **Scénarios** (`design/flows/P-*.yaml`, liés à un critère d'acceptation : « Cas nominal », « Créneau pris entre-temps », « Journée complète ») ; **Étapes** du scénario : n°, titre, `id · état`, compteur de commentaires ouverts, icône de validation client ; une étape de **retour arrière** est décalée de 14 px avec « ↺ ». Pied : « Validé par le client 2 / 5 », barre verte, « Chaque validation est liée à la version … ; si un écran change, sa validation repasse À revoir ».
- **Centre** (fond pointillé) : ligne « S-creneaux · Créneau pris » + action de l'étape (« Revient aux créneaux, garde sa saisie, choisit 11:30 ») + interrupteur **Zones cliquables** (contour pointillé `--primary` 2 px, décalage 3 px, sur ce qui fait avancer). Cadre téléphone 390×800 (bord 10 px, rayon 52) ou cadre tablette 744 / ordinateur 1280 mis à l'échelle ; l'écran est **rendu depuis la spec** avec la fixture et l'état de l'étape ; bouton principal collé en bas sur mobile. **Pastilles de commentaire** à droite du nœud commenté (numérotées, gris si résolues). Sous le cadre : Précédent · « 5 / 7 » · Suivant · Recommencer. Cliquer sur l'élément actif de l'écran avance aussi.
- **Droite 360 px**, onglets : **Scénario** (réf. « SC-02 · F-003, critère 4 », titre, description ; lignes Étant donné / Et / Quand / Alors, la ligne qui couvre l'étape courante surlignée `--soft` ; encadré « Cet écran » : écran, état, fonctionnalité, composants, opération d'API, règles), **Commentaires** (fil par nœud `S-… › n-… · C-…`, réponses de l'équipe, « Résolu »), **Données** (fixtures utilisées et variante du scénario, ex. « étape 4 : 11:00 passe à pris (409) »).
- **Vue client** : bouton « Cliquer sur l'écran pour commenter » (mode épinglage : le clic sur un nœud crée le commentaire ancré), pied « Cet écran vous convient pour la version … ? » + **Valider cet écran** / **Demander un changement** (boutons `flex:1`, sans retour à la ligne). Le client ne voit ni YAML, ni calques, ni règles.

## 5. Validation

- Design system et règles : validés par l'équipe (owner, admin, designer) ; le client voit la charte en lecture.
- **Écrans : validés par le client un par un**, chaque validation liée au SHA (`design_validation { screenId, sha, by, at }`). Toute opération ultérieure touchant l'écran (ou un token / composant qu'il utilise) → « À revoir ».
- Le livrable Design est « Validé » quand tous les écrans de l'inventaire accepté sont validés et sans erreur de règle ; **6 Qualité** passe « Prêt ».

## 6. Contrat

| Procédure | Usage |
|---|---|
| `design.tokens.list()`, `design.components.list()`, `design.assets.list()` | Design system |
| `design.contrast({ tokens })` | ratios clair / sombre (calcul serveur, même code que la règle) |
| `design.rules.get()`, `.rules.setPack({ pack, on })`, `.rules.setSeverity`, `.waivers.list()` | Règles |
| `design.inventory.get()`, `.inventory.decide({ screenId, decision })`, `.inventory.coverage()` | Inventaire |
| `ai.proposeInventory()` | propositions d'écrans (`screen.propose`) |
| `ai.designScreen({ screenId })` | **un écran**, refusé si une conception est en cours (`409 design_in_progress`) ; flux d'avancement |
| `design.screens.list({ status?, cursor, limit })`, `.screens.byId`, `.screens.render({ screenId, state, viewport, theme, sha? })` | galerie, studio, miniatures |
| `design.lint({ screenId? })` | diagnostics + correctifs par portée |
| `design.flows.get({ flowId })`, `.flows.play({ flowId, scenarioId })` | parcours jouable (étapes, états, fixtures) |
| `design.comments.add({ screenId, nodeId, text })`, `.comments.reply`, `.comments.resolve` | commentaires ancrés |
| `design.validate({ screenId, sha })`, `.unvalidate` | validation client |
| `specBatch.submit` | `token.*`, `component.*`, `node.*`, `screen.*`, `annotation.*`, `interaction.*`, `rule.*`, `waiver.*`, `flow.*` |

## 7. Droits

| Action | Owner / admin | Designer | Développeur | Client |
|---|---|---|---|---|
| Modifier charte, règles, écrans | oui | oui | lecture + commentaires | non |
| Trier l'inventaire, lancer « Concevoir l'écran suivant » | oui | oui | non | non |
| Déroger à une règle | oui | oui (non cadenassée) | non | non |
| Partager un parcours | oui | oui | non | — |
| Valider un écran | non | non | non | **oui** |
| Commenter un nœud | oui | oui | oui | oui |

## 8. Notes et corrections

- **Token du contraste** : la planche 9a nomme le token `color.text.disabled` ; le nom retenu est **`color.text.unavailable`** (créneaux pris, options indisponibles). Un élément désactivé est exempté du contraste par le WCAG, un créneau pris ne l'est pas : il doit rester lisible. Mettre à jour la maquette 9a et le texte de proposition en conséquence.
- Les ratios de contraste affichés sont **calculés**, jamais saisis (formule WCAG 2.x, luminance relative).
- La conception d'un écran par l'agent tourne dans le bac à sable (boucle agent de la conception v0.6) et ne produit qu'un lot d'opérations proposé ; rien n'est écrit sans relecture.
- Listes longues (principe) : inventaire et galerie paginés par parcours au-delà de 50 écrans ; tableau des tokens défilant avec en-tête collant.

## 9. Critères d'acceptation

- [ ] Stepper 4 étapes ; Design system (5 sections, contraste calculé, aperçus aux couleurs et au thème du client, proposition de l'agent appliquée par lot) ; Règles (paquets, sévérités, cadenas, dérogations, règles proposées).
- [ ] Inventaire proposé et trié avant toute conception ; couverture ; passage à la conception.
- [ ] File de conception : un seul écran conçu à la fois par l'agent, relecture avant le suivant ; galerie + liste « À concevoir ».
- [ ] Studio : calques, rendu par état / viewport / thème, propriétés liées aux tokens, annotations, règles avec correctifs par portée, lots d'opérations de l'agent, envoi au client à 0 erreur.
- [ ] Parcours jouable : scénarios liés aux critères, étapes de retour, zones cliquables, 3 viewports, thème du produit, commentaires ancrés, validation client par écran liée au SHA.
- [ ] Captures : chaque étape × état, équipe et client, clair, sombre, 375 px.

## 10. Tickets (format du vault)

```
- [ ] **[TK-?]** Lot 9a · Spec · Design system : formats design/tokens, components, assets ; page étape 1 (couleurs avec contraste calculé, typo, espaces, composants rendus, assets), propositions de tokens. Réf. design/refonte/lot-9-design-passation.md §1, §2.1, §2.2. — dépend du lot 8
- [ ] **[TK-?]** Lot 9b · Spec · Règles UI/UX : moteur de règles (paquets core, a11y, coh, mq, pr), sévérités, dérogations, design.lint. Réf. §2.3, §6. — dépend de 9a
- [ ] **[TK-?]** Lot 9c · Spec · Écrans : inventaire proposé (ai.proposeInventory, tri, couverture), file de conception un écran à la fois (ai.designScreen + verrou), galerie et miniatures. Réf. §2.4. — dépend de 9b
- [ ] **[TK-?]** Lot 9d · Studio d'écran : calques, rendu, propriétés/tokens, annotations, règles et correctifs, lots d'opérations de l'agent. Réf. §3. — dépend de 9c
- [ ] **[TK-?]** Lot 9e · Parcours jouable et validation client : design/flows, scénarios, lecteur, commentaires ancrés, validation par écran liée au SHA, étape 4 de la page. Réf. §2.5, §4, §5. — dépend de 9d
```
