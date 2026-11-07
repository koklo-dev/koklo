# Refonte UI · Lot 7 · Spec · Architecture : passation à l'agent dev

> Validé par Brice le 05/11/2026 après recette visuelle.
> Maquette de référence : canevas « Koklo — maquettes » (copie locale qui fait foi : `docs/refonte/maquettes/13-Lot7Architecture.html` ; lire le code avec `pnpm maquette <numéro>`), planche **Lot 7 · Architecture (tous les états)**. Deux sélecteurs en pointillés propres à la maquette : l'état (Prêt, Génération, Relecture, Liste · équipe, À revoir, Vue client) et le volume (Démo / **Volume réel**, référence d'implémentation). Onglets, zones, composants, zoom, décisions, flux et vues Fiche / YAML / Mermaid sont cliquables ; en relecture, Accepter / Rejeter / Accepter les N fonctionnent ; en liste, « Valider l'architecture » fonctionne.
> À lire avant : `decisions-2026-11-05-spec-sans-brief.md`, `lot-5-fonctionnel-passation.md` (socle : `ProposalReview`, `SpecCollection`, `SpecDocument`, validation liée au commit, impact amont), `lot-6-donnees-passation.md` (lecteur de diagramme, zoom, Fiche / YAML / Mermaid), `principe-listes-longues.md`, `lots-5-6-volume-reel-passation.md`.
> Prérequis : lots 5 et 6, ticket « Socle listes longues ».

Ce lot livre la page **Spec · Architecture** (route `/projects/[id]/spec/architecture`) : comment le produit est construit. Proposée par l'agent depuis le cahier fonctionnel et le modèle de données, relue par l'équipe, **validée par l'équipe** (le client lit et commente). Disponible quand les Données sont validées ; sa validation débloque **4 Technique**.

## 1. Format dans le dépôt de spec

| Fichier | Contenu | Rôle |
|---|---|---|
| `architecture/components/<slug>.yaml` | un composant | **source de vérité** |
| `architecture/actors.yaml` | acteurs (dérivés des rôles `RL-…`) | source |
| `architecture/flows/<P-id>.yaml` | un flux (séquence) par parcours | source |
| `architecture/adr/ADR-nnn-<slug>.md` | une décision d'architecture | source |
| `architecture/overview.md` | document de vue d'ensemble | source (`SpecDocument`) |
| `architecture/_zones.yaml` | zones (mêmes identifiants que `data/_zones.yaml`) | source |
| `architecture/schema.mmd`, `architecture/flows/<P-id>.mmd` | Mermaid (`flowchart`, `sequenceDiagram`) | **générés** à chaque `specBatch.submit` |
| `architecture/_layout.yaml` | positions dans le schéma | écrit au glisser, sans relecture |

Composant (schéma Zod ; invalide → proposition écartée ; références vérifiées à l'enregistrement) :

```yaml
id: C-api
nom: API
type: service          # app | service | store | queue | ext
zone: rdv
responsabilite: >
  Cœur du produit : règles métier, réservations, créneaux, services.
possede: [T-reservation, T-creneau, T-service, T-client]   # tables du lot 6
sert: [F-001, F-002, F-004, F-006]
depend_de:
  - vers: C-db
    via: "SQL"
  - vers: C-queue
    via: "planifie"
    mode: asynchrone
decisions: [ADR-001, ADR-002, ADR-007]
resume_client: >        # « En clair » de la vue client
  Le moteur qui applique vos règles.
```

Règles vérifiées par le serveur (avertissements dans la relecture, pas de blocage) : chaque table du lot 6 est **possédée par un seul composant** ; chaque fonctionnalité est servie par au moins un composant ; un composant `ext` ne possède pas de table ; pas de dépendance circulaire synchrone.

Flux : `participants` (acteurs et composants), `messages` (`de`, `vers`, `texte`, `retour?`, `erreur?`), blocs `alt` (libellé + messages) et `separateur` (libellé), `liens` (F, R, ADR). Décision : en-tête `statut: proposee | acceptee | remplacee`, `remplacee_par?`, `date`, `decideurs`, `liens` ; sections Contexte, Décision, Conséquences (positives, à accepter), Alternatives écartées (nom + raison), En clair.

## 2. En-tête

- Ligne 1 : « <projet> / Spec / Architecture ». Ligne 2 : h1 « Architecture », statut, résumé, actions :

| État | Statut | Résumé | Actions |
|---|---|---|---|
| Prêt | Prêt | « Le fonctionnel et les données sont validés » | aucune (dans l'état vide) |
| Génération | Génération | « Depuis le fonctionnel et les données » | Ajouter · « Proposer avec l'agent » désactivé |
| Relecture | En cours | « N propositions à relire » | Ajouter · Reproposer |
| Liste | « Validation de l'équipe · le client lit et commente » puis « Validé par l'équipe » (vert) | « 34 composants · 23 décisions · 18 flux » / « Validé par <prénom> le <date> · version <sha> » | Proposer avec l'agent · action selon l'onglet (Nouveau composant / Modifier le document / Nouvelle décision / Nouveau flux) · **« Valider l'architecture »** (`verified`) |
| À revoir | « À revoir » (ambre, `sync_problem`) | « Validé le <date>, le modèle de données a changé depuis » | action selon l'onglet · **« Proposer les mises à jour »** |
| Vue client | « Validé par l'équipe » | « … · lecture seule » | Commenter |

- Ligne 3 : onglets **Schéma** (`hub`), **Document** (`description`), **Composants** (`widgets`, compteur), **Décisions** (`gavel`, compteur), **Flux** (`swap_horiz`, compteur). En relecture, **Relecture** (`rate_review`, compteur sur `--primary`) devant, équipe seulement (comme au lot 6).

## 3. États

- **Prêt** : `EmptyState` `account_tree`, « L'agent peut proposer l'architecture », « À partir du cahier fonctionnel et du modèle de données validés : les composants et leurs responsabilités, le schéma d'ensemble, les flux des parcours principaux et les décisions d'architecture argumentées. Vous relisez tout avant que rien n'entre dans la spec. », « Proposer l'architecture » / « Écrire à la main ».
- **Génération** : bandeau « L'agent rédige l'architecture zone par zone : composants, flux, décisions. Les premières propositions arrivent avant la fin. » ; squelette du schéma (7 cadres). Génération par lots (principe §1.4) : la relecture peut commencer avant la fin.
- **Relecture** : bandeau avec barre de progression ; onglet Relecture **groupé par type** (Document · vue d'ensemble, Composants, Flux, Décisions) dès 30 propositions, avec filtres, « Accepter les N », « Afficher 20 de plus ». Détail selon le type : section de document en **texte ajouté** (fond vert clair, filet gauche vert 3 px) ou différences en mode `update` ; composant (Responsabilité, Possède, Dépend de) ; flux (messages numérotés) ; décision (Contexte, Décision, Alternatives). Champ « Demander une modification à l'agent » avec une suggestion adaptée au type. Dans le schéma, un composant à relire a un contour pointillé.
- **Liste · équipe** : §4.
- **À revoir** (impact amont) : `InlineAlert` attention (`role="alert"`) : « **Le modèle de données a changé depuis la validation (version 5e91c02).** T-avis ajoutée, T-rappel modifiée. Sont concernés : C-api, C-worker, P-reserver, surlignés dans le schéma. » + « Voir les changements » (diff du lot 6) + « Proposer les mises à jour » (`mode: 'update'`). Composants concernés : contour 2 px ambre dans le schéma, encadré ambre dans leur fiche (« T-avis doit être possédée par un composant »). Barre : Architecture « À revoir » (ambre), Données « Modifié ». Sources amont : fonctionnalités, règles et rôles (lot 5), tables (lot 6).
- **Vue client** : bandeau `role="note"` « **Lecture seule.** L'architecture décrit comment le produit est construit. Elle est validée par l'équipe ; vous pouvez la lire et poser vos questions en commentaire. » ; pas de YAML / Mermaid, pas de Modifier ; fiches en « En clair » ; « Commenter » sur un composant, une décision ou un flux.

## 4. Onglets

### 4.1 Schéma (par défaut)
- **Lecteur** du lot 6 (pleine hauteur, trame de points, zoom en bas à droite, mini-carte en bas à gauche, niveau de détail sous 60 %).
- **Au-delà de 25 composants**, ouverture sur la **vue des zones** (mêmes zones que les données) : carte de zone (nom, « 9 composants · 3 acteurs · cliquez pour ouvrir », noms des 5 premiers composants + « +N »), liens entre zones « 5 liens ». Fil « Toutes les zones · 34 composants / Prise de rendez-vous · 9 composants · 3 acteurs · 21 liens vers d'autres zones » et « Aller à un composant… » (`/`).
- **Zone ouverte** : 4 **couches** horizontales (bandes séparées par un trait pointillé, une sur deux teintée `rgba(127,110,220,.04)`, libellé en capitales 10 px à droite) : Utilisateurs, Applications, Services, Données et services externes.
- **Formes par type** (tuile icône 32 px + nom 13/600 + type 11 px) : acteur = pilule 160 × 52 (`person`, `support_agent`, `shield_person`) ; application 220 × 70 (`smartphone`, `desktop_windows`) ; service 200 × 70 ; stockage rayon 14 (`database`) ; file (`queue`) ; **externe** sur `--surface`, contour pointillé `--border-strong` (`sms`, `mail`). Sélection : contour 2 px `--primary`, tuile `--primary`.
- **Liens** : flèches SVG coupées au bord des cadres, étiquette du moyen (« HTTPS · contrat typé », « SQL », « jetons », « planifie », « consomme », « API SMS ») au milieu ; **asynchrone en pointillés** ; les liens du composant sélectionné passent en `--primary` 2 px. Légende au-dessus : acteur, application, service, stockage, externe, asynchrone.
- Dans une zone autre que la principale, les dépendances vers un composant d'une autre zone apparaissent comme un cadre estompé en pointillés (« API · zone Prise de rendez-vous ») qui ouvre l'autre zone au clic.
- **Fiche du composant** (340–400 px) : id + type en pastille + Modifier ; nom ; **Fiche · YAML · Mermaid** (équipe) ; responsabilité ; groupes de puces : **Possède les données** (T-…), **Sert les fonctionnalités** (F-… + libellé), **Dépend de** (C-… + moyen, « · asynchrone »), **Décisions** (ADR-…). YAML = `architecture/components/<slug>.yaml` (« Source de vérité ») ; Mermaid = `architecture/schema.mmd` (« Généré »).

### 4.2 Document
`SpecDocument` (éditeur et panneau d'agent du lot 2) sur `architecture/overview.md`, colonne de lecture 760 px max : ligne de source (chemin, version, dernier auteur), sections h2 18/600 et texte 15 px / 1,65 : Contexte, Vue d'ensemble (avec **encart** « Schéma généré depuis les fichiers architecture/components/*.yaml · 34 composants en 6 zones » + « Ouvrir le schéma »), Principes (liste), Déploiement, Sécurité et données personnelles. Colonne droite : **Sommaire** (liens d'ancre), **Demander à l'agent** (champ ; la réponse est une proposition de section relue avant enregistrement), **Cité dans le document** (puces ADR, NFR, R).

### 4.3 Composants
Barre de compte + recherche ; tableau (en-tête collant, défilement interne) : Composant (chip + nom), Type (pastille ; externe en pointillé), Zone, Responsabilité (une ligne, ellipse), Dépend de (nombre), Décisions. Clic sur une ligne → Schéma, zone du composant, composant sélectionné. Liste en 1.1 du principe (pages de 50).

### 4.4 Décisions
- Liste (420–520 px) : recherche, filtres en puces pointillées (Statut, Composant, Date), barre de compte « 23 décisions · 19 acceptées · 3 proposées » ; lignes : chip ADR, titre, « date · liens », statut en pastille (**Acceptée** vert, **Proposée** ambre, **Remplacée** contour, ligne à 70 %).
- Fiche : id, statut, « date · décideurs », Modifier ; titre 22/600 ; encadré « Remplacée par ADR-003 le 29 oct. » si besoin ; **Contexte**, **Décision** (h3 15/600 + texte 14 px) ; **Conséquences** (`add_circle` vert « Positif : », `do_not_disturb_on` ambre « À accepter : ») ; **Alternatives écartées** (cartes bordées, `block`, « **Nom** · raison ») ; liens ; pied « Enregistrée dans la spec · architecture/adr/ADR-nnn-<slug>.md ».
- Vue client : encadré **En clair** (`--surface`) en tête, puis le reste en lecture.

### 4.5 Flux
- Liste (260–320 px) : barre de compte « 18 flux · un par parcours », lignes : chip P-…, titre, « acteur · nombre de composants ».
- **Diagramme de séquence** (cadre `--surface`, défilement horizontal si besoin) : en-têtes de participants 112 × 36 (pilule pour un acteur, pointillé pour un externe, icône + nom 12/600), lignes de vie pointillées `--border-strong` ; messages numérotés (n° mono 10 px), **appel** trait plein `--foreground` flèche pleine, **retour** pointillé `--muted-foreground` ; bloc **alt** (cadre arrondi pointillé, fond rouge pâle, étiquette « sinon · créneau pris entre-temps (F-001 · AC-2) ») ; **séparateur** pleine largeur (« La veille à 18 h »). Puces de liens dessous (F, R, ADR).
- Sélecteur **Diagramme · Mermaid** (équipe) : `sequenceDiagram` généré (`architecture/flows/<P-id>.mmd`), source `architecture/flows/<P-id>.yaml`.
- Chaque parcours du lot 5 a un flux ; un parcours sans flux est signalé dans la relecture (« P-payer n'a pas de flux »).

## 5. Validation et barre

- « Valider l'architecture » : owner, admin, développeur ; validation `deliverable` sur le commit courant ; statut « Validé par l'équipe » ; **4 Technique** passe « Prêt » ; compteur Spec 3/6. Toute modification invalide la validation ; un changement amont fait passer l'architecture « À revoir » (§3).
- Barre : « 3 Architecture » : Prêt / … / N à relire / En cours / Validé / À revoir ; cadenas « Disponible après les données » tant que le modèle n'est pas validé.

## 6. Contrat

| Procédure | Usage |
|---|---|
| `spec.architecture.zones({ projectId })`, `.zone({ zone })`, `.search({ q })` | schéma (vue des zones, zone, Aller à un composant) |
| `spec.architecture.components.list({ q?, zone?, cursor?, limit })` | onglet Composants |
| `spec.architecture.adr.list({ q?, status?, cursor?, limit })`, `.adr.byId` | Décisions |
| `spec.architecture.flows.list(...)`, `.flows.byId` | Flux |
| `spec.architecture.document()` | overview.md (SpecDocument) |
| `spec.architecture.mermaid({ target: 'schema' \| flowId })` | vues Mermaid |
| `spec.architecture.layout.save({ positions })` | glisser |
| `ai.proposeDeliverable({ deliverable: 'architecture', mode })` | propositions typées `component`, `flow`, `adr`, `doc_section` |
| `specBatch.submit` | `component.*`, `flow.*`, `adr.*`, `doc.section.*` ; régénère les `.mmd` dans le même commit |
| `spec.architecture.checks()` | avertissements (table sans propriétaire, fonctionnalité non servie, parcours sans flux, cycle synchrone) |

## 7. Droits

| Action | Owner, admin, développeur | Designer | Client | Business |
|---|---|---|---|---|
| Lire (schéma, document, composants, décisions, flux) | Oui | Oui | Oui (vue client) | Oui (vue client) |
| YAML / Mermaid | Oui | Oui | Non | Non |
| Proposer, relire, modifier, déplacer | Oui | Non | Non | Non |
| Valider l'architecture | Oui | Non | Non | Non |
| Commenter | Oui | Oui | Oui | Oui |

## 8. Responsive et accessibilité

- **< 1280 px** : fiches en panneau superposé ; **< 1024 px** : Schéma remplacé par défaut par Composants (schéma accessible, « Ajuster » appliqué), séquence en défilement horizontal, Décisions et Flux en navigation empilée (liste → détail « ← Liste ») ; **< 768 px** : commandes 44 px, glisser désactivé.
- Alternatives textuelles : le schéma a l'onglet Composants + les dépendances listées dans chaque fiche ; chaque nœud est un `button` (`aria-pressed`, « Service API ») ; le diagramme de séquence a `role="img"` + `aria-label` (« Diagramme de séquence Réserver un rendez-vous, 12 messages ») et la **liste numérotée des messages** dans un `details` « Lire les messages » sous le diagramme ; SVG `aria-hidden`.
- Statuts de décision et types de composant toujours écrits (jamais la seule couleur ou forme). Texte brut pour toute sortie du modèle. Contrastes AA, axe sans violation.

## 9. Critères d'acceptation

- [ ] 6 états, 5 onglets (+ Relecture en relecture), volume réel conforme à la planche (34 composants, 6 zones, 23 décisions, 18 flux, 80 propositions).
- [ ] Schéma en couches avec formes par type, liens étiquetés et asynchrones, vue des zones, zone voisine estompée, zoom, niveau de détail, mini-carte, Fiche / YAML / Mermaid.
- [ ] Décisions avec statuts (dont Remplacée), conséquences et alternatives ; vue client « En clair ».
- [ ] Diagramme de séquence avec retours, bloc alt et séparateur ; Mermaid généré ; alternative textuelle.
- [ ] Vérifications d'architecture (§1) affichées en relecture.
- [ ] Impact amont « À revoir » depuis les lots 5 et 6 ; validation équipe liée au commit, déblocage de Technique.
- [ ] Captures : chaque état × onglet, équipe et client, clair, sombre, 375 px, vue des zones, zone ouverte, zoom 50 %.

## 10. Tickets (format du vault)

```
- [ ] **[TK-?]** Lot 7a · Spec · Architecture : formats architecture/* (Zod, références, vérifications), génération schema.mmd et flows/*.mmd, ai.proposeDeliverable 'architecture', états Prêt / Génération / Relecture (groupée par type), onglets Document (SpecDocument) et Composants. Réf. design/refonte/lot-7-architecture-passation.md §1 à §4.3, §6. `pkg:api` `pkg:contract` `pkg:web` — dépend des lots 6 et du socle listes longues
- [ ] **[TK-?]** Lot 7b · Spec · Architecture : Schéma (couches, formes, liens, vue des zones, zone voisine, fiche Fiche / YAML / Mermaid, glisser), Flux (diagramme de séquence, alt, séparateur, Mermaid, alternative textuelle). Réf. §4.1, §4.5, §8. — dépend de 7a
- [ ] **[TK-?]** Lot 7c · Spec · Architecture : Décisions (liste, fiche, statuts, remplacement), validation par l'équipe, état À revoir (impact amont lots 5-6), vue client En clair et commentaires. Réf. §3, §4.4, §5, §7. — dépend de 7b
```

## 11. Questions ouvertes (non bloquantes)

- Niveau C4 « code » (classes, modules internes) : hors cadrage, à générer plus tard depuis le dépôt de code.
- Choix des technologies (base, hébergement, fournisseur SMS) : lot 8 Technique ; l'architecture reste neutre (types de composants, pas de produits), sauf décision explicite en ADR.
