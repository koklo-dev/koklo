# Refonte UI · Lot 5 · Spec · Fonctionnel (et socle de l'agent dans la spec) : passation à l'agent dev

> Validé par Brice le 05/11/2026 après recette visuelle.
> Maquette de référence : canevas « Koklo — maquettes » (copie locale qui fait foi : `docs/refonte/maquettes/10-Lot5Fonctionnel.html` ; lire le code avec `pnpm maquette <numéro>`), planche **Lot 5 · Fonctionnel (tous les états)**. Le sélecteur en pointillés en haut à droite (Prêt, Génération, Relecture, Liste · équipe, Vue client · validation) est propre à la maquette. Les 4 onglets sont cliquables dans chaque état ; en relecture, Accepter / Rejeter fonctionnent ; en vue client, Valider / Demander un changement fonctionnent.
> À lire avant : `design/refonte/decisions-2026-11-05-spec-sans-brief.md` (pas d'assistant séparé, pas de brief, barre « Spec », dossier figé `idea-vN`).
> Prérequis : lots 0, 1, 2c, 3.

Ce lot livre la page **Spec · Fonctionnel** (route `/projects/[id]/spec/functional`) avec ses 4 onglets, et **le socle commun** réutilisé par les lots 6 à 10 : `SpecCollection`, `ProposalReview` (mode relecture), `proposal.decide`, `spec.deliverables`, impact amont, validation client liée à une version. Il **remplace S-framing** (la fiche passe en « remplacée »).

## 1. Ce que le lot conserve de S-framing v1.1

Règle d'or (rien n'entre dans la spec sans clic humain), un appel IA à la fois, bloc Anthropic compacté (une ligne + « Détails »), gestion de toutes les erreurs IA (fiche v1.1 §4.5 à 4.10, en `InlineAlert` sous l'en-tête, un message à la fois), **texte brut absolu** pour toute valeur issue du modèle (fiche v1.1 §3.5 : jamais de Markdown ni de HTML rendu, jamais de lien construit depuis une sortie du modèle ; les seuls liens sont des `EntityChip` construits par l'application), récapitulatif avant enregistrement, un seul `specBatch.submit` par enregistrement.

## 2. Effets sur les lots précédents (à appliquer dans ce lot)

- **Barre (lot 1)** : retirer « Assistant de cadrage » ; `/projects/[id]/framing` redirige vers `/projects/[id]/spec/functional`. Groupe « Spec » tel que décrit dans le fichier de décisions (en-tête « SPEC » + compteur « N/6 », entrées numérotées sur une ligne, cadenas + infobulle pour les entrées indisponibles). Badge de l'entrée Fonctionnel : « N à relire » (`--primary`) pendant une relecture, sinon son statut (Prêt, En cours, À valider, Validé).
- `/projects/[id]/features` redirige vers `/projects/[id]/spec/functional?tab=features`.
- **Vue d'ensemble (lot 3)** : la carte « Cahier fonctionnel » de la grille lit son statut et son avancement dans `spec.deliverables`.

## 3. En-tête (`ProjectHeader`)

- Ligne 1 : « <projet> / Spec / Fonctionnel ».
- Ligne 2 : h1 « Cahier fonctionnel », statut du livrable en pastille, résumé 13 px, raison éventuelle (12 px, icône `info`), actions :

| État | Statut | Résumé | Actions |
|---|---|---|---|
| Prêt | Prêt (`arrow_forward`, `--secondary`) | « Rien encore · dossier figé idea-v1 disponible » | aucune dans l'en-tête (elles sont dans l'état vide) |
| Génération | Génération (`progress_activity`) | « Depuis idea-v1 » | Ajouter · « Proposer avec l'agent » désactivé |
| Relecture | En cours (`edit`) | « N propositions à relire » | Ajouter · Reproposer |
| Liste (équipe) | « À valider par le client · obligatoire » (ambre) ou « Validé par le client » (vert) | « 7 fonctionnalités · 4 règles · 3 rôles · 2 parcours · envoyé à <client> le <date> » | Relancer <prénom> · Proposer avec l'agent · **action principale selon l'onglet** (Nouvelle fonctionnalité / Nouvelle règle / Nouveau rôle / Nouveau parcours) |
| Vue client | « Validation attendue de votre part » (ambre) | progression « Fonctionnalités 5/7 · parcours 0/2 · règles et rôles 0/2 » | **« Valider le cahier »** (désactivé tant que tout n'est pas traité, raison « Traitez chaque onglet pour finir ») ; devient **« Envoyer mes demandes »** s'il y a au moins une demande de changement |

- Ligne 3 : **4 onglets** (vrais boutons ou liens `?tab=`), icône 16 + libellé + compteur en pastille : Fonctionnalités (`task_alt`), Règles métier (`gavel`), Rôles et permissions (`admin_panel_settings`), Parcours (`route`). En relecture, le compteur devient « N à relire » sur fond `--primary`. En vue client, une coche verte (validé) ou une icône `edit_note` rouge (changement demandé) apparaît sur un onglet entièrement traité.

## 4. États de la page

### 4.1 Prêt
`EmptyState` centré : icône `task_alt`, « L'agent peut proposer le cahier fonctionnel », « À partir du dossier d'idée figé idea-v1 : fonctionnalités avec critères d'acceptation, règles métier, rôles et permissions, parcours. Vous relisez tout avant que rien n'entre dans la spec. », actions « Proposer le fonctionnel » (principal, `auto_awesome`) et « Ajouter à la main », ligne Anthropic compacte dessous.

### 4.2 Génération
Bandeau `role="status"` (fond `--diff-bg`) : « L'agent rédige le cahier fonctionnel à partir des N pages du dossier. Cela peut prendre une minute. Vous pouvez quitter la page. » + « Annuler l'attente ». La génération se poursuit côté serveur si l'utilisateur quitte la page ; au retour, la page s'ouvre en relecture. Squelettes de lignes (`motion-safe:`).

### 4.3 Relecture (`ProposalReview`, socle commun)
- **Bandeau** sous l'en-tête (fond `--diff-bg`, `role="status"`) : icône `auto_awesome`, « **Mode relecture** · l'agent propose N éléments depuis idea-v1 · A acceptés · P à relire », « Enregistrer A dans la spec » (principal ; remplacé par « Acceptez au moins une proposition pour enregistrer. » à 0), « Quitter la relecture » (les propositions restent en attente).
- **Liste** (330 px) des propositions de l'onglet courant : identifiant en chip mono, titre 600, icône d'état (À relire `schedule` ; Acceptée `check_circle` remplie `--primary` ; Rejetée `cancel`, ligne à 60 %), ligne 12 px (« Fonctionnalité · Indispensable · 2 critère(s) », « Règle · contrainte », « Rôle · 4 permissions », « Parcours · 5 étapes »). Proposition affichée : fond `--secondary`, contour `--primary`.
- **Détail** : identifiant, titre 20/600, statut ; **justification de l'agent** en une phrase avec `auto_awesome` (provenance dans le dossier : « Tiré de Vision et Périmètre… ») ; puis selon le type :
  - fonctionnalité : priorité (`PriorityIndicator`), description, critères dans des cartes « AC-n · titre » avec Étant donné / Quand / Alors en gras ;
  - règle : « Type : contrainte | calcul | workflow à états », énoncé, encadré « Exemple » ;
  - rôle : description, liste « Permissions » (une ligne par permission, avec la restriction entre parenthèses) ;
  - parcours : acteur, liste « Étapes » (point de départ puis écrans).
  Puis les liens (`EntityChip`), la barre « Accepter (A) · Modifier · Rejeter (R) » + champ « Demander une modification à l'agent » sur la même ligne (`ai.reviseProposal` sur cette proposition seule ; différence affichée jusqu'à décision), et après décision « Remettre à relire ». Ligne d'aide 12 px « J / K : suivante / précédente · A : accepter · R : rejeter ».
- Accepter / Rejeter passe à la proposition suivante à relire de l'onglet. « Enregistrer » enregistre **tous les onglets** en un seul lot (récapitulatif en ligne groupé par onglet avant `specBatch.submit`), puis la page passe en Liste.

### 4.4 Liste · équipe (`SpecCollection`, socle commun)
- **Fonctionnalités** : recherche (titre ou `F-nnn`) + filtres en puces pointillées (Validation, Priorité, Avancement) ; liste en lignes de 52 px dans un cadre rayon 12 : chip `F-nnn`, titre 500 + ligne 12 px (nb de critères · liens), `PriorityIndicator`, `ValidationStatus`. Ligne sélectionnée : fond `--secondary`. **Fiche ancrée à droite** (380–440 px, bordure gauche) : identifiant + validation + « Modifier », titre 20/600, `LifecycleStatus`, description, « Critères d'acceptation » (une ligne par critère, icône `checklist`), « Liens », commentaire du client s'il a demandé un changement (carte `--surface` avec avatar ambre, « Marie Lefèvre · demande de changement »), pied 12 px « Proposée par l'agent, acceptée par Awa le 4 nov. · Enregistrée dans la spec · features/F-002.md ».
- **Règles métier** : phrase d'aide 13 px « Une règle métier est une vérité du domaine que le produit doit toujours respecter. » + légende des 3 types (pastilles contour avec icône : `block` Contrainte, `calculate` Calcul, `account_tree` Workflow à états). Grille de cartes `minmax(420px, 1fr)` : chip `R-nnn`, titre 15/600, type en pastille `--secondary` ; **énoncé** dans un encadré `--surface` ; pour un workflow, les **états dessinés** (état initial plein `--primary`, flèche, états finaux en contour) ; « Exemple » ; « Appliquée par » + chips `F-nnn`.
- **Rôles et permissions** : cartes de rôle (tuile 40 px colorée avec icône, nom, `RL-…` mono, description) puis **matrice « Qui peut faire quoi »** (`table` avec `caption`) : une ligne par permission (libellé + code `PM-ressource.action` mono 11 px), une colonne par rôle ; cellule = `check_circle` vert (autorisé), `check_circle` `--primary` + texte (autorisé avec restriction : « Les siennes », « Pour un client »), `remove` `--border-strong` (non autorisé). Défilement horizontal interne sous 640 px.
- **Parcours** : une carte par parcours : chip `P-…`, titre 16/600, acteur, à droite « Fonctionnalités : F-001, F-004 » ; **étapes en ligne** (cartes 150 px sur `--surface` : « Étape n », libellé 13/600, chip d'écran `S-…`) reliées par des flèches `arrow_forward`, retour à la ligne si nécessaire ; **cas d'erreur** dessous (fond erreur clair, icône `subdirectory_arrow_right`, « Étape 4 : créneau pris entre-temps → retour à l'étape 3… (F-001 · AC-2, R-001) »).

### 4.5 Vue client · validation
- **Bandeau** ambre sous l'en-tête : icône `fact_check`, « **Votre validation est attendue.** Relisez chaque onglet : les fonctionnalités et les parcours un par un, les règles et les rôles en bloc. Le cahier est validé quand tout l'est. » + progression.
- **Fonctionnalités : une par une**. Fiche en langage simple : titre « Ce qui doit se passer », chaque critère reformulé « Si <étant donné> et que <quand>, alors <alors>. » (icône `check`) ; « En lien avec » montre les liens avec leur libellé (« R-002 Délai d'annulation »), sans codes seuls ; pas de jauge d'avancement ni de pied technique. Actions : **« Valider »** (principal, 40 px) et **« Demander un changement »** (ouvre « Que faut-il changer ? » + champ texte + « Envoyer à l'équipe » / « Annuler »). Note 12 px : « Votre validation porte sur la version du <date> · <sha>. Si l'équipe modifie ensuite la fonctionnalité, elle vous sera re-présentée. » Après décision, passage automatique à la suivante non traitée.
- **Parcours : un par un**. Sous chaque carte de parcours : « Ce parcours correspond-il à ce que vivent vos clients ? » + « Valider ce parcours » / « Demander un changement » (champ propre au parcours). Après décision : ligne de confirmation verte « Parcours validé. » ou rouge « Changement demandé à l'équipe pour ce parcours. » + « Annuler ».
- **Règles métier et Rôles et permissions : en bloc**. Barre en bas de l'onglet (fond `--surface`) : « Ces 4 règles décrivent-elles bien votre activité ? » / « Ces rôles et permissions correspondent-ils à votre organisation ? » + « Valider les règles » / « Valider les rôles » + « Demander un changement ». Après décision : ligne de confirmation + « Annuler ».
- Le client ne voit jamais les propositions en attente, ni « Proposer avec l'agent », ni « Modifier ».
- **« Valider le cahier »** : actif quand tout est traité et qu'il n'y a aucune demande de changement ; pose la validation sur la version courante (commit) et passe le livrable en « Validé ». **« Envoyer mes demandes »** : envoie les demandes à l'équipe (notification, activité de la vue d'ensemble), le livrable passe en « À revoir » côté équipe, avec les commentaires attachés aux éléments.

## 5. Validation liée à une version (socle commun)

- Chaque validation (élément, parcours, bloc, cahier) enregistre : qui, quand, le **SHA du commit** de la spec, la décision, le commentaire éventuel (entité `Review` de la conception §3).
- Toute modification d'un élément validé **invalide sa validation** : il repasse « À valider » et le client le revoit (bandeau « 2 éléments ont changé depuis votre validation »). Une modification dans un bloc (règles, rôles) invalide le bloc.
- Le livrable est « Validé » quand toutes les validations sont posées sur la version courante.

## 6. Modèle de spec (dépôt) et contrat

Fichiers (conception v0.6 §4) : `features/F-nnn-<slug>.md`, `domain/rules/R-nnn-<slug>.md` (en-tête : `type: constraint | calc | workflow`, `etats` pour un workflow, `fonctionnalites`), `domain/roles.yaml` (rôles, permissions `PM-ressource.action`, restrictions), `design/flows/P-<slug>.json` (étapes, écrans, cas d'erreur, fonctionnalités).

| Procédure | Entrée → sortie |
|---|---|
| `spec.deliverables` | `projectId` → les 6 entrées : statut, disponibilité, condition, propositions en attente, `staleBecause?` |
| `spec.functional.get` | `projectId, tab` → éléments de l'onglet + statut de validation par élément / bloc |
| `ai.proposeDeliverable` | `projectId, deliverable: 'functional', mode: 'initial' \| 'update'` → propositions typées (feature, rule, role, flow) |
| `ai.reviseProposal` | `proposalId, instruction` → proposition révisée |
| `proposal.decide` | `proposalId, decision, edited?` (décisions persistées côté serveur ; unifie `idea.proposal.decide`) |
| `specBatch.submit` | opérations `feature.create`, `rule.create`, `role.create`, `flow.create` (+ `update`) des propositions acceptées, en un lot |
| `review.submit` | `projectId, target: { kind: 'feature' \| 'flow' \| 'rules' \| 'roles' \| 'deliverable', id? }, decision: 'approve' \| 'request_change', comment?, commitSha` |
| `review.list` | `projectId, deliverable` → validations et demandes, pour l'équipe et le client |

Validation des sorties : un schéma Zod par type ; une proposition invalide est écartée côté serveur (« 1 proposition inutilisable a été écartée ») ; références vérifiées à l'enregistrement (écran, règle, rôle cités doivent exister ou être dans le même lot).

## 7. Impact amont (socle commun)

Quand un livrable enregistré ou le dossier figé change (`idea-v2`), les livrables qui en dépendent passent « À revoir » : badge ambre dans la barre, `InlineAlert` attention sous leur en-tête (« Le dossier d'idée a changé (idea-v2) : 2 pages modifiées »), action principale « Proposer les mises à jour » (`mode: 'update'` : l'agent ne propose que ce qui découle du changement, en différences). Pour le Fonctionnel, la source amont est le dossier d'idée.

## 8. Droits

| Action | Owner, admin, développeur | Designer | Client | Business |
|---|---|---|---|---|
| Lire | Oui | Oui | Oui (vue client) | Oui (vue client, sans validation) |
| Proposer avec l'agent, relire, enregistrer, modifier | Oui | Oui (règles d'écriture de la spec par type) | Non | Non |
| Valider, demander un changement | Non | Non | **Oui** | Non |
| Relancer le client | Owner, admin | Non | — | — |

## 9. Responsive et accessibilité

- **< 1280 px** : la fiche ancrée devient un panneau superposé à droite. **< 1024 px** : relecture et liste en navigation empilée (liste → détail plein écran avec « ← Liste ») ; bandeaux collants ; grille des règles en 1 colonne ; matrice des rôles en défilement horizontal ; étapes de parcours en colonne verticale. **< 768 px** : boutons 44 px, onglets en défilement horizontal.
- Onglets : `nav` nommée, onglet actif `aria-current`. Matrice des rôles : vrai `table` avec `caption`, `th scope="col"` et `scope="row"`, chaque cellule a un texte lisible (« autorisé », « autorisé : les siennes », « non autorisé ») en plus de l'icône. Parcours : `ol` d'étapes, flèches décoratives. États d'un workflow : liste lue dans l'ordre.
- Raccourcis J / K / A / R uniquement hors champ de saisie. Changements d'état annoncés dans une région `role="status"` unique.
- Contrastes AA clair et sombre ; axe sans violation sur chaque état et chaque onglet.

## 10. Critères d'acceptation

- [ ] Assistant retiré, redirections `/framing` et `/features` ; barre « Spec » conforme au fichier de décisions.
- [ ] 5 états de la page ; 4 onglets avec leurs vues dédiées (liste + fiche, cartes de règles, matrice des rôles, parcours en étapes).
- [ ] Relecture générique (`ProposalReview`) sur les 4 types, enregistrement groupé en un lot avec récapitulatif.
- [ ] Vue client : fonctionnalités et parcours un par un, règles et rôles en bloc, « Valider le cahier » / « Envoyer mes demandes », validations liées au commit et invalidées par une modification.
- [ ] `spec.deliverables`, `proposal.decide`, `review.*` et l'impact amont prêts pour les lots suivants.
- [ ] Captures : chaque état × chaque onglet, équipe et client, clair, sombre, 375 px.

## 11. Tickets à ajouter au sprint (format du vault)

```
- [ ] **[TK-?]** Lot 5a · Spec · Fonctionnel : socle (spec.deliverables, barre « Spec », retrait de l'Assistant et redirections, ProposalReview générique, proposal.decide unifié, ai.proposeDeliverable 'functional', specBatch groupé), états Prêt / Génération / Relecture, onglet Fonctionnalités en liste + fiche. Réf. design/refonte/lot-5-fonctionnel-passation.md §1 à §4.4 (Fonctionnalités), §6, §7. `pkg:api` `pkg:contract` `pkg:web` — dépend des lots 2c et 3
- [ ] **[TK-?]** Lot 5b · Spec · Fonctionnel : onglets Règles métier (cartes, workflow dessiné), Rôles et permissions (cartes + matrice), Parcours (étapes + cas d'erreur), en relecture et en liste ; fichiers domain/rules, domain/roles.yaml, design/flows. Réf. §4.3, §4.4, §6. — dépend de 5a
- [ ] **[TK-?]** Lot 5c · Spec · Fonctionnel : vue client et validation (fonctionnalités et parcours un par un, règles et rôles en bloc, Valider le cahier / Envoyer mes demandes), review.submit / review.list, validations liées au commit et invalidées par modification, « Relancer ». Réf. §4.5, §5, §8. — dépend de 5b
```

## 12. Questions ouvertes (non bloquantes)

- Commentaires du client sur une sélection de texte (comme dans l'espace Idée) en plus des demandes de changement : à prévoir avec les commentaires génériques.
- Signature du cahier validé (nom, date, version) dans l'export du livrable : avec l'export, plus tard.
